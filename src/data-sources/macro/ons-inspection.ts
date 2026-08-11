import {
  discoverOnsSeries,
  fetchOnsSeriesData,
  type OnsRequestOptions,
  type OnsResolvedSeries,
} from "@/data-sources/macro/ons-api";
import {
  ONS_METRICS,
  type OnsMetricDefinition,
} from "@/data-sources/macro/ons-metrics";
import {
  parseOnsSeriesSummary,
  type OnsSeriesSummary,
} from "@/data-sources/macro/ons-response";

export type InspectedOnsSeries = {
  metric: OnsMetricDefinition;
  series: OnsResolvedSeries;
  summary: OnsSeriesSummary;
};

export async function inspectOnsSeries(
  baseUrl: string,
  options: OnsRequestOptions = {},
): Promise<InspectedOnsSeries[]> {
  const inspected: InspectedOnsSeries[] = [];

  for (const metric of ONS_METRICS) {
    const series = await discoverOnsSeries(baseUrl, metric, options);
    const response = await fetchOnsSeriesData(baseUrl, series, options);
    inspected.push({
      metric,
      series,
      summary: parseOnsSeriesSummary(response.body, series, metric),
    });
  }

  return inspected;
}

export function getCommonOnsAvailability(
  inspected: readonly InspectedOnsSeries[],
): {
  earliestQuarter: string;
  latestQuarter: string;
} {
  const earliestQuarters = inspected
    .map((item) => item.summary.earliestQuarter)
    .filter((quarter): quarter is string => quarter !== null);
  const latestQuarters = inspected
    .map((item) => item.summary.latestQuarter)
    .filter((quarter): quarter is string => quarter !== null);

  if (
    earliestQuarters.length !== inspected.length ||
    latestQuarters.length !== inspected.length ||
    inspected.length === 0
  ) {
    throw new Error("ONS quarterly availability could not be resolved.");
  }

  return {
    earliestQuarter: earliestQuarters.sort().at(-1)!,
    latestQuarter: latestQuarters.sort()[0],
  };
}
