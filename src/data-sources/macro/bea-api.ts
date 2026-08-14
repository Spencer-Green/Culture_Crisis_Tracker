import { BEA_DATASET, type BeaDataset } from "@/data-sources/macro/bea-metrics";
import {
  fetchText,
  HttpRequestError,
  sanitiseUrl,
  type FetchImplementation,
} from "@/lib/http";

export type BeaRequestOptions = {
  fetchImplementation?: FetchImplementation;
  timeoutMs?: number;
};

export class BeaResponseError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "BeaResponseError";
  }
}

export function buildBeaUrl(
  baseUrl: string,
  apiKey: string,
  parameters: Readonly<Record<string, string>>,
): URL {
  const url = new URL(baseUrl);
  url.searchParams.set("UserID", apiKey);
  for (const [name, value] of Object.entries(parameters)) {
    url.searchParams.set(name, value);
  }
  url.searchParams.set("ResultFormat", "JSON");
  return url;
}

export function sanitiseBeaUrl(url: URL): string {
  return sanitiseUrl(url, ["UserID"]);
}

function getBeaApiError(payload: unknown): unknown {
  if (!payload || typeof payload !== "object") return undefined;
  const beaApi = (payload as { BEAAPI?: unknown }).BEAAPI;
  if (!beaApi || typeof beaApi !== "object") return undefined;
  const results = (beaApi as { Results?: unknown }).Results;
  if (!results || typeof results !== "object") return undefined;
  return (results as { Error?: unknown }).Error;
}

export function parseBeaJson(body: string): unknown {
  let payload: unknown;
  try {
    payload = JSON.parse(body);
  } catch {
    throw new BeaResponseError("BEA returned invalid JSON.");
  }

  const apiError = getBeaApiError(payload);
  if (apiError) {
    const description =
      typeof apiError === "object" && apiError !== null
        ? String(
            (apiError as { APIErrorDescription?: unknown })
              .APIErrorDescription ?? "",
          ).toLowerCase()
        : "";
    if (/user|credential|register|api key/.test(description)) {
      throw new HttpRequestError(
        "authentication",
        "BEA authentication failed.",
        401,
      );
    }
    throw new BeaResponseError("BEA rejected the requested operation.");
  }

  return payload;
}

export async function fetchBeaJson(
  url: URL,
  options: BeaRequestOptions = {},
): Promise<{ payload: unknown; latencyMs: number }> {
  const response = await fetchText(url, {
    accept: "application/json",
    acceptedContentTypes: ["application/json", "text/json"],
    timeoutMs: options.timeoutMs ?? 15_000,
    maxResponseBytes: 5_000_000,
    fetchImplementation: options.fetchImplementation,
  });
  return {
    payload: parseBeaJson(response.body),
    latencyMs: response.latencyMs,
  };
}

export function buildBeaDataUrl(
  baseUrl: string,
  apiKey: string,
  dataset: BeaDataset,
  tableName: string,
  years: readonly string[],
): URL {
  return buildBeaUrl(baseUrl, apiKey, {
    method: "GetData",
    DatasetName: dataset,
    TableName: tableName,
    Frequency: "M",
    Year: years.join(","),
    ShowMillions: "Y",
  });
}

export function buildBeaHealthUrl(baseUrl: string, apiKey: string): URL {
  return buildBeaUrl(baseUrl, apiKey, {
    method: "GetParameterList",
    DatasetName: BEA_DATASET,
  });
}
