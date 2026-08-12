import {
  EUROSTAT_DATASET,
  EUROSTAT_METRICS,
} from "@/data-sources/macro/eurostat-metrics";
import { validateEurostatYearRange } from "@/data-sources/macro/eurostat-period";

export type EurostatCliOptions = {
  startYear?: string;
  endYear?: string;
  metricSlugs?: string[];
};

export function parseEurostatCliArguments(
  args: readonly string[],
): EurostatCliOptions {
  let startYear: string | undefined;
  let endYear: string | undefined;
  const metricSlugs: string[] = [];
  for (const argument of args) {
    if (argument.startsWith("--start=")) {
      startYear = argument.slice("--start=".length);
    } else if (argument.startsWith("--end=")) {
      endYear = argument.slice("--end=".length);
    } else if (argument.startsWith("--metric=")) {
      metricSlugs.push(
        ...argument.slice("--metric=".length).split(",").filter(Boolean),
      );
    } else {
      throw new Error(`Unknown argument "${argument}".`);
    }
  }
  if ((startYear && !endYear) || (!startYear && endYear)) {
    throw new Error("Eurostat ingestion requires both --start and --end.");
  }
  if (startYear && endYear) validateEurostatYearRange(startYear, endYear);
  return {
    startYear,
    endYear,
    metricSlugs: metricSlugs.length ? metricSlugs : undefined,
  };
}

export function resolveEurostatCliRange(options: EurostatCliOptions) {
  return validateEurostatYearRange(
    options.startYear ?? "2019",
    options.endYear ?? EUROSTAT_DATASET.latestValidatedYear,
  );
}

export function validateEurostatMetricSlugs(
  metricSlugs: readonly string[] | undefined,
) {
  if (!metricSlugs) return;
  const supported = new Set<string>(
    EUROSTAT_METRICS.map((metric) => metric.slug),
  );
  const unknown = metricSlugs.find((slug) => !supported.has(slug));
  if (unknown) throw new Error(`Unsupported Eurostat metric "${unknown}".`);
}
