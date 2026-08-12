import { z } from "zod";

import {
  getTicketmasterSegmentById,
  type TicketmasterSegment,
} from "@/data-sources/entertainment/ticketmaster-classifications";
import type {
  TicketmasterCountryCode,
  TicketmasterEventRecord,
  TicketmasterPage,
  TicketmasterRateLimit,
  TicketmasterVenueRecord,
} from "@/data-sources/entertainment/ticketmaster-types";
import {
  fetchText,
  HttpRequestError,
  sanitiseUrl,
  type FetchImplementation,
} from "@/lib/http";

export const TICKETMASTER_PAGE_SIZE = 200;
export const TICKETMASTER_DEEP_PAGE_LIMIT = 1_000;

export type TicketmasterRequestOptions = {
  fetchImplementation?: FetchImplementation;
  timeoutMs?: number;
  maxRetries?: number;
  sleep?: (milliseconds: number) => Promise<void>;
  now?: () => number;
};

export class TicketmasterResponseError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "TicketmasterResponseError";
  }
}

const eventSchema = z.object({
  id: z.string().min(1),
  name: z.string().min(1),
  url: z.string(),
  locale: z.string().optional(),
  test: z.boolean().optional(),
  dates: z.object({
    timezone: z.string().optional(),
    status: z.object({ code: z.string() }).optional(),
    start: z.object({
      localDate: z.string(),
      localTime: z.string().optional(),
      dateTime: z.string().optional(),
    }),
  }),
  classifications: z
    .array(
      z.object({
        segment: z.object({ id: z.string(), name: z.string() }).optional(),
        genre: z.object({ id: z.string(), name: z.string() }).optional(),
        subGenre: z.object({ id: z.string(), name: z.string() }).optional(),
      }),
    )
    .optional(),
  promoter: z
    .object({ id: z.string().optional(), name: z.string().optional() })
    .optional(),
  sales: z
    .object({
      public: z
        .object({
          startDateTime: z.string().optional(),
          endDateTime: z.string().optional(),
        })
        .optional(),
    })
    .optional(),
  priceRanges: z
    .array(
      z.object({
        type: z.string().optional(),
        currency: z.string().optional(),
        min: z.number().optional(),
        max: z.number().optional(),
      }),
    )
    .optional(),
  _embedded: z
    .object({
      venues: z.array(z.unknown()).optional(),
      attractions: z
        .array(z.object({ id: z.string(), name: z.string() }))
        .optional(),
    })
    .optional(),
});

const venueSchema = z.object({
  id: z.string().min(1),
  name: z.string().min(1),
  city: z.object({ name: z.string() }).optional(),
  state: z.object({ name: z.string() }).optional(),
  country: z.object({ name: z.string().optional(), countryCode: z.string() }),
  timezone: z.string().optional(),
  location: z
    .object({ latitude: z.string(), longitude: z.string() })
    .optional(),
});

function safePublicUrl(value: string): string {
  try {
    const url = new URL(value);
    if (url.protocol !== "http:" && url.protocol !== "https:")
      throw new Error();
    return url.toString();
  } catch {
    throw new TicketmasterResponseError(
      "Ticketmaster returned an unsafe event URL.",
    );
  }
}

function optionalDate(value: string | undefined): Date | null {
  if (!value) return null;
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? null : date;
}

function decimal(value: number | undefined): string | null {
  return typeof value === "number" && Number.isFinite(value)
    ? value.toFixed(2)
    : null;
}

export function parseTicketmasterVenue(
  value: unknown,
): TicketmasterVenueRecord | null {
  const result = venueSchema.safeParse(value);
  if (!result.success) return null;
  const countryCode = result.data.country.countryCode;
  if (!(["AU", "US", "GB", "CA"] as string[]).includes(countryCode))
    return null;
  return {
    ticketmasterId: result.data.id,
    name: result.data.name,
    city: result.data.city?.name ?? null,
    region: result.data.state?.name ?? null,
    countryCode: countryCode as TicketmasterCountryCode,
    timezone: result.data.timezone ?? null,
    latitude: result.data.location?.latitude ?? null,
    longitude: result.data.location?.longitude ?? null,
  };
}

export function parseTicketmasterEvent(
  value: unknown,
): TicketmasterEventRecord | null {
  const result = eventSchema.safeParse(value);
  if (!result.success) return null;
  const classification = result.data.classifications?.[0];
  const segment = classification?.segment;
  if (!segment) return null;
  const supported = getTicketmasterSegmentById(segment.id);
  if (!supported || supported.name !== segment.name) return null;
  const venue = parseTicketmasterVenue(result.data._embedded?.venues?.[0]);
  if (!venue) return null;
  let sourceUrl: string;
  try {
    sourceUrl = safePublicUrl(result.data.url);
  } catch {
    return null;
  }
  const price = result.data.priceRanges?.[0];
  return {
    ticketmasterId: result.data.id,
    name: result.data.name,
    sourceUrl,
    sourcePlatform: "Ticketmaster Discovery API v2",
    countryCode: venue.countryCode,
    sectorSlug: supported.sectorSlug,
    localDate: result.data.dates.start.localDate,
    localTime: result.data.dates.start.localTime ?? null,
    eventDateTime: optionalDate(result.data.dates.start.dateTime),
    timezone: result.data.dates.timezone ?? venue.timezone,
    status: result.data.dates.status?.code ?? "unknown",
    segmentId: segment.id,
    segmentName: segment.name,
    genreId: classification?.genre?.id ?? null,
    genreName: classification?.genre?.name ?? null,
    subGenreId: classification?.subGenre?.id ?? null,
    subGenreName: classification?.subGenre?.name ?? null,
    promoterId: result.data.promoter?.id ?? null,
    promoterName: result.data.promoter?.name ?? null,
    publicOnsaleStartAt: optionalDate(result.data.sales?.public?.startDateTime),
    publicOnsaleEndAt: optionalDate(result.data.sales?.public?.endDateTime),
    priceMin: decimal(price?.min),
    priceMax: decimal(price?.max),
    priceCurrency: price?.currency ?? null,
    priceType: price?.type ?? null,
    locale: result.data.locale ?? null,
    testEvent: result.data.test ?? false,
    venue,
    attractions: result.data._embedded?.attractions ?? [],
  };
}

export function formatTicketmasterDateTime(date: Date): string {
  return date.toISOString().replace(/\.\d{3}Z$/, "Z");
}

function endpoint(baseUrl: string, path: string, apiKey: string): URL {
  const configuredBase = new URL(baseUrl);
  if (
    configuredBase.protocol !== "https:" ||
    configuredBase.hostname !== "app.ticketmaster.com" ||
    configuredBase.pathname.replace(/\/+$/, "") !== "/discovery/v2"
  ) {
    throw new TicketmasterResponseError(
      "Ticketmaster requires the official HTTPS Discovery API v2 endpoint.",
    );
  }
  const url = new URL(
    path.replace(/^\//, ""),
    `${baseUrl.replace(/\/+$/, "")}/`,
  );
  url.searchParams.set("apikey", apiKey);
  return url;
}

export function buildTicketmasterEventsUrl(
  baseUrl: string,
  apiKey: string,
  input: {
    countryCode: TicketmasterCountryCode;
    segment: TicketmasterSegment;
    startDate: Date;
    endDateExclusive: Date;
    page: number;
    size?: number;
  },
): URL {
  if (input.endDateExclusive <= input.startDate) {
    throw new TicketmasterResponseError(
      "Ticketmaster event window must be positive.",
    );
  }
  const url = endpoint(baseUrl, "events.json", apiKey);
  url.searchParams.set("countryCode", input.countryCode);
  url.searchParams.set("segmentId", input.segment.id);
  url.searchParams.set(
    "startDateTime",
    formatTicketmasterDateTime(input.startDate),
  );
  url.searchParams.set(
    "endDateTime",
    formatTicketmasterDateTime(new Date(input.endDateExclusive.getTime() - 1)),
  );
  url.searchParams.set("size", String(input.size ?? TICKETMASTER_PAGE_SIZE));
  url.searchParams.set("page", String(input.page));
  url.searchParams.set("sort", "date,asc");
  return url;
}

export function buildTicketmasterClassificationsUrl(
  baseUrl: string,
  apiKey: string,
): URL {
  const url = endpoint(baseUrl, "classifications.json", apiKey);
  url.searchParams.set("size", "50");
  return url;
}

export function buildTicketmasterEventUrl(
  baseUrl: string,
  apiKey: string,
  id: string,
): URL {
  return endpoint(baseUrl, `events/${encodeURIComponent(id)}.json`, apiKey);
}

export function buildTicketmasterVenueUrl(
  baseUrl: string,
  apiKey: string,
  id: string,
): URL {
  return endpoint(baseUrl, `venues/${encodeURIComponent(id)}.json`, apiKey);
}

export function buildTicketmasterVenuesUrl(
  baseUrl: string,
  apiKey: string,
  keyword: string,
): URL {
  const url = endpoint(baseUrl, "venues.json", apiKey);
  url.searchParams.set("keyword", keyword);
  url.searchParams.set("size", "1");
  return url;
}

export function sanitiseTicketmasterUrl(url: URL): string {
  return sanitiseUrl(url, ["apikey"]);
}

function parseRateLimit(headers: Headers): TicketmasterRateLimit {
  const value = (name: string) => {
    const parsed = Number(headers.get(name));
    return Number.isFinite(parsed) ? parsed : null;
  };
  return {
    dailyRemaining: value("rate-limit-available"),
    perSecondRemaining: value("x-rate-limit-available"),
  };
}

export class TicketmasterThrottle {
  private lastRequestAt = Number.NEGATIVE_INFINITY;
  constructor(
    private readonly sleep: (milliseconds: number) => Promise<void>,
    private readonly now: () => number,
  ) {}
  async wait(): Promise<void> {
    const wait = Math.max(0, 500 - (this.now() - this.lastRequestAt));
    if (wait > 0) await this.sleep(wait);
    this.lastRequestAt = this.now();
  }
}

function defaultSleep(milliseconds: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, milliseconds));
}

export class TicketmasterClient {
  private readonly throttle: TicketmasterThrottle;
  private readonly sleep: (milliseconds: number) => Promise<void>;

  constructor(
    private readonly baseUrl: string,
    private readonly apiKey: string,
    private readonly options: TicketmasterRequestOptions = {},
  ) {
    this.sleep = options.sleep ?? defaultSleep;
    this.throttle = new TicketmasterThrottle(
      this.sleep,
      options.now ?? Date.now,
    );
  }

  private async request(url: URL): Promise<{
    payload: Record<string, unknown>;
    rateLimit: TicketmasterRateLimit;
  }> {
    const maxRetries = Math.min(Math.max(this.options.maxRetries ?? 2, 0), 3);
    for (let attempt = 0; ; attempt += 1) {
      await this.throttle.wait();
      try {
        const response = await fetchText(url, {
          accept: "application/json",
          acceptedContentTypes: ["application/json"],
          timeoutMs: this.options.timeoutMs ?? 15_000,
          maxResponseBytes: 5_000_000,
          fetchImplementation: this.options.fetchImplementation,
        });
        let payload: unknown;
        try {
          payload = JSON.parse(response.body);
        } catch {
          throw new TicketmasterResponseError(
            "Ticketmaster returned invalid JSON.",
          );
        }
        if (!payload || typeof payload !== "object" || Array.isArray(payload)) {
          throw new TicketmasterResponseError(
            "Ticketmaster returned an invalid response.",
          );
        }
        return {
          payload: payload as Record<string, unknown>,
          rateLimit: parseRateLimit(response.headers),
        };
      } catch (error) {
        const retryable =
          error instanceof HttpRequestError &&
          (error.kind === "rate-limit" ||
            (error.kind === "http" && (error.status ?? 0) >= 500));
        if (!retryable || attempt >= maxRetries) throw error;
        await this.sleep(
          Math.min(error.retryAfterMs ?? 1_000 * 2 ** attempt, 10_000),
        );
      }
    }
  }

  async fetchPage(
    url: URL,
  ): Promise<{ page: TicketmasterPage; rateLimit: TicketmasterRateLimit }> {
    const result = await this.request(url);
    const pageValue = result.payload.page;
    if (
      !pageValue ||
      typeof pageValue !== "object" ||
      Array.isArray(pageValue)
    ) {
      throw new TicketmasterResponseError(
        "Ticketmaster returned invalid pagination metadata.",
      );
    }
    const pageRecord = pageValue as Record<string, unknown>;
    const embedded = result.payload._embedded;
    const rawEvents =
      embedded && typeof embedded === "object" && !Array.isArray(embedded)
        ? (embedded as Record<string, unknown>).events
        : [];
    const events = Array.isArray(rawEvents)
      ? rawEvents.map(parseTicketmasterEvent).filter((event) => event !== null)
      : [];
    return {
      page: {
        events,
        page: Number(pageRecord.number ?? 0),
        size: Number(pageRecord.size ?? TICKETMASTER_PAGE_SIZE),
        totalElements: Number(pageRecord.totalElements ?? 0),
        totalPages: Number(pageRecord.totalPages ?? 0),
      },
      rateLimit: result.rateLimit,
    };
  }

  fetchJson(url: URL) {
    return this.request(url);
  }
}
