import { describe, expect, it } from "vitest";

import {
  buildGamingAnalytics,
  calculateCompanyConcentration,
  completedReleaseSeries,
  countReleasesByPeriod,
  latestSteamSnapshots,
  median,
  type GamingGameInput,
} from "@/services/gaming/analytics-core";

const games: GamingGameInput[] = [
  {
    id: "one",
    name: "One",
    firstReleaseDate: new Date("2025-08-20T00:00:00Z"),
    gameTypeName: "Main Game",
    steamAppId: 1,
    genres: ["RPG"],
    platforms: ["PC"],
    companies: [
      { id: "dev", name: "Developer", developer: true, publisher: false },
      { id: "pub", name: "Publisher", developer: false, publisher: true },
    ],
  },
  {
    id: "two",
    name: "Two",
    firstReleaseDate: new Date("2026-09-01T00:00:00Z"),
    gameTypeName: "Remake",
    steamAppId: 2,
    genres: ["RPG", "Adventure"],
    platforms: ["PC", "Console"],
    companies: [
      { id: "dev", name: "Developer", developer: true, publisher: false },
      { id: "pub", name: "Publisher", developer: false, publisher: true },
    ],
  },
];

describe("gaming analytics", () => {
  it("counts release supply without mutating raw games", () => {
    const before = games.map((game) => game.name);
    expect(countReleasesByPeriod(games, "quarter")).toEqual([
      { period: "2025-Q3", count: 1 },
      { period: "2026-Q3", count: 1 },
    ]);
    expect(games.map((game) => game.name)).toEqual(before);
  });

  it("excludes the current partial quarter and future releases from history", () => {
    expect(
      completedReleaseSeries(
        games,
        "quarter",
        new Date("2026-08-13T00:00:00Z"),
      ),
    ).toEqual([{ period: "2025-Q3", count: 1 }]);
    expect(
      completedReleaseSeries(games, "month", new Date("2025-08-15T00:00:00Z")),
    ).toEqual([]);
  });

  it("calculates company concentration among attributed releases", () => {
    expect(calculateCompanyConcentration(games, "publisher")).toMatchObject({
      uniqueCompanies: 1,
      topTenShare: 100,
      topCompanies: [{ label: "Publisher", count: 2 }],
    });
  });

  it("selects the latest legitimate Steam snapshot and preserves history input", () => {
    const snapshots = [
      {
        gameId: "one",
        capturedAt: new Date("2026-08-12"),
        storeAvailable: true,
        currentPlayers: 2,
        totalReviews: 5,
        positivePercent: 80,
        currentPrice: 100,
        discountPercent: 0,
        freeToPlay: false,
        currency: "USD",
      },
      {
        gameId: "one",
        capturedAt: new Date("2026-08-13"),
        storeAvailable: true,
        currentPlayers: 4,
        totalReviews: 6,
        positivePercent: 90,
        currentPrice: 50,
        discountPercent: 50,
        freeToPlay: false,
        currency: "USD",
      },
    ];
    expect(latestSteamSnapshots(snapshots).get("one")?.currentPlayers).toBe(4);
    expect(snapshots).toHaveLength(2);
  });

  it("calculates Steam coverage, activity, reviews, and pricing descriptively", () => {
    const analytics = buildGamingAnalytics({
      games,
      now: new Date("2026-08-13T00:00:00Z"),
      snapshots: [
        {
          gameId: "one",
          capturedAt: new Date("2026-08-13"),
          storeAvailable: true,
          currentPlayers: 10,
          totalReviews: 100,
          positivePercent: 90,
          currentPrice: 500,
          discountPercent: 50,
          freeToPlay: false,
          currency: "USD",
        },
        {
          gameId: "two",
          capturedAt: new Date("2026-08-13"),
          storeAvailable: true,
          currentPlayers: null,
          totalReviews: null,
          positivePercent: null,
          currentPrice: null,
          discountPercent: null,
          freeToPlay: true,
          currency: null,
        },
      ],
    });
    expect(analytics.upcoming).toEqual({ days30: 1, days90: 1, days180: 1 });
    expect(analytics.steam).toMatchObject({
      mappedGames: 2,
      snapshotGames: 2,
      playerCoveragePercent: 50,
      totalCurrentPlayers: 10,
      topTitleSharePercent: 100,
      titlesOver100Players: 0,
      titlesOver1000Players: 0,
      reviewCoveragePercent: 50,
      discountSharePercent: 50,
      freeToPlaySharePercent: 50,
    });
    expect(analytics.releaseSeries.quarterly).toEqual([
      { period: "2025-Q3", count: 1 },
    ]);
    expect(analytics.latestTwelveMonthReleases).toBe(1);
    expect(analytics.priorTwelveMonthReleases).toBe(0);
    expect(analytics.latestTwelveMonthChangePct).toBeNull();
  });

  it("handles empty and even medians", () => {
    expect(median([])).toBeNull();
    expect(median([4, 1, 2, 3])).toBe(2.5);
  });
});
