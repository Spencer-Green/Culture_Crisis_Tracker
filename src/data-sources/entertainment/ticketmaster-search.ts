import type { TicketmasterSegment } from "@/data-sources/entertainment/ticketmaster-classifications";
import {
  buildTicketmasterEventsUrl,
  TICKETMASTER_DEEP_PAGE_LIMIT,
  TICKETMASTER_PAGE_SIZE,
  TicketmasterClient,
  TicketmasterResponseError,
} from "@/data-sources/entertainment/ticketmaster-api";
import type {
  TicketmasterCountryCode,
  TicketmasterEventRecord,
  TicketmasterRateLimit,
} from "@/data-sources/entertainment/ticketmaster-types";

export type TicketmasterDateWindow = {
  startDate: Date;
  endDateExclusive: Date;
};

export type TicketmasterSearchResult = {
  events: TicketmasterEventRecord[];
  apiCalls: number;
  recordsReturned: number;
  outsideWindowRemoved: number;
  splitProbeRecordsDiscarded: number;
  duplicatesRemoved: number;
  windowsQueried: TicketmasterDateWindow[];
  splitCount: number;
  rateLimit: TicketmasterRateLimit;
};

const MINIMUM_SPLIT_MS = 60 * 60 * 1_000;

export function splitTicketmasterWindow(
  window: TicketmasterDateWindow,
): [TicketmasterDateWindow, TicketmasterDateWindow] {
  const duration =
    window.endDateExclusive.getTime() - window.startDate.getTime();
  if (duration <= MINIMUM_SPLIT_MS) {
    throw new TicketmasterResponseError(
      "Ticketmaster result density exceeds the safe deep-paging limit in the minimum window.",
    );
  }
  const midpoint = new Date(
    Math.floor(
      (window.startDate.getTime() + window.endDateExclusive.getTime()) /
        2 /
        1_000,
    ) * 1_000,
  );
  return [
    { startDate: window.startDate, endDateExclusive: midpoint },
    { startDate: midpoint, endDateExclusive: window.endDateExclusive },
  ];
}

export function eventFallsWithinWindow(
  event: TicketmasterEventRecord,
  window: TicketmasterDateWindow,
): boolean {
  if (event.eventDateTime) {
    return (
      event.eventDateTime >= window.startDate &&
      event.eventDateTime < window.endDateExclusive
    );
  }
  const date = new Date(`${event.localDate}T12:00:00.000Z`);
  return date >= window.startDate && date < window.endDateExclusive;
}

export async function searchTicketmasterWindow(input: {
  client: TicketmasterClient;
  baseUrl: string;
  apiKey: string;
  countryCode: TicketmasterCountryCode;
  segment: TicketmasterSegment;
  window: TicketmasterDateWindow;
}): Promise<TicketmasterSearchResult> {
  let apiCalls = 0;
  let recordsReturned = 0;
  let splitCount = 0;
  let outsideWindowRemoved = 0;
  let splitProbeRecordsDiscarded = 0;
  let latestRateLimit: TicketmasterRateLimit = {
    dailyRemaining: null,
    perSecondRemaining: null,
  };
  const queried: TicketmasterDateWindow[] = [];
  const allEvents: TicketmasterEventRecord[] = [];

  async function visit(window: TicketmasterDateWindow): Promise<void> {
    const firstUrl = buildTicketmasterEventsUrl(input.baseUrl, input.apiKey, {
      countryCode: input.countryCode,
      segment: input.segment,
      startDate: window.startDate,
      endDateExclusive: window.endDateExclusive,
      page: 0,
      size: TICKETMASTER_PAGE_SIZE,
    });
    const first = await input.client.fetchPage(firstUrl);
    apiCalls += 1;
    recordsReturned += first.page.events.length;
    latestRateLimit = first.rateLimit;

    if (first.page.totalElements > TICKETMASTER_DEEP_PAGE_LIMIT) {
      splitProbeRecordsDiscarded += first.page.events.length;
      splitCount += 1;
      const [left, right] = splitTicketmasterWindow(window);
      await visit(left);
      await visit(right);
      return;
    }

    queried.push(window);
    const firstEvents = first.page.events.filter((event) =>
      eventFallsWithinWindow(event, window),
    );
    outsideWindowRemoved += first.page.events.length - firstEvents.length;
    allEvents.push(...firstEvents);
    for (let page = 1; page < first.page.totalPages; page += 1) {
      if (page * first.page.size >= TICKETMASTER_DEEP_PAGE_LIMIT) {
        throw new TicketmasterResponseError(
          "Ticketmaster pagination reached the deep-paging boundary unexpectedly.",
        );
      }
      const result = await input.client.fetchPage(
        buildTicketmasterEventsUrl(input.baseUrl, input.apiKey, {
          countryCode: input.countryCode,
          segment: input.segment,
          startDate: window.startDate,
          endDateExclusive: window.endDateExclusive,
          page,
          size: TICKETMASTER_PAGE_SIZE,
        }),
      );
      apiCalls += 1;
      recordsReturned += result.page.events.length;
      latestRateLimit = result.rateLimit;
      const pageEvents = result.page.events.filter((event) =>
        eventFallsWithinWindow(event, window),
      );
      outsideWindowRemoved += result.page.events.length - pageEvents.length;
      allEvents.push(...pageEvents);
    }
  }

  await visit(input.window);
  const unique = new Map<string, TicketmasterEventRecord>();
  for (const event of allEvents) unique.set(event.ticketmasterId, event);
  return {
    events: [...unique.values()].sort((left, right) =>
      (left.eventDateTime?.toISOString() ?? left.localDate).localeCompare(
        right.eventDateTime?.toISOString() ?? right.localDate,
      ),
    ),
    apiCalls,
    recordsReturned,
    outsideWindowRemoved,
    splitProbeRecordsDiscarded,
    duplicatesRemoved: allEvents.length - unique.size,
    windowsQueried: queried,
    splitCount,
    rateLimit: latestRateLimit,
  };
}
