import { describe, expect, it } from "vitest";

import { getSourceDefinition } from "@/data-sources/catalog";
import type { IgdbDataSourceAdapter } from "@/data-sources/entertainment/igdb-adapter";
import type { IgdbGameRecord } from "@/data-sources/entertainment/igdb-types";
import {
  runIgdbIngestion,
  type IgdbIngestionStore,
} from "@/services/gaming/igdb-ingestion-core";

const game: IgdbGameRecord = {
  igdbId: 1,
  name: "Game",
  slug: "game",
  firstReleaseDate: new Date("2026-08-10T00:00:00Z"),
  gameType: { igdbId: 0, name: "Main Game" },
  gameStatus: { igdbId: 0, name: "Released" },
  parentIgdbId: null,
  versionParentIgdbId: null,
  igdbCreatedAt: null,
  igdbUpdatedAt: null,
  companies: [{ igdbId: 2, name: "Company", developer: true, publisher: true }],
  genres: [{ igdbId: 3, name: "Adventure" }],
  themes: [],
  platforms: [{ igdbId: 6, name: "PC" }],
  releases: [],
  externalIds: [],
  steamAppId: 123,
};

class FakeIgdbStore implements IgdbIngestionStore {
  enabled = true;
  games = new Set<number>();
  runs = new Map<string, string>();
  findSource() {
    return Promise.resolve({
      id: "source",
      slug: "igdb",
      enabled: this.enabled,
    });
  }
  createRun() {
    const id = `run-${this.runs.size + 1}`;
    this.runs.set(id, "running");
    return Promise.resolve(id);
  }
  markSourceAttempted() {
    return Promise.resolve();
  }
  persistGames(input: { games: readonly IgdbGameRecord[] }) {
    let created = 0;
    let updated = 0;
    for (const item of input.games) {
      if (this.games.has(item.igdbId)) updated += 1;
      else {
        this.games.add(item.igdbId);
        created += 1;
      }
    }
    return Promise.resolve({
      recordsCreated: created,
      recordsUpdated: updated,
    });
  }
  completeRun(input: { runId: string }) {
    this.runs.set(input.runId, "succeeded");
    return Promise.resolve();
  }
  failRun(input: { runId: string }) {
    this.runs.set(input.runId, "failed");
    return Promise.resolve();
  }
}

describe("IGDB ingestion", () => {
  it("is idempotent and preserves authoritative Steam mappings", async () => {
    const store = new FakeIgdbStore();
    const adapter = {
      isConfigured: () => true,
      createClient: () => ({
        fetchGamesPage: async () => ({ games: [game], rawCount: 1 }),
      }),
    } as unknown as IgdbDataSourceAdapter;
    const input = {
      sourceDefinition: getSourceDefinition("igdb"),
      adapter,
      store,
      startDate: new Date("2026-08-01T00:00:00Z"),
      endDateExclusive: new Date("2026-09-01T00:00:00Z"),
      startPeriod: "2026-08-01",
      endPeriod: "2026-08-31",
    };
    await expect(runIgdbIngestion(input)).resolves.toMatchObject({
      recordsCreated: 1,
      recordsUpdated: 0,
      steamMappedGames: 1,
    });
    await expect(runIgdbIngestion(input)).resolves.toMatchObject({
      recordsCreated: 0,
      recordsUpdated: 1,
    });
    expect(store.games.size).toBe(1);
  });

  it("keeps implemented, configured, and enabled state independent", async () => {
    const store = new FakeIgdbStore();
    store.enabled = false;
    await expect(
      runIgdbIngestion({
        sourceDefinition: getSourceDefinition("igdb"),
        adapter: { isConfigured: () => true } as IgdbDataSourceAdapter,
        store,
        startDate: new Date("2026-08-01"),
        endDateExclusive: new Date("2026-09-01"),
        startPeriod: "2026-08-01",
        endPeriod: "2026-08-31",
      }),
    ).rejects.toThrow("disabled");
  });
});
