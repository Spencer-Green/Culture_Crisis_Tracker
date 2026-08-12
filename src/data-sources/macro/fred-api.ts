import type { FredMetricDefinition } from "@/data-sources/macro/fred-metrics";
import {
  fetchText,
  HttpRequestError,
  sanitiseUrl,
  type FetchImplementation,
} from "@/lib/http";

export type FredRequestOptions = {
  fetchImplementation?: FetchImplementation;
  timeoutMs?: number;
};

export type FredSeriesMetadata = {
  id: string;
  title: string;
  frequency: string;
  units: string;
  seasonalAdjustment: string;
  observationStart: string;
  observationEnd: string;
  lastUpdated: string;
  notes: string;
};

export class FredResponseError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "FredResponseError";
  }
}

function buildFredUrl(
  baseUrl: string,
  path: string,
  apiKey: string,
  parameters: Readonly<Record<string, string>>,
): URL {
  const url = new URL(`${baseUrl.replace(/\/+$/, "")}/${path}`);
  url.searchParams.set("api_key", apiKey);
  url.searchParams.set("file_type", "json");
  for (const [name, value] of Object.entries(parameters)) {
    url.searchParams.set(name, value);
  }
  return url;
}

export function buildFredSeriesUrl(
  baseUrl: string,
  apiKey: string,
  seriesId: string,
): URL {
  return buildFredUrl(baseUrl, "series", apiKey, { series_id: seriesId });
}

export function buildFredReleaseUrl(
  baseUrl: string,
  apiKey: string,
  seriesId: string,
): URL {
  return buildFredUrl(baseUrl, "series/release", apiKey, {
    series_id: seriesId,
  });
}

export function buildFredObservationsUrl(
  baseUrl: string,
  apiKey: string,
  seriesId: string,
  startDate: string,
  endDate: string,
): URL {
  return buildFredUrl(baseUrl, "series/observations", apiKey, {
    series_id: seriesId,
    observation_start: startDate,
    observation_end: endDate,
  });
}

export function sanitiseFredUrl(url: URL): string {
  return sanitiseUrl(url, ["api_key"]);
}

export function parseFredJson(body: string): Record<string, unknown> {
  let payload: unknown;
  try {
    payload = JSON.parse(body);
  } catch {
    throw new FredResponseError("FRED returned invalid JSON.");
  }
  if (!payload || typeof payload !== "object" || Array.isArray(payload)) {
    throw new FredResponseError("FRED returned an invalid response.");
  }
  const object = payload as Record<string, unknown>;
  if (typeof object.error_code === "number") {
    const message = String(object.error_message ?? "").toLowerCase();
    if (/api key|credential|registered/.test(message)) {
      throw new HttpRequestError(
        "authentication",
        "FRED authentication failed.",
        401,
      );
    }
    throw new FredResponseError("FRED rejected the requested operation.");
  }
  return object;
}

async function fetchFredJson(url: URL, options: FredRequestOptions = {}) {
  const response = await fetchText(url, {
    accept: "application/json",
    acceptedContentTypes: ["application/json"],
    timeoutMs: options.timeoutMs ?? 15_000,
    maxResponseBytes: 3_000_000,
    fetchImplementation: options.fetchImplementation,
    httpErrorKinds: { 400: "authentication" },
  });
  return {
    payload: parseFredJson(response.body),
    latencyMs: response.latencyMs,
  };
}

function requiredString(record: Record<string, unknown>, key: string): string {
  const value = record[key];
  if (typeof value !== "string") {
    throw new FredResponseError("FRED returned invalid series metadata.");
  }
  return value;
}

export async function fetchFredSeriesMetadata(
  baseUrl: string,
  apiKey: string,
  metric: FredMetricDefinition,
  options: FredRequestOptions = {},
): Promise<{ metadata: FredSeriesMetadata; latencyMs: number }> {
  const result = await fetchFredJson(
    buildFredSeriesUrl(baseUrl, apiKey, metric.seriesId),
    options,
  );
  const series = result.payload.seriess;
  if (
    !Array.isArray(series) ||
    series.length !== 1 ||
    !series[0] ||
    typeof series[0] !== "object"
  ) {
    throw new FredResponseError("FRED returned invalid series metadata.");
  }
  const record = series[0] as Record<string, unknown>;
  const metadata = {
    id: requiredString(record, "id"),
    title: requiredString(record, "title"),
    frequency: requiredString(record, "frequency"),
    units: requiredString(record, "units"),
    seasonalAdjustment: requiredString(record, "seasonal_adjustment"),
    observationStart: requiredString(record, "observation_start"),
    observationEnd: requiredString(record, "observation_end"),
    lastUpdated: requiredString(record, "last_updated"),
    notes: typeof record.notes === "string" ? record.notes : "",
  };
  if (
    metadata.id !== metric.seriesId ||
    metadata.title !== metric.expectedTitle ||
    metadata.frequency !== metric.expectedFrequency ||
    metadata.units !== metric.expectedUnits ||
    metadata.seasonalAdjustment !== metric.expectedSeasonalAdjustment
  ) {
    throw new FredResponseError("FRED series metadata no longer matches.");
  }
  return { metadata, latencyMs: result.latencyMs };
}

export async function fetchFredReleaseName(
  baseUrl: string,
  apiKey: string,
  metric: FredMetricDefinition,
  options: FredRequestOptions = {},
): Promise<string> {
  const result = await fetchFredJson(
    buildFredReleaseUrl(baseUrl, apiKey, metric.seriesId),
    options,
  );
  const releases = result.payload.releases;
  if (
    !Array.isArray(releases) ||
    releases.length !== 1 ||
    !releases[0] ||
    typeof releases[0] !== "object"
  ) {
    throw new FredResponseError("FRED returned invalid release metadata.");
  }
  const name = requiredString(releases[0] as Record<string, unknown>, "name");
  if (name !== metric.release) {
    throw new FredResponseError("FRED release metadata no longer matches.");
  }
  return name;
}

export async function fetchFredObservationsJson(
  url: URL,
  options: FredRequestOptions = {},
): Promise<Record<string, unknown>> {
  return (await fetchFredJson(url, options)).payload;
}
