import {
  parseBeaMonth,
  validateBeaMonthRange,
} from "@/data-sources/macro/bea-period";

export type BeaCliOptions = {
  startPeriod?: string;
  endPeriod?: string;
  metricSlugs?: string[];
};

export function parseBeaCliArguments(args: readonly string[]): BeaCliOptions {
  let startPeriod: string | undefined;
  let endPeriod: string | undefined;
  const metricSlugs: string[] = [];
  for (const argument of args) {
    if (argument.startsWith("--start=")) {
      startPeriod = argument.slice("--start=".length);
      parseBeaMonth(startPeriod);
    } else if (argument.startsWith("--end=")) {
      endPeriod = argument.slice("--end=".length);
      parseBeaMonth(endPeriod);
    } else if (argument.startsWith("--metric=")) {
      metricSlugs.push(
        ...argument.slice("--metric=".length).split(",").filter(Boolean),
      );
    } else {
      throw new Error(`Unknown argument "${argument}".`);
    }
  }
  if (startPeriod && endPeriod) validateBeaMonthRange(startPeriod, endPeriod);
  return {
    startPeriod,
    endPeriod,
    metricSlugs: metricSlugs.length ? metricSlugs : undefined,
  };
}

function shiftMonth(period: string, offset: number): string {
  const date = parseBeaMonth(period);
  date.setUTCMonth(date.getUTCMonth() + offset);
  return date.toISOString().slice(0, 7);
}

export function resolveBeaCliRange(
  options: BeaCliOptions,
  availability: { earliestPeriod: string; latestPeriod: string },
) {
  const endPeriod = options.endPeriod ?? availability.latestPeriod;
  const startPeriod = options.startPeriod ?? shiftMonth(endPeriod, -11);
  if (startPeriod < availability.earliestPeriod) {
    throw new Error(
      `BEA monthly data starts at ${availability.earliestPeriod}.`,
    );
  }
  if (endPeriod > availability.latestPeriod) {
    throw new Error(
      `BEA data is currently available only through ${availability.latestPeriod}.`,
    );
  }
  return validateBeaMonthRange(startPeriod, endPeriod);
}
