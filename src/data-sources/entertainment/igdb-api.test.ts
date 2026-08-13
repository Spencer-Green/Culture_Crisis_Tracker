import { readFile } from "node:fs/promises";

import { describe, expect, it, vi } from "vitest";

import {
  buildIgdbGamesQuery,
  IgdbClient,
  IgdbResponseError,
  IgdbTokenCache,
  parseIgdbGame,
} from "@/data-sources/entertainment/igdb-api";

const fixtureUrl = new URL("./__fixtures__/igdb-games.json", import.meta.url);

describe("IGDB API", () => {
  it("parses games, company roles, releases, and authoritative Steam IDs", async () => {
    const fixtures = JSON.parse(
      await readFile(fixtureUrl, "utf8"),
    ) as unknown[];
    const game = parseIgdbGame(fixtures[0]);
    expect(game).toMatchObject({
      igdbId: 100,
      name: "Fixture Main Game",
      gameType: { igdbId: 0, name: "Main Game" },
      steamAppId: 123456,
      genres: [{ igdbId: 12, name: "Role-playing (RPG)" }],
      platforms: [{ igdbId: 6, name: "PC (Microsoft Windows)" }],
      releases: [
        expect.objectContaining({ igdbId: 1000, regionId: 8, dateCategory: 0 }),
      ],
    });
    expect(game?.companies).toEqual([
      expect.objectContaining({ name: "Fixture Developer", developer: true }),
      expect.objectContaining({ name: "Fixture Publisher", publisher: true }),
    ]);
    expect(game?.externalIds[0]).toMatchObject({ category: 1, uid: "123456" });
  });

  it("excludes DLC and duplicate editions but retains standalone remakes", async () => {
    const fixtures = JSON.parse(
      await readFile(fixtureUrl, "utf8"),
    ) as unknown[];
    expect(parseIgdbGame(fixtures[1])).toBeNull();
    expect(parseIgdbGame(fixtures[2])).toBeNull();
    expect(parseIgdbGame(fixtures[3])).toMatchObject({
      name: "Fixture Remake",
      steamAppId: null,
      companies: [],
      genres: [],
    });
  });

  it("builds bounded date queries with explicit inclusion rules", () => {
    const query = buildIgdbGamesQuery({
      startDate: new Date("2026-01-01T00:00:00Z"),
      endDateExclusive: new Date("2026-02-01T00:00:00Z"),
      limit: 999,
      offset: 500,
    });
    expect(query).toContain("game_type = (0,4,8,9)");
    expect(query).toContain("version_parent = null");
    expect(query).toContain("involved_companies != null");
    expect(query).toContain("game_status != (6,7)");
    expect(query).toContain("limit 500");
    expect(query).toContain("offset 500");
    expect(() =>
      buildIgdbGamesQuery({
        startDate: new Date("2026-02-01"),
        endDateExclusive: new Date("2026-01-01"),
      }),
    ).toThrow(IgdbResponseError);
  });

  it("caches Twitch app tokens until expiry without exposing credentials", async () => {
    const secret = "never-leak-client-secret";
    const fetchImplementation = vi.fn<typeof fetch>().mockResolvedValue(
      new Response(
        JSON.stringify({
          access_token: "bearer-value",
          expires_in: 3600,
          token_type: "bearer",
        }),
        { headers: { "content-type": "application/json" } },
      ),
    );
    const cache = new IgdbTokenCache("client-id", secret, {
      fetchImplementation,
      now: () => 1_000,
    });
    await expect(cache.getToken()).resolves.toBe("bearer-value");
    await expect(cache.getToken()).resolves.toBe("bearer-value");
    expect(fetchImplementation).toHaveBeenCalledTimes(1);

    const failing = new IgdbTokenCache("client-id", secret, {
      fetchImplementation: vi
        .fn<typeof fetch>()
        .mockRejectedValue(new Error(secret)),
    });
    const failure = await failing.getToken().catch((error: unknown) => error);
    expect(String(failure)).not.toContain(secret);
  });

  it("sends credentials in headers and parses paginated games", async () => {
    const fixtures = await readFile(fixtureUrl, "utf8");
    const fetchImplementation = vi
      .fn<typeof fetch>()
      .mockResolvedValueOnce(
        new Response(
          JSON.stringify({
            access_token: "token",
            expires_in: 3600,
            token_type: "bearer",
          }),
          { headers: { "content-type": "application/json" } },
        ),
      )
      .mockResolvedValueOnce(
        new Response(fixtures, {
          headers: { "content-type": "application/json" },
        }),
      );
    const tokenCache = new IgdbTokenCache("client-id", "secret", {
      fetchImplementation,
    });
    const client = new IgdbClient(
      "https://api.igdb.com/v4",
      "client-id",
      tokenCache,
      {
        fetchImplementation,
        sleep: async () => undefined,
      },
    );
    const games = await client.fetchGames({
      startDate: new Date("2026-01-01"),
      endDateExclusive: new Date("2026-02-01"),
    });
    expect(games.map((game) => game.igdbId)).toEqual([100, 103]);
    const request = fetchImplementation.mock.calls[1][1] as RequestInit;
    expect(request.headers).toMatchObject({
      "Client-ID": "client-id",
      Authorization: "Bearer token",
    });
  });
});
