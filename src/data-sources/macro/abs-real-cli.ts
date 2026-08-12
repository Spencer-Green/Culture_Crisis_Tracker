import { ABS_REAL_METRICS } from "@/data-sources/macro/abs-metrics";
import { validateAbsQuarterRange } from "@/data-sources/macro/abs-period";

export type AbsRealCliOptions = {
  startPeriod: string;
  endPeriod: string;
  metricSlugs: string[];
};

export function parseAbsRealCliArguments(
  args: readonly string[],
): AbsRealCliOptions {
  let startPeriod = "2019-Q1";
  let endPeriod = "2026-Q2";
  const metricSlugs: string[] = [];

  for (const argument of args) {
    if (argument.startsWith("--start=")) {
      startPeriod = argument.slice("--start=".length);
    } else if (argument.startsWith("--end=")) {
      endPeriod = argument.slice("--end=".length);
    } else if (argument.startsWith("--metric=")) {
      metricSlugs.push(
        ...argument.slice("--metric=".length).split(",").filter(Boolean),
      );
    } else {
      throw new Error(`Unknown argument "${argument}".`);
    }
  }

  validateAbsQuarterRange(startPeriod, endPeriod);
  const selected =
    metricSlugs.length > 0
      ? metricSlugs
      : ABS_REAL_METRICS.map((metric) => metric.slug);
  const supported = new Set<string>(
    ABS_REAL_METRICS.map((metric) => metric.slug),
  );
  if (selected.some((slug) => !supported.has(slug))) {
    throw new Error("ABS real ingestion supports only quarterly real metrics.");
  }
  return { startPeriod, endPeriod, metricSlugs: selected };
}
