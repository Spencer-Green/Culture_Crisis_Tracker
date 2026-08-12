import {
  STATCAN_METRICS,
  STATCAN_TABLE,
} from "@/data-sources/macro/statcan-metrics";
import { validateStatCanQuarterRange } from "@/data-sources/macro/statcan-period";

export type StatCanCliOptions = {
  startQuarter?: string;
  endQuarter?: string;
  metricSlugs?: string[];
};

export function parseStatCanCliArguments(
  args: readonly string[],
): StatCanCliOptions {
  let startQuarter: string | undefined;
  let endQuarter: string | undefined;
  const metricSlugs: string[] = [];
  for (const argument of args) {
    if (argument.startsWith("--start=")) startQuarter = argument.slice(8);
    else if (argument.startsWith("--end=")) endQuarter = argument.slice(6);
    else if (argument.startsWith("--metric=")) {
      metricSlugs.push(...argument.slice(9).split(",").filter(Boolean));
    } else throw new Error(`Unknown argument "${argument}".`);
  }
  if ((startQuarter && !endQuarter) || (!startQuarter && endQuarter)) {
    throw new Error(
      "Statistics Canada ingestion requires both --start and --end.",
    );
  }
  if (startQuarter && endQuarter) {
    validateStatCanQuarterRange(startQuarter, endQuarter);
  }
  return {
    startQuarter,
    endQuarter,
    metricSlugs: metricSlugs.length ? metricSlugs : undefined,
  };
}

export function resolveStatCanCliRange(options: StatCanCliOptions) {
  return validateStatCanQuarterRange(
    options.startQuarter ?? "2019-Q1",
    options.endQuarter ?? STATCAN_TABLE.latestValidatedQuarter,
  );
}

export function validateStatCanMetricSlugs(metricSlugs?: readonly string[]) {
  if (!metricSlugs) return;
  const supported = new Set<string>(
    STATCAN_METRICS.map((metric) => metric.slug),
  );
  const unknown = metricSlugs.find((slug) => !supported.has(slug));
  if (unknown)
    throw new Error(`Unsupported Statistics Canada metric "${unknown}".`);
}
