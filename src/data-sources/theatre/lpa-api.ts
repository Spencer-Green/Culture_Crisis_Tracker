import {
  parseLPAArchiveIndex,
  parseLPAReportBundle,
  parseLPAReportBundleUrl,
} from "@/data-sources/theatre/lpa-parser";
import type { LPAArchiveReport } from "@/data-sources/theatre/lpa-types";
import type { FetchImplementation } from "@/lib/http";

export class LPAResponseError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "LPAResponseError";
  }
}

export function validateLPAUrl(value: string) {
  const url = new URL(value);
  if (
    url.protocol !== "https:" ||
    url.hostname !== "reports.liveperformance.com.au"
  )
    throw new LPAResponseError(
      "LPA retrieval requires the official HTTPS reports host.",
    );
  url.hash = "";
  return url.toString();
}

async function fetchText(
  url: string,
  options: {
    fetchImplementation?: FetchImplementation;
    timeoutMs?: number;
    maximumBytes: number;
    accept: string;
  },
) {
  const safeUrl = validateLPAUrl(url);
  const controller = new AbortController();
  const timeout = setTimeout(
    () => controller.abort(),
    options.timeoutMs ?? 15_000,
  );
  try {
    const response = await (options.fetchImplementation ?? fetch)(safeUrl, {
      headers: {
        Accept: options.accept,
        "User-Agent": "CultureCrisisTracker/0.1.0",
      },
      redirect: "error",
      signal: controller.signal,
    });
    if (!response.ok)
      throw new LPAResponseError(
        `LPA public report returned HTTP ${response.status}.`,
      );
    const text = await response.text();
    if (!text || Buffer.byteLength(text) > options.maximumBytes)
      throw new LPAResponseError("LPA returned an invalid response size.");
    return text;
  } catch (error) {
    if (error instanceof LPAResponseError) throw error;
    if (error instanceof Error && error.name === "AbortError")
      throw new LPAResponseError("LPA public report retrieval timed out.");
    throw new LPAResponseError("LPA public report retrieval failed.");
  } finally {
    clearTimeout(timeout);
  }
}

export async function fetchLPAArchiveReports(
  archiveUrl: string,
  options: {
    fetchImplementation?: FetchImplementation;
    timeoutMs?: number;
  } = {},
) {
  const safeArchiveUrl = validateLPAUrl(archiveUrl);
  const html = await fetchText(safeArchiveUrl, {
    ...options,
    maximumBytes: 250_000,
    accept: "text/html",
  });
  return {
    archiveUrl: safeArchiveUrl,
    reports: parseLPAArchiveIndex(html, safeArchiveUrl),
  };
}

export async function inspectLPA(
  archiveUrl: string,
  options: {
    fetchImplementation?: FetchImplementation;
    timeoutMs?: number;
  } = {},
) {
  const startedAt = Date.now();
  const archive = await fetchLPAArchiveReports(archiveUrl, options);
  const report = archive.reports.at(-1) as LPAArchiveReport;
  const reportHtml = await fetchText(report.reportUrl, {
    ...options,
    maximumBytes: 250_000,
    accept: "text/html",
  });
  const bundleUrl = validateLPAUrl(
    parseLPAReportBundleUrl(reportHtml, report.reportUrl),
  );
  const bundle = await fetchText(bundleUrl, {
    ...options,
    maximumBytes: 1_000_000,
    accept: "text/javascript, application/javascript",
  });
  return parseLPAReportBundle(bundle, {
    archiveUrl: archive.archiveUrl,
    report,
    bundleUrl,
    latencyMs: Date.now() - startedAt,
  });
}
