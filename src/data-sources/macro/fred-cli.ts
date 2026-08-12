import { validateFredDateRange } from "@/data-sources/macro/fred-period";

export type FredCliOptions = {
  startDate?: string;
  endDate?: string;
  metricSlugs?: string[];
};

export function parseFredCliArguments(args: readonly string[]): FredCliOptions {
  let startDate: string | undefined;
  let endDate: string | undefined;
  const metricSlugs: string[] = [];
  for (const argument of args) {
    if (argument.startsWith("--start=")) {
      startDate = argument.slice("--start=".length);
    } else if (argument.startsWith("--end=")) {
      endDate = argument.slice("--end=".length);
    } else if (argument.startsWith("--metric=")) {
      metricSlugs.push(
        ...argument.slice("--metric=".length).split(",").filter(Boolean),
      );
    } else {
      throw new Error(`Unknown argument "${argument}".`);
    }
  }
  if (startDate && endDate) validateFredDateRange(startDate, endDate);
  return {
    startDate,
    endDate,
    metricSlugs: metricSlugs.length ? metricSlugs : undefined,
  };
}

export function resolveFredCliRange(
  options: FredCliOptions,
  latestObservationDate: string,
) {
  const endDate = options.endDate ?? latestObservationDate;
  const defaultStart = new Date(`${endDate}T00:00:00.000Z`);
  defaultStart.setUTCFullYear(defaultStart.getUTCFullYear() - 1);
  const startDate =
    options.startDate ?? defaultStart.toISOString().slice(0, 10);
  return validateFredDateRange(startDate, endDate);
}
