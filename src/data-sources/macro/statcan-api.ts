import type { StatCanMetricDefinition } from "@/data-sources/macro/statcan-metrics";
import type { FetchImplementation } from "@/lib/http";

export type StatCanRequestOptions = {
  fetchImplementation?: FetchImplementation;
  timeoutMs?: number;
};

export class StatCanResponseError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "StatCanResponseError";
  }
}

function base(baseUrl: string): string {
  return baseUrl.replace(/\/+$/, "");
}

export function buildStatCanDataUrl(
  baseUrl: string,
  metric: StatCanMetricDefinition,
  startDate: Date,
  endDate: Date,
): URL {
  const url = new URL(
    `${base(baseUrl)}/rest/getDataFromVectorByReferencePeriodRange`,
  );
  url.searchParams.set("vectorIds", `"${metric.vectorId}"`);
  url.searchParams.set("startRefPeriod", startDate.toISOString().slice(0, 10));
  url.searchParams.set(
    "endReferencePeriod",
    endDate.toISOString().slice(0, 10),
  );
  return url;
}

export function statCanEndpoint(baseUrl: string, method: string): URL {
  return new URL(`${base(baseUrl)}/rest/${method}`);
}

async function fetchStatCanJson(
  url: URL,
  options: StatCanRequestOptions,
  init: RequestInit = {},
): Promise<{ payload: unknown; latencyMs: number }> {
  const timeoutMs = options.timeoutMs ?? 15_000;
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), timeoutMs);
  const startedAt = performance.now();
  try {
    const response = await (options.fetchImplementation ?? globalThis.fetch)(
      url,
      {
        ...init,
        signal: controller.signal,
        headers: {
          Accept: "application/json",
          "User-Agent": "CultureCrisisTracker/0.1.0",
          ...init.headers,
        },
      },
    );
    if (!response.ok) {
      throw new StatCanResponseError(
        `Statistics Canada returned HTTP ${response.status}.`,
      );
    }
    const contentType = response.headers.get("content-type") ?? "";
    if (!contentType.toLowerCase().includes("application/json")) {
      throw new StatCanResponseError(
        "Statistics Canada returned an unexpected content type.",
      );
    }
    return {
      payload: await response.json(),
      latencyMs: Math.round(performance.now() - startedAt),
    };
  } catch (error) {
    if (error instanceof StatCanResponseError) throw error;
    if (error instanceof Error && error.name === "AbortError") {
      throw new StatCanResponseError(
        `Statistics Canada request timed out after ${timeoutMs}ms.`,
      );
    }
    throw new StatCanResponseError("Statistics Canada request failed.");
  } finally {
    clearTimeout(timeout);
  }
}

export function fetchStatCanCubeMetadata(
  baseUrl: string,
  productId: number,
  options: StatCanRequestOptions = {},
) {
  return fetchStatCanJson(
    statCanEndpoint(baseUrl, "getCubeMetadata"),
    options,
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify([{ productId }]),
    },
  );
}

export function fetchStatCanSeriesInfo(
  baseUrl: string,
  productId: number,
  coordinate: string,
  options: StatCanRequestOptions = {},
) {
  return fetchStatCanJson(
    statCanEndpoint(baseUrl, "getSeriesInfoFromCubePidCoord"),
    options,
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify([{ productId, coordinate }]),
    },
  );
}

export function fetchStatCanVectorData(
  baseUrl: string,
  metric: StatCanMetricDefinition,
  startDate: Date,
  endDate: Date,
  options: StatCanRequestOptions = {},
) {
  const url = buildStatCanDataUrl(baseUrl, metric, startDate, endDate);
  return fetchStatCanJson(url, options).then((result) => ({ ...result, url }));
}

export type StatCanSeriesInfo = {
  productId: number;
  coordinate: string;
  vectorId: number;
  frequencyCode: number;
  scalarFactorCode: number;
  decimals: number;
  terminated: number;
  seriesTitle: string;
  memberUomCode: number;
};

function responseObject(payload: unknown): Record<string, unknown> {
  if (!Array.isArray(payload) || payload.length !== 1) {
    throw new StatCanResponseError(
      "Statistics Canada returned an invalid response envelope.",
    );
  }
  const envelope = payload[0];
  if (!envelope || typeof envelope !== "object" || Array.isArray(envelope)) {
    throw new StatCanResponseError(
      "Statistics Canada returned an invalid response envelope.",
    );
  }
  const record = envelope as Record<string, unknown>;
  if (
    record.status !== "SUCCESS" ||
    !record.object ||
    typeof record.object !== "object"
  ) {
    throw new StatCanResponseError(
      "Statistics Canada reported an unsuccessful response.",
    );
  }
  return record.object as Record<string, unknown>;
}

export function parseStatCanSeriesInfo(payload: unknown): StatCanSeriesInfo {
  const object = responseObject(payload);
  const fields = [
    "productId",
    "coordinate",
    "vectorId",
    "frequencyCode",
    "scalarFactorCode",
    "decimals",
    "terminated",
    "SeriesTitleEn",
    "memberUomCode",
  ] as const;
  if (fields.some((field) => object[field] === undefined)) {
    throw new StatCanResponseError(
      "Statistics Canada omitted series metadata.",
    );
  }
  return {
    productId: Number(object.productId),
    coordinate: String(object.coordinate),
    vectorId: Number(object.vectorId),
    frequencyCode: Number(object.frequencyCode),
    scalarFactorCode: Number(object.scalarFactorCode),
    decimals: Number(object.decimals),
    terminated: Number(object.terminated),
    seriesTitle: String(object.SeriesTitleEn),
    memberUomCode: Number(object.memberUomCode),
  };
}

export function validateStatCanSeriesInfo(
  series: StatCanSeriesInfo,
  metric: StatCanMetricDefinition,
): void {
  const expectedTitle = [
    "Canada",
    metric.priceLabel,
    metric.seasonalAdjustment,
    metric.categoryLabel,
  ].join(";");
  if (
    series.productId !== 36100124 ||
    series.coordinate !== metric.coordinate ||
    series.vectorId !== metric.vectorId ||
    series.frequencyCode !== 9 ||
    series.scalarFactorCode !== 6 ||
    series.memberUomCode !== 81 ||
    series.terminated !== 0 ||
    series.seriesTitle !== expectedTitle
  ) {
    throw new StatCanResponseError(
      `Statistics Canada series metadata no longer matches ${metric.slug}.`,
    );
  }
}

export { responseObject as parseStatCanResponseObject };
