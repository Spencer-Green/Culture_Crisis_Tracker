import { z } from "zod";

import type { BFIDownload } from "@/data-sources/film/bfi-types";
import { fetchText, type FetchImplementation } from "@/lib/http";

export class BFIResponseError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "BFIResponseError";
  }
}

const downloadAttributesSchema = z.object({
  name: z.string(),
  downloadPath: z.string().url(),
  fileName: z.string(),
  mimeType: z.string(),
  changed: z.string().nullable().optional(),
});

function officialIndexUrl(value: string): URL {
  const url = new URL(value);
  if (url.protocol !== "https:" || url.hostname !== "www.bfi.org.uk")
    throw new BFIResponseError("BFI requests require the official HTTPS host.");
  url.search = "";
  url.hash = "";
  return url;
}

export function validateBFIDownloadUrl(value: string): string {
  const url = new URL(value);
  if (
    url.protocol !== "https:" ||
    !["www.bfi.org.uk", "core-cms.bfi.org.uk"].includes(url.hostname)
  )
    throw new BFIResponseError(
      "BFI download discovery returned an unsupported host.",
    );
  return url.toString();
}

function extractInitialState(html: string): unknown {
  const marker = "var initialPageState = ";
  const start = html.indexOf(marker);
  if (start < 0)
    throw new BFIResponseError("BFI page did not expose structured page data.");
  const remaining = html.slice(start + marker.length);
  const end = remaining.indexOf("</script>");
  if (end < 0)
    throw new BFIResponseError("BFI structured page data was incomplete.");
  try {
    return JSON.parse(remaining.slice(0, end).trim().replace(/;$/, ""));
  } catch {
    throw new BFIResponseError("BFI returned invalid structured page data.");
  }
}

function collectDownloadAttributes(value: unknown, found: unknown[] = []) {
  if (Array.isArray(value)) {
    value.forEach((entry) => collectDownloadAttributes(entry, found));
  } else if (value && typeof value === "object") {
    const record = value as Record<string, unknown>;
    if (record.attributes) found.push(record.attributes);
    Object.values(record).forEach((entry) =>
      collectDownloadAttributes(entry, found),
    );
  }
  return found;
}

function extension(fileName: string): BFIDownload["format"] | null {
  const match = fileName.toLowerCase().match(/\.(ods|xlsx|xls)$/);
  return (match?.[1] as BFIDownload["format"] | undefined) ?? null;
}

export function parseBFIDownloads(html: string): BFIDownload[] {
  const unique = new Map<string, BFIDownload>();
  for (const candidate of collectDownloadAttributes(
    extractInitialState(html),
  )) {
    const parsed = downloadAttributesSchema.safeParse(candidate);
    if (!parsed.success) continue;
    const format = extension(parsed.data.fileName);
    if (!format) continue;
    const url = validateBFIDownloadUrl(parsed.data.downloadPath);
    const publishedAt = parsed.data.changed
      ? new Date(parsed.data.changed)
      : null;
    unique.set(url, {
      name: parsed.data.name,
      url,
      fileName: parsed.data.fileName,
      format,
      mimeType: parsed.data.mimeType,
      publishedAt:
        publishedAt && !Number.isNaN(publishedAt.getTime())
          ? publishedAt
          : null,
    });
  }
  return [...unique.values()];
}

export function buildBFIWeeklyIndexUrl(baseUrl: string, year: number): string {
  const url = officialIndexUrl(baseUrl);
  if (year !== new Date().getUTCFullYear())
    url.pathname = `${url.pathname.replace(/\/$/, "")}/uk-weekend-box-office-reports-${year}`;
  return url.toString();
}

export async function fetchBFIIndexDownloads(
  url: string,
  options: {
    fetchImplementation?: FetchImplementation;
    timeoutMs?: number;
  } = {},
) {
  const response = await fetchText(officialIndexUrl(url), {
    accept: "text/html",
    acceptedContentTypes: ["text/html"],
    timeoutMs: options.timeoutMs ?? 12_000,
    maxResponseBytes: 3_000_000,
    fetchImplementation: options.fetchImplementation,
  });
  return {
    downloads: parseBFIDownloads(response.body),
    latencyMs: response.latencyMs,
  };
}

export async function downloadBFIFile(
  url: string,
  options: {
    fetchImplementation?: FetchImplementation;
    timeoutMs?: number;
  } = {},
) {
  const safeRequestUrl = validateBFIDownloadUrl(url);
  const controller = new AbortController();
  const timeout = setTimeout(
    () => controller.abort(),
    options.timeoutMs ?? 20_000,
  );
  try {
    const response = await (options.fetchImplementation ?? fetch)(
      safeRequestUrl,
      {
        headers: {
          Accept:
            "application/vnd.oasis.opendocument.spreadsheet, application/vnd.openxmlformats-officedocument.spreadsheetml.sheet, application/vnd.ms-excel",
          "User-Agent": "CultureCrisisTracker/0.1.0",
        },
        redirect: "follow",
        signal: controller.signal,
      },
    );
    if (!response.ok)
      throw new BFIResponseError(
        `BFI download failed with HTTP ${response.status}.`,
      );
    const bytes = new Uint8Array(await response.arrayBuffer());
    if (bytes.byteLength === 0 || bytes.byteLength > 10_000_000)
      throw new BFIResponseError("BFI returned an invalid spreadsheet size.");
    return { bytes, safeRequestUrl };
  } catch (error) {
    if (error instanceof BFIResponseError) throw error;
    if (error instanceof Error && error.name === "AbortError")
      throw new BFIResponseError("BFI download timed out.");
    throw new BFIResponseError("BFI download failed.");
  } finally {
    clearTimeout(timeout);
  }
}
