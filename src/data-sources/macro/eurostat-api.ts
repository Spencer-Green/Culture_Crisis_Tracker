import type { EurostatMetricDefinition } from "@/data-sources/macro/eurostat-metrics";
import { EurostatResponseError } from "@/data-sources/macro/eurostat-jsonstat";
import { fetchText, type FetchImplementation } from "@/lib/http";

export type EurostatRequestOptions = {
  fetchImplementation?: FetchImplementation;
  timeoutMs?: number;
};

function statisticsBaseUrl(baseUrl: string): string {
  const normalized = baseUrl.replace(/\/+$/, "");
  return normalized.endsWith("/statistics/1.0")
    ? normalized
    : normalized.endsWith("/dissemination")
      ? `${normalized}/statistics/1.0`
      : normalized;
}

export function buildEurostatDataUrl(
  baseUrl: string,
  metric: EurostatMetricDefinition,
  options: {
    startYear?: string;
    endYear?: string;
    lastTimePeriod?: number;
  } = {},
): URL {
  const url = new URL(
    `${statisticsBaseUrl(baseUrl)}/data/${metric.datasetCode}`,
  );
  url.searchParams.set("lang", "en");
  url.searchParams.set("freq", "A");
  url.searchParams.set("unit", metric.unitCode);
  url.searchParams.set("coicop18", metric.coicopCode);
  url.searchParams.set("geo", metric.geographyCode);
  if (options.startYear) {
    url.searchParams.set("sinceTimePeriod", options.startYear);
  }
  if (options.endYear) {
    url.searchParams.set("untilTimePeriod", options.endYear);
  }
  if (options.lastTimePeriod !== undefined) {
    url.searchParams.set("lastTimePeriod", String(options.lastTimePeriod));
  }
  return url;
}

export function buildEurostatStructureUrl(
  baseUrl: string,
  filters: Readonly<Record<string, string>>,
): URL {
  const url = new URL(`${statisticsBaseUrl(baseUrl)}/data/nama_10_cp18`);
  url.searchParams.set("lang", "en");
  for (const [key, value] of Object.entries(filters)) {
    url.searchParams.set(key, value);
  }
  return url;
}

export async function fetchEurostatJson(
  url: URL,
  options: EurostatRequestOptions = {},
): Promise<{ payload: unknown; latencyMs: number }> {
  const response = await fetchText(url, {
    accept: "application/json",
    acceptedContentTypes: ["application/json"],
    timeoutMs: options.timeoutMs ?? 15_000,
    maxResponseBytes: 4_000_000,
    fetchImplementation: options.fetchImplementation,
  });
  try {
    return {
      payload: JSON.parse(response.body),
      latencyMs: response.latencyMs,
    };
  } catch {
    throw new EurostatResponseError("Eurostat returned invalid JSON.");
  }
}
