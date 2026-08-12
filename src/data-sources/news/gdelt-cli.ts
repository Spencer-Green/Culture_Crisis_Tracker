import {
  GDELT_QUERY_FAMILY_IDS,
  type GdeltQueryFamilyId,
} from "@/data-sources/news/gdelt-queries";
import {
  GDELT_COUNTRY_SCOPE,
  type GdeltCountryCode,
} from "@/data-sources/news/gdelt-taxonomy";

export const GDELT_MAX_DAYS = 30;

export type GdeltCliOptions = {
  days: number;
  queryFamily?: GdeltQueryFamilyId;
  countryCode?: GdeltCountryCode;
};

export function parseGdeltCliArguments(
  args: readonly string[],
): GdeltCliOptions {
  let days = 7;
  let queryFamily: GdeltQueryFamilyId | undefined;
  let countryCode: GdeltCountryCode | undefined;
  for (const argument of args) {
    if (argument.startsWith("--days=")) {
      days = Number(argument.slice(7));
    } else if (argument.startsWith("--query-family=")) {
      const value = argument.slice(15);
      if (!(GDELT_QUERY_FAMILY_IDS as readonly string[]).includes(value)) {
        throw new Error(`Unsupported GDELT query family "${value}".`);
      }
      queryFamily = value as GdeltQueryFamilyId;
    } else if (argument.startsWith("--country=")) {
      const value = argument.slice(10).toUpperCase();
      if (!(GDELT_COUNTRY_SCOPE as readonly string[]).includes(value)) {
        throw new Error(
          `GDELT country must be one of ${GDELT_COUNTRY_SCOPE.join(", ")}.`,
        );
      }
      countryCode = value as GdeltCountryCode;
    } else {
      throw new Error(`Unknown argument "${argument}".`);
    }
  }
  if (!Number.isInteger(days) || days < 1 || days > GDELT_MAX_DAYS) {
    throw new Error(`GDELT --days must be between 1 and ${GDELT_MAX_DAYS}.`);
  }
  return { days, queryFamily, countryCode };
}

export function resolveGdeltWindow(days: number, now: Date) {
  if (Number.isNaN(now.getTime()))
    throw new Error("GDELT end date is invalid.");
  return {
    startDate: new Date(now.getTime() - days * 24 * 60 * 60 * 1_000),
    endDate: new Date(now),
  };
}

export function gdeltMaxRecordsForDays(days: number): number {
  return days <= 7 ? 50 : 100;
}
