import "dotenv/config";

import {
  buildTicketmasterClassificationsUrl,
  buildTicketmasterEventsUrl,
  buildTicketmasterEventUrl,
  buildTicketmasterVenuesUrl,
  buildTicketmasterVenueUrl,
  parseTicketmasterEvent,
  parseTicketmasterVenue,
  TicketmasterClient,
} from "../src/data-sources/entertainment/ticketmaster-api";
import { TICKETMASTER_SEGMENTS } from "../src/data-sources/entertainment/ticketmaster-classifications";
import { resolveTicketmasterWindow } from "../src/data-sources/entertainment/ticketmaster-cli";
import { TICKETMASTER_COUNTRIES } from "../src/data-sources/entertainment/ticketmaster-types";

function embedded(payload: Record<string, unknown>, key: string): unknown[] {
  const value = payload._embedded;
  if (!value || typeof value !== "object" || Array.isArray(value)) return [];
  const items = (value as Record<string, unknown>)[key];
  return Array.isArray(items) ? items : [];
}

async function main() {
  const baseUrl = process.env.TICKETMASTER_BASE_URL;
  const apiKey = process.env.TICKETMASTER_API_KEY;
  if (!baseUrl || !apiKey)
    throw new Error("Ticketmaster configuration is incomplete.");
  const client = new TicketmasterClient(baseUrl, apiKey);
  const classifications = await client.fetchJson(
    buildTicketmasterClassificationsUrl(baseUrl, apiKey),
  );
  const available = embedded(classifications.payload, "classifications");
  console.log("Ticketmaster Discovery API v2 inspection");
  console.log("Persistence: disabled");
  console.log("Cultural segment mappings:");
  for (const expected of TICKETMASTER_SEGMENTS) {
    const match = available.find((value) => {
      if (!value || typeof value !== "object" || Array.isArray(value))
        return false;
      const segment = (value as Record<string, unknown>).segment;
      return (
        segment &&
        typeof segment === "object" &&
        !Array.isArray(segment) &&
        (segment as Record<string, unknown>).id === expected.id &&
        (segment as Record<string, unknown>).name === expected.name
      );
    });
    if (!match)
      throw new Error(
        `Ticketmaster segment ${expected.name} no longer matches.`,
      );
    const segment = (
      match as { segment: { _embedded?: { genres?: unknown[] } } }
    ).segment;
    const genres = segment._embedded?.genres ?? [];
    console.log(
      `- ${expected.name}: ${expected.id} → ${expected.sectorSlug} (${genres.length} genres)`,
    );
    console.log(
      `  Genres: ${genres
        .slice(0, 12)
        .map((genre) =>
          genre && typeof genre === "object" && !Array.isArray(genre)
            ? `${String((genre as Record<string, unknown>).name)} [${String((genre as Record<string, unknown>).id)}]`
            : "invalid",
        )
        .join(", ")}`,
    );
  }

  const window = resolveTicketmasterWindow(7, new Date());
  console.log(
    `Search window: ${window.startDate.toISOString()} to ${window.endDateExclusive.toISOString()} (exclusive)`,
  );
  for (const countryCode of TICKETMASTER_COUNTRIES) {
    console.log(`\n${countryCode}`);
    let representative: ReturnType<typeof parseTicketmasterEvent> = null;
    for (const segment of TICKETMASTER_SEGMENTS) {
      const result = await client.fetchPage(
        buildTicketmasterEventsUrl(baseUrl, apiKey, {
          countryCode,
          segment,
          ...window,
          page: 0,
          size: 1,
        }),
      );
      console.log(
        `- ${segment.name}: ${result.page.totalElements} returned by search metadata`,
      );
      representative ??= result.page.events[0] ?? null;
    }
    if (!representative) {
      console.log("  No representative cultural event returned.");
      continue;
    }
    const detail = await client.fetchJson(
      buildTicketmasterEventUrl(baseUrl, apiKey, representative.ticketmasterId),
    );
    const event = parseTicketmasterEvent(detail.payload) ?? representative;
    const venue = event.venue;
    if (venue) {
      await client.fetchJson(
        buildTicketmasterVenueUrl(baseUrl, apiKey, venue.ticketmasterId),
      );
      const venueSearch = await client.fetchJson(
        buildTicketmasterVenuesUrl(baseUrl, apiKey, venue.name),
      );
      const searchedVenue = parseTicketmasterVenue(
        embedded(venueSearch.payload, "venues")[0],
      );
      console.log(
        `  Venue search validated: ${searchedVenue?.name ?? "no match"}`,
      );
    }
    console.log(`  Event: ${event.ticketmasterId} · ${event.name}`);
    console.log(
      `  Date: ${event.localDate} ${event.localTime ?? "time unavailable"} · ${event.eventDateTime?.toISOString() ?? "UTC unavailable"} · ${event.timezone ?? "timezone unavailable"}`,
    );
    console.log(
      `  Status: ${event.status} · ${event.segmentName} / ${event.genreName ?? "unknown"} / ${event.subGenreName ?? "unknown"}`,
    );
    console.log(
      `  Venue: ${venue?.name ?? "unknown"} · ${venue?.city ?? "unknown city"} · ${venue?.region ?? "unknown region"} · ${event.countryCode}`,
    );
    console.log(
      `  Promoter: ${event.promoterName ?? "unavailable"} · attractions: ${event.attractions.map((item) => item.name).join(", ") || "none"}`,
    );
    console.log(
      `  Public onsale: ${event.publicOnsaleStartAt?.toISOString() ?? "unavailable"} to ${event.publicOnsaleEndAt?.toISOString() ?? "unavailable"}`,
    );
    console.log(
      `  Price: ${event.priceMin ?? "unavailable"}–${event.priceMax ?? "unavailable"} ${event.priceCurrency ?? ""} ${event.priceType ?? ""}`.trim(),
    );
    console.log(
      `  Platform: ${event.sourcePlatform} · test=${event.testEvent} · locale=${event.locale ?? "unavailable"}`,
    );
    console.log(`  Public URL: ${event.sourceUrl}`);
  }
  console.log(
    `\nDaily quota remaining header: ${classifications.rateLimit.dailyRemaining ?? "not exposed"}`,
  );
}

main().catch((error) => {
  console.error(
    error instanceof Error
      ? error.message.replace(/apikey=[^&\s]+/gi, "apikey=[REDACTED]")
      : "Ticketmaster inspection failed.",
  );
  process.exitCode = 1;
});
