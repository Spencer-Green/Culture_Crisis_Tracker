import {
  getDefaultAbsPeriodRange,
  validateAbsPeriodRange,
} from "@/data-sources/macro/abs-period";

export type AbsCliOptions = {
  startPeriod: string;
  endPeriod: string;
  metricSlugs?: string[];
};

export function parseAbsCliArguments(
  args: readonly string[],
  now = new Date(),
): AbsCliOptions {
  const defaults = getDefaultAbsPeriodRange(now);
  let startPeriod = defaults.startPeriod;
  let endPeriod = defaults.endPeriod;
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

  validateAbsPeriodRange(startPeriod, endPeriod);
  return {
    startPeriod,
    endPeriod,
    metricSlugs: metricSlugs.length > 0 ? metricSlugs : undefined,
  };
}
