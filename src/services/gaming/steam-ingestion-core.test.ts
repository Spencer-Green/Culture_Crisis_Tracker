import { describe, expect, it } from "vitest";

import { getSourceDefinition } from "@/data-sources/catalog";
import type { SteamDataSourceAdapter } from "@/data-sources/entertainment/steam-adapter";
import type { SteamGameObservation } from "@/data-sources/entertainment/steam-types";
import {
  runSteamIngestion,
  type SteamIngestionStore,
  type SteamMappedGame,
} from "@/services/gaming/steam-ingestion-core";

const mappedGame: SteamMappedGame = {
  id: "game",
  igdbId: 1,
  name: "Game",
  steamAppId: 123,
};
const observation: SteamGameObservation = {
  steamAppId: 123,
  retrievedAt: new Date("2026-08-13T12:05:00Z"),
  storeAvailable: true,
  name: "Game",
  type: "game",
  developers: ["Developer"],
  publishers: ["Publisher"],
  freeToPlay: false,
  currentPrice: 1000,
  originalPrice: 2000,
  discountPercent: 50,
  currency: "USD",
  releaseDate: "Aug 1, 2026",
  comingSoon: false,
  genres: ["Adventure"],
  currentPlayers: 50,
  totalReviews: 100,
  positiveReviews: 80,
  positivePercent: 80,
  reviewScore: 7,
  reviewScoreLabel: "Positive",
};

class FakeSteamStore implements SteamIngestionStore {
  snapshots = new Set<string>();
  runs = 0;
  findSource() {
    return Promise.resolve({ id: "source", slug: "steam", enabled: true });
  }
  createRun() {
    this.runs += 1;
    return Promise.resolve(`run-${this.runs}`);
  }
  markSourceAttempted() {
    return Promise.resolve();
  }
  loadMappedGames() {
    return Promise.resolve([mappedGame]);
  }
  persistSnapshots(input: {
    capturedAt: Date;
    observations: readonly { game: SteamMappedGame }[];
  }) {
    let created = 0;
    let updated = 0;
    for (const item of input.observations) {
      const key = `${item.game.id}:${input.capturedAt.toISOString()}`;
      if (this.snapshots.has(key)) updated += 1;
      else {
        this.snapshots.add(key);
        created += 1;
      }
    }
    return Promise.resolve({
      recordsCreated: created,
      recordsUpdated: updated,
    });
  }
  completeRun() {
    return Promise.resolve();
  }
  failRun() {
    return Promise.resolve();
  }
}

describe("Steam ingestion", () => {
  it("preserves later captures while making retries of one capture idempotent", async () => {
    const store = new FakeSteamStore();
    const adapter = {
      isConfigured: () => true,
      createClient: () => ({ fetchSnapshot: async () => observation }),
    } as unknown as SteamDataSourceAdapter;
    const base = {
      sourceDefinition: getSourceDefinition("steam"),
      adapter,
      store,
      limit: 100,
      offset: 0,
    };
    await expect(
      runSteamIngestion({
        ...base,
        capturedAt: new Date("2026-08-13T12:00:00Z"),
      }),
    ).resolves.toMatchObject({
      recordsCreated: 1,
      recordsUpdated: 0,
      playerCountCoverage: 1,
      reviewCoverage: 1,
      priceCoverage: 1,
    });
    await expect(
      runSteamIngestion({
        ...base,
        capturedAt: new Date("2026-08-13T12:00:00Z"),
      }),
    ).resolves.toMatchObject({ recordsCreated: 0, recordsUpdated: 1 });
    await expect(
      runSteamIngestion({
        ...base,
        capturedAt: new Date("2026-08-13T13:00:00Z"),
      }),
    ).resolves.toMatchObject({ recordsCreated: 1, recordsUpdated: 0 });
    expect(store.snapshots.size).toBe(2);
  });

  it("uses mapped app IDs and never invokes title matching", async () => {
    const store = new FakeSteamStore();
    const seen: number[] = [];
    const adapter = {
      isConfigured: () => true,
      createClient: () => ({
        fetchSnapshot: async (appId: number) => {
          seen.push(appId);
          return observation;
        },
      }),
    } as unknown as SteamDataSourceAdapter;
    await runSteamIngestion({
      sourceDefinition: getSourceDefinition("steam"),
      adapter,
      store,
      limit: 1,
      offset: 0,
      capturedAt: new Date("2026-08-13T12:00:00Z"),
    });
    expect(seen).toEqual([123]);
  });
});
