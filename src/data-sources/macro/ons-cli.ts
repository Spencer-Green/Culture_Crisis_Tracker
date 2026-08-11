import {
  getRecentOnsQuarterRange,
  parseOnsQuarter,
  validateOnsQuarterRange,
  type OnsQuarterRange,
} from "@/data-sources/macro/ons-period";

export type OnsCliOptions = {
  startQuarter?: string;
  endQuarter?: string;
  metricSlugs?: string[];
};

export function parseOnsCliArguments(args: readonly string[]): OnsCliOptions {
  let startQuarter: string | undefined;
  let endQuarter: string | undefined;
  const metricSlugs: string[] = [];

  for (const argument of args) {
    if (argument.startsWith("--start=")) {
      startQuarter = argument.slice("--start=".length);
      parseOnsQuarter(startQuarter);
    } else if (argument.startsWith("--end=")) {
      endQuarter = argument.slice("--end=".length);
      parseOnsQuarter(endQuarter);
    } else if (argument.startsWith("--metric=")) {
      metricSlugs.push(
        ...argument.slice("--metric=".length).split(",").filter(Boolean),
      );
    } else {
      throw new Error(`Unknown argument "${argument}".`);
    }
  }

  if (startQuarter && endQuarter) {
    validateOnsQuarterRange(startQuarter, endQuarter);
  }

  return {
    startQuarter,
    endQuarter,
    metricSlugs: metricSlugs.length > 0 ? metricSlugs : undefined,
  };
}

export function resolveOnsCliRange(
  options: OnsCliOptions,
  availability: {
    earliestQuarter: string;
    latestQuarter: string;
  },
): OnsQuarterRange {
  const endQuarter = options.endQuarter ?? availability.latestQuarter;
  const startQuarter =
    options.startQuarter ??
    getRecentOnsQuarterRange(endQuarter, 8).startQuarter;

  if (endQuarter > availability.latestQuarter) {
    throw new Error(
      `ONS data is currently available only through ${availability.latestQuarter}.`,
    );
  }
  if (startQuarter < availability.earliestQuarter) {
    throw new Error(
      `ONS quarterly data starts at ${availability.earliestQuarter}.`,
    );
  }

  return validateOnsQuarterRange(startQuarter, endQuarter);
}
