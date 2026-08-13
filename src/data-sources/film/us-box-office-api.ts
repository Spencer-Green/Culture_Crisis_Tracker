import { z } from "zod";

import {
  US_BOX_OFFICE_DATASET_SLUG,
  US_BOX_OFFICE_DATASET_TITLE,
} from "@/data-sources/film/us-box-office-types";
import { fetchText, type FetchImplementation } from "@/lib/http";

export class USBoxOfficeResponseError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "USBoxOfficeResponseError";
  }
}

const metadataSchema = z.object({
  ref: z.string(),
  title: z.string(),
  lastUpdated: z.string(),
  licenseName: z.string().nullable().optional(),
  totalBytes: z.number().optional(),
});

function officialBase(baseUrl: string): URL {
  const url = new URL(baseUrl);
  if (
    url.protocol !== "https:" ||
    !["www.kaggle.com", "kaggle.com"].includes(url.hostname)
  )
    throw new USBoxOfficeResponseError(
      "US box-office ingestion requires the official Kaggle HTTPS API host.",
    );
  url.hostname = "www.kaggle.com";
  url.pathname = "/api/v1";
  url.search = "";
  url.hash = "";
  return url;
}

export function buildUSBoxOfficeDownloadUrl(baseUrl: string): string {
  const url = officialBase(baseUrl);
  url.pathname = `${url.pathname}/datasets/download/${US_BOX_OFFICE_DATASET_SLUG}`;
  return url.toString();
}

export function buildUSBoxOfficeMetadataUrl(baseUrl: string): string {
  const url = officialBase(baseUrl);
  url.pathname = `${url.pathname}/datasets/view/${US_BOX_OFFICE_DATASET_SLUG}`;
  return url.toString();
}

export async function fetchUSBoxOfficeMetadata(
  baseUrl: string,
  options: {
    fetchImplementation?: FetchImplementation;
    timeoutMs?: number;
  } = {},
) {
  const response = await fetchText(
    new URL(buildUSBoxOfficeMetadataUrl(baseUrl)),
    {
      accept: "application/json",
      acceptedContentTypes: ["application/json"],
      timeoutMs: options.timeoutMs ?? 10_000,
      maxResponseBytes: 250_000,
      fetchImplementation: options.fetchImplementation,
    },
  );
  let json: unknown;
  try {
    json = JSON.parse(response.body);
  } catch {
    throw new USBoxOfficeResponseError(
      "Kaggle returned invalid dataset metadata.",
    );
  }
  const parsed = metadataSchema.safeParse(json);
  if (
    !parsed.success ||
    parsed.data.ref !== US_BOX_OFFICE_DATASET_SLUG ||
    parsed.data.title !== US_BOX_OFFICE_DATASET_TITLE
  )
    throw new USBoxOfficeResponseError(
      "Kaggle returned unexpected dataset metadata.",
    );
  const lastUpdated = new Date(parsed.data.lastUpdated);
  if (Number.isNaN(lastUpdated.getTime()))
    throw new USBoxOfficeResponseError(
      "Kaggle returned an invalid update timestamp.",
    );
  return { ...parsed.data, lastUpdated, latencyMs: response.latencyMs };
}

export async function downloadUSBoxOfficeArchive(
  baseUrl: string,
  options: {
    fetchImplementation?: FetchImplementation;
    timeoutMs?: number;
  } = {},
) {
  const controller = new AbortController();
  const timeout = setTimeout(
    () => controller.abort(),
    options.timeoutMs ?? 20_000,
  );
  const startedAt = Date.now();
  try {
    const fetchImplementation = options.fetchImplementation ?? fetch;
    const safeRequestUrl = buildUSBoxOfficeDownloadUrl(baseUrl);
    const response = await fetchImplementation(safeRequestUrl, {
      headers: {
        Accept: "application/zip",
        "User-Agent": "CultureCrisisTracker/0.1.0",
      },
      redirect: "follow",
      signal: controller.signal,
    });
    if (!response.ok)
      throw new USBoxOfficeResponseError(
        `Kaggle dataset download failed with HTTP ${response.status}.`,
      );
    const contentType =
      response.headers.get("content-type")?.toLowerCase() ?? "";
    if (!contentType.includes("application/zip"))
      throw new USBoxOfficeResponseError(
        "Kaggle returned an unexpected archive type.",
      );
    const bytes = new Uint8Array(await response.arrayBuffer());
    if (bytes.byteLength === 0 || bytes.byteLength > 5_000_000)
      throw new USBoxOfficeResponseError(
        "Kaggle returned an invalid archive size.",
      );
    const updatedHeader = response.headers.get("last-modified");
    const datasetUpdatedAt = updatedHeader ? new Date(updatedHeader) : null;
    return {
      bytes,
      safeRequestUrl,
      datasetUpdatedAt:
        datasetUpdatedAt && !Number.isNaN(datasetUpdatedAt.getTime())
          ? datasetUpdatedAt
          : null,
      latencyMs: Date.now() - startedAt,
    };
  } catch (error) {
    if (error instanceof USBoxOfficeResponseError) throw error;
    if (error instanceof Error && error.name === "AbortError")
      throw new USBoxOfficeResponseError("Kaggle dataset download timed out.");
    throw new USBoxOfficeResponseError("Kaggle dataset download failed.");
  } finally {
    clearTimeout(timeout);
  }
}
