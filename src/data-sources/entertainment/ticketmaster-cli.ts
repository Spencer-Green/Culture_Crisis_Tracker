import {
  getTicketmasterSegment,
  TICKETMASTER_SEGMENTS,
  type TicketmasterSegmentSlug,
} from "@/data-sources/entertainment/ticketmaster-classifications";
import {
  TICKETMASTER_COUNTRIES,
  type TicketmasterCountryCode,
} from "@/data-sources/entertainment/ticketmaster-types";

export const TICKETMASTER_MAX_DAYS = 90;

export type TicketmasterCliOptions = {
  days: 7 | 30 | 90;
  countryCode?: TicketmasterCountryCode;
  segmentSlug?: TicketmasterSegmentSlug;
};

export function parseTicketmasterCliArguments(
  args: readonly string[],
): TicketmasterCliOptions {
  let days: 7 | 30 | 90 = 7;
  let countryCode: TicketmasterCountryCode | undefined;
  let segmentSlug: TicketmasterSegmentSlug | undefined;
  for (const argument of args) {
    if (argument.startsWith("--days=")) {
      const value = Number(argument.slice(7));
      if (value !== 7 && value !== 30 && value !== 90) {
        throw new Error("Ticketmaster --days must be 7, 30, or 90.");
      }
      days = value;
    } else if (argument.startsWith("--country=")) {
      const value = argument.slice(10).toUpperCase();
      if (!(TICKETMASTER_COUNTRIES as readonly string[]).includes(value)) {
        throw new Error("Ticketmaster country must be AU, US, GB, or CA.");
      }
      countryCode = value as TicketmasterCountryCode;
    } else if (argument.startsWith("--segment=")) {
      const value = argument.slice(10);
      if (!getTicketmasterSegment(value)) {
        throw new Error(
          `Ticketmaster segment must be ${TICKETMASTER_SEGMENTS.map((segment) => segment.slug).join(", ")}.`,
        );
      }
      segmentSlug = value as TicketmasterSegmentSlug;
    } else {
      throw new Error(`Unknown argument "${argument}".`);
    }
  }
  return { days, countryCode, segmentSlug };
}

export function resolveTicketmasterWindow(days: number, now: Date) {
  const startDate = new Date(
    Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()),
  );
  return {
    startDate,
    endDateExclusive: new Date(
      startDate.getTime() + days * 24 * 60 * 60 * 1_000,
    ),
  };
}
