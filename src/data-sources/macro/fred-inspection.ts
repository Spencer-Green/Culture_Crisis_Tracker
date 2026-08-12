import {
  fetchFredReleaseName,
  fetchFredSeriesMetadata,
  type FredRequestOptions,
} from "@/data-sources/macro/fred-api";
import { FRED_METRICS } from "@/data-sources/macro/fred-metrics";

export type FredSeriesInspection = {
  seriesId: string;
  title: string;
  source: string;
  release: string;
  units: string;
  seasonalAdjustment: string;
  frequency: string;
  observationStart: string;
  observationEnd: string;
  lastUpdated: string;
  notesSummary: string;
};

function summariseNotes(notes: string): string {
  const summary = notes
    .replace(/<[^>]*>/g, " ")
    .replace(/\s+/g, " ")
    .trim();
  return summary ? summary.slice(0, 240) : "No series-specific notes supplied.";
}

export async function inspectFredSeries(
  baseUrl: string,
  apiKey: string,
  options: FredRequestOptions = {},
): Promise<FredSeriesInspection[]> {
  const inspections: FredSeriesInspection[] = [];
  for (const metric of FRED_METRICS) {
    const { metadata } = await fetchFredSeriesMetadata(
      baseUrl,
      apiKey,
      metric,
      options,
    );
    const release = await fetchFredReleaseName(
      baseUrl,
      apiKey,
      metric,
      options,
    );
    inspections.push({
      seriesId: metric.seriesId,
      title: metadata.title,
      source: metric.source,
      release,
      units: metadata.units,
      seasonalAdjustment: metadata.seasonalAdjustment,
      frequency: metadata.frequency,
      observationStart: metadata.observationStart,
      observationEnd: metadata.observationEnd,
      lastUpdated: metadata.lastUpdated,
      notesSummary: summariseNotes(metadata.notes),
    });
  }
  return inspections;
}
