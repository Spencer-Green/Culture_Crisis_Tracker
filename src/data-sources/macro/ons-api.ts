import { z } from "zod";

import type { OnsMetricDefinition } from "@/data-sources/macro/ons-metrics";
import {
  fetchText,
  HttpRequestError,
  type FetchImplementation,
  type FetchTextResult,
} from "@/lib/http";

const onsSearchItemSchema = z.object({
  type: z.literal("timeseries"),
  cdid: z.string(),
  dataset_id: z.string(),
  edition: z.string().optional().default(""),
  release_date: z.string().datetime().optional(),
  title: z.string(),
  uri: z.string().startsWith("/"),
});

const onsSearchResponseSchema = z.object({
  items: z.array(onsSearchItemSchema),
});

export type OnsResolvedSeries = {
  cdid: string;
  title: string;
  datasetId: string;
  edition: string | null;
  uri: string;
  releaseDate: string | null;
};

export type OnsRequestOptions = {
  fetchImplementation?: FetchImplementation;
  timeoutMs?: number;
  sleep?: (milliseconds: number) => Promise<void>;
  maxRetryDelayMs?: number;
};

function parseJson(body: string): unknown {
  try {
    return JSON.parse(body);
  } catch {
    throw new Error("ONS returned malformed JSON.");
  }
}

export function buildOnsSearchUrl(baseUrl: string, cdid: string): URL {
  const url = new URL("search", `${baseUrl.replace(/\/+$/, "")}/`);
  url.searchParams.set("content_type", "timeseries");
  url.searchParams.set("cdids", cdid);
  return url;
}

export function buildOnsDataUrl(baseUrl: string, uri: string): URL {
  const url = new URL("data", `${baseUrl.replace(/\/+$/, "")}/`);
  url.searchParams.set("uri", uri);
  return url;
}

export function resolveOnsSeries(
  body: string,
  metric: OnsMetricDefinition,
): OnsResolvedSeries {
  const response = onsSearchResponseSchema.parse(parseJson(body));
  const matches = response.items.filter(
    (item) =>
      item.cdid.toUpperCase() === metric.cdid &&
      item.dataset_id === metric.datasetId,
  );

  if (matches.length !== 1) {
    throw new Error(
      `ONS search returned ${matches.length} CT mappings for CDID ${metric.cdid}; expected exactly one.`,
    );
  }

  const match = matches[0];
  if (match.title !== metric.expectedTitle) {
    throw new Error(
      `ONS title mismatch for CDID ${metric.cdid}; the implemented mapping requires "${metric.expectedTitle}".`,
    );
  }

  return {
    cdid: match.cdid,
    title: match.title,
    datasetId: match.dataset_id,
    edition: match.edition || null,
    uri: match.uri,
    releaseDate: match.release_date ?? null,
  };
}

async function defaultSleep(milliseconds: number): Promise<void> {
  await new Promise((resolve) => setTimeout(resolve, milliseconds));
}

export async function fetchOnsJson(
  url: URL,
  options: OnsRequestOptions = {},
  maxResponseBytes = 250_000,
): Promise<FetchTextResult> {
  const sleep = options.sleep ?? defaultSleep;
  const maxRetryDelayMs = options.maxRetryDelayMs ?? 30_000;

  try {
    return await fetchText(url, {
      accept: "application/json",
      acceptedContentTypes: ["application/json"],
      timeoutMs: options.timeoutMs ?? 10_000,
      maxResponseBytes,
      fetchImplementation: options.fetchImplementation,
    });
  } catch (error) {
    if (
      !(error instanceof HttpRequestError) ||
      error.status !== 429 ||
      error.retryAfterMs === undefined ||
      error.retryAfterMs > maxRetryDelayMs
    ) {
      throw error;
    }

    await sleep(error.retryAfterMs);
    return fetchText(url, {
      accept: "application/json",
      acceptedContentTypes: ["application/json"],
      timeoutMs: options.timeoutMs ?? 10_000,
      maxResponseBytes,
      fetchImplementation: options.fetchImplementation,
    });
  }
}

export async function discoverOnsSeries(
  baseUrl: string,
  metric: OnsMetricDefinition,
  options: OnsRequestOptions = {},
): Promise<OnsResolvedSeries> {
  const response = await fetchOnsJson(
    buildOnsSearchUrl(baseUrl, metric.cdid),
    options,
    100_000,
  );
  return resolveOnsSeries(response.body, metric);
}

export async function fetchOnsSeriesData(
  baseUrl: string,
  series: OnsResolvedSeries,
  options: OnsRequestOptions = {},
): Promise<FetchTextResult> {
  return fetchOnsJson(buildOnsDataUrl(baseUrl, series.uri), options);
}
