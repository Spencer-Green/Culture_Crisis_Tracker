import { readFile } from "node:fs/promises";

import { describe, expect, it, vi } from "vitest";

import {
  buildSteamPlayerUrl,
  buildSteamReviewUrl,
  buildSteamStoreDetailsUrl,
  parseSteamPlayerCount,
  parseSteamReviewSummary,
  parseSteamStoreDetails,
  sanitiseSteamUrl,
  SteamClient,
  SteamResponseError,
} from "@/data-sources/entertainment/steam-api";

const fixtureUrl = new URL(
  "./__fixtures__/steam-responses.json",
  import.meta.url,
);

describe("Steam APIs", () => {
  it("parses player, review, pricing, discount, and release metadata", async () => {
    const fixture = JSON.parse(await readFile(fixtureUrl, "utf8"));
    expect(parseSteamPlayerCount(fixture.players)).toBe(4321);
    expect(parseSteamReviewSummary(fixture.reviews)).toEqual({
      totalReviews: 1000,
      positiveReviews: 900,
      positivePercent: 90,
      reviewScore: 8,
      reviewScoreLabel: "Very Positive",
    });
    expect(parseSteamStoreDetails(fixture.details, 123456)).toMatchObject({
      storeAvailable: true,
      type: "game",
      currentPrice: 2499,
      originalPrice: 4999,
      discountPercent: 50,
      currency: "USD",
      freeToPlay: false,
      developers: ["Fixture Developer"],
    });
  });

  it("preserves unavailable and missing app data without treating it as zero", async () => {
    const fixture = JSON.parse(await readFile(fixtureUrl, "utf8"));
    expect(parseSteamStoreDetails(fixture.unavailable, 999999)).toMatchObject({
      storeAvailable: false,
      currentPrice: null,
      freeToPlay: null,
    });
    expect(parseSteamPlayerCount({ response: { result: 0 } })).toBeNull();
    expect(parseSteamReviewSummary({ success: 2 })).toMatchObject({
      totalReviews: null,
      positivePercent: null,
    });
  });

  it("uses official Valve endpoints and never adds the API key", () => {
    const secret = "steam-key-never-leaks";
    const player = buildSteamPlayerUrl("https://api.steampowered.com/", 123456);
    const review = buildSteamReviewUrl(123456);
    const details = buildSteamStoreDetailsUrl(123456);
    expect(player.hostname).toBe("api.steampowered.com");
    expect(review.hostname).toBe("store.steampowered.com");
    expect(details.hostname).toBe("store.steampowered.com");
    expect(`${player}${review}${details}`).not.toContain(secret);
    const authenticated = new URL("https://partner.steam-api.com/test");
    authenticated.searchParams.set("key", secret);
    expect(sanitiseSteamUrl(authenticated)).not.toContain(secret);
    expect(() => buildSteamPlayerUrl("https://example.com", 1)).toThrow(
      SteamResponseError,
    );
  });

  it("collects a complete snapshot sequentially", async () => {
    const fixture = JSON.parse(await readFile(fixtureUrl, "utf8"));
    const fetchImplementation = vi
      .fn<typeof fetch>()
      .mockResolvedValueOnce(
        new Response(JSON.stringify(fixture.details), {
          headers: { "content-type": "application/json" },
        }),
      )
      .mockResolvedValueOnce(
        new Response(JSON.stringify(fixture.players), {
          headers: { "content-type": "application/json" },
        }),
      )
      .mockResolvedValueOnce(
        new Response(JSON.stringify(fixture.reviews), {
          headers: { "content-type": "application/json" },
        }),
      );
    const client = new SteamClient("https://api.steampowered.com/", {
      fetchImplementation,
      sleep: async () => undefined,
    });
    await expect(
      client.fetchSnapshot(123456, new Date("2026-08-13T00:00:00Z")),
    ).resolves.toMatchObject({
      steamAppId: 123456,
      currentPlayers: 4321,
      totalReviews: 1000,
      currentPrice: 2499,
    });
    expect(fetchImplementation).toHaveBeenCalledTimes(3);
    await expect(client.fetchSnapshot(0)).rejects.toThrow("positive integer");
  });
});
