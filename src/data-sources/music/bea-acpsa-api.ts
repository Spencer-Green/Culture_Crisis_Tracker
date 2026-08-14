import {
  BEA_ACPSA_NATIONAL_ARCHIVE_URL,
  type BEAACPSAInspection,
} from "@/data-sources/music/bea-acpsa-types";
import { parseBEAACPSANationalArchive } from "@/data-sources/music/bea-acpsa-parser";
import type { FetchImplementation } from "@/lib/http";

export class BEAACPSAResponseError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "BEAACPSAResponseError";
  }
}

export function validateBEAACPSAArchiveUrl(value: string) {
  const url = new URL(value);
  if (
    url.protocol !== "https:" ||
    url.hostname !== "apps.bea.gov" ||
    url.pathname !== "/regional/zip/acpsanational.zip"
  )
    throw new BEAACPSAResponseError(
      "BEA ACPSA ingestion requires the official national ZIP URL.",
    );
  url.search = "";
  url.hash = "";
  return url.toString();
}

export async function downloadBEAACPSANationalArchive(
  options: {
    fetchImplementation?: FetchImplementation;
    timeoutMs?: number;
  } = {},
) {
  const url = validateBEAACPSAArchiveUrl(BEA_ACPSA_NATIONAL_ARCHIVE_URL);
  const controller = new AbortController();
  const timeout = setTimeout(
    () => controller.abort(),
    options.timeoutMs ?? 30_000,
  );
  const startedAt = Date.now();
  try {
    const response = await (options.fetchImplementation ?? fetch)(url, {
      headers: {
        Accept: "application/zip, application/x-zip-compressed",
        "User-Agent": "CultureCrisisTracker/0.1.0",
      },
      redirect: "follow",
      signal: controller.signal,
    });
    if (!response.ok)
      throw new BEAACPSAResponseError(
        `BEA ACPSA download returned HTTP ${response.status}.`,
      );
    const bytes = new Uint8Array(await response.arrayBuffer());
    if (bytes.byteLength === 0 || bytes.byteLength > 5_000_000)
      throw new BEAACPSAResponseError(
        "BEA ACPSA returned an invalid archive size.",
      );
    return { bytes, url, latencyMs: Date.now() - startedAt };
  } catch (error) {
    if (error instanceof BEAACPSAResponseError) throw error;
    if (error instanceof Error && error.name === "AbortError")
      throw new BEAACPSAResponseError("BEA ACPSA download timed out.");
    throw new BEAACPSAResponseError("BEA ACPSA download failed.");
  } finally {
    clearTimeout(timeout);
  }
}

export async function inspectBEAACPSA(
  options: {
    fetchImplementation?: FetchImplementation;
    timeoutMs?: number;
  } = {},
): Promise<BEAACPSAInspection & { latencyMs: number }> {
  const download = await downloadBEAACPSANationalArchive(options);
  return {
    ...parseBEAACPSANationalArchive(download.bytes, download.url),
    latencyMs: download.latencyMs,
  };
}
