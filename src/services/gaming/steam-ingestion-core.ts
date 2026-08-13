import type { SourceDefinition } from "@/data-sources/catalog";
import type { SteamDataSourceAdapter } from "@/data-sources/entertainment/steam-adapter";
import type { SteamGameObservation } from "@/data-sources/entertainment/steam-types";
import {
  IngestionExecutionError,
  IngestionPolicyError,
  sanitiseIngestionError,
} from "@/services/ingestion/service-core";

export type SteamMappedGame = {
  id: string;
  igdbId: number;
  name: string;
  steamAppId: number;
};

export interface SteamIngestionStore {
  findSource(
    slug: string,
  ): Promise<{ id: string; slug: string; enabled: boolean } | null>;
  createRun(input: {
    sourceId: string;
    startedAt: Date;
    metadata: Record<string, unknown>;
  }): Promise<string>;
  markSourceAttempted(sourceId: string, attemptedAt: Date): Promise<void>;
  loadMappedGames(input: {
    limit: number;
    offset: number;
  }): Promise<SteamMappedGame[]>;
  persistSnapshots(input: {
    runId: string;
    sourceId: string;
    capturedAt: Date;
    observations: readonly {
      game: SteamMappedGame;
      observation: SteamGameObservation;
    }[];
  }): Promise<{ recordsCreated: number; recordsUpdated: number }>;
  completeRun(input: {
    runId: string;
    sourceId: string;
    completedAt: Date;
    recordsRead: number;
    recordsCreated: number;
    recordsUpdated: number;
    metadata: Record<string, unknown>;
  }): Promise<void>;
  failRun(input: {
    runId: string;
    completedAt: Date;
    recordsRead: number;
    errorMessage: string;
  }): Promise<void>;
}

export type SteamIngestionResult = {
  runId: string;
  capturedAt: string;
  mappedGamesQueried: number;
  recordsCreated: number;
  recordsUpdated: number;
  storeAvailable: number;
  unavailableApps: number;
  playerCountCoverage: number;
  reviewCoverage: number;
  priceCoverage: number;
  freeToPlay: number;
  discounted: number;
  durationMs: number;
};

export async function runSteamIngestion(input: {
  sourceDefinition: SourceDefinition;
  adapter: SteamDataSourceAdapter;
  store: SteamIngestionStore;
  limit: number;
  offset: number;
  capturedAt: Date;
  now?: () => Date;
}): Promise<SteamIngestionResult> {
  const source = await input.store.findSource(input.sourceDefinition.slug);
  if (!source)
    throw new IngestionPolicyError(
      'Source "steam" is not present. Run seed first.',
    );
  if (input.sourceDefinition.implementationStatus !== "implemented") {
    throw new IngestionPolicyError('Source "steam" is not implemented.');
  }
  if (!input.adapter.isConfigured())
    throw new IngestionPolicyError('Source "steam" is not configured.');
  if (!source.enabled)
    throw new IngestionPolicyError('Source "steam" is disabled.');

  const now = input.now ?? (() => new Date());
  const startedAt = now();
  const runId = await input.store.createRun({
    sourceId: source.id,
    startedAt,
    metadata: {
      limit: input.limit,
      offset: input.offset,
      capturedAt: input.capturedAt.toISOString(),
      mappingMethod: "IGDB external game source 1",
      fuzzyMatching: false,
      authenticatedRequestUrlPersisted: false,
    },
  });
  let recordsRead = 0;
  try {
    await input.store.markSourceAttempted(source.id, startedAt);
    const games = await input.store.loadMappedGames({
      limit: input.limit,
      offset: input.offset,
    });
    const client = input.adapter.createClient();
    const observations: {
      game: SteamMappedGame;
      observation: SteamGameObservation;
    }[] = [];
    for (const game of games) {
      observations.push({
        game,
        observation: await client.fetchSnapshot(game.steamAppId, now()),
      });
      recordsRead += 1;
    }
    const persisted = await input.store.persistSnapshots({
      runId,
      sourceId: source.id,
      capturedAt: input.capturedAt,
      observations,
    });
    const completedAt = now();
    const result: SteamIngestionResult = {
      runId,
      capturedAt: input.capturedAt.toISOString(),
      mappedGamesQueried: games.length,
      recordsCreated: persisted.recordsCreated,
      recordsUpdated: persisted.recordsUpdated,
      storeAvailable: observations.filter(
        ({ observation }) => observation.storeAvailable,
      ).length,
      unavailableApps: observations.filter(
        ({ observation }) => !observation.storeAvailable,
      ).length,
      playerCountCoverage: observations.filter(
        ({ observation }) => observation.currentPlayers !== null,
      ).length,
      reviewCoverage: observations.filter(
        ({ observation }) => observation.totalReviews !== null,
      ).length,
      priceCoverage: observations.filter(
        ({ observation }) => observation.currentPrice !== null,
      ).length,
      freeToPlay: observations.filter(
        ({ observation }) => observation.freeToPlay === true,
      ).length,
      discounted: observations.filter(
        ({ observation }) => (observation.discountPercent ?? 0) > 0,
      ).length,
      durationMs: completedAt.getTime() - startedAt.getTime(),
    };
    await input.store.completeRun({
      runId,
      sourceId: source.id,
      completedAt,
      recordsRead,
      recordsCreated: persisted.recordsCreated,
      recordsUpdated: persisted.recordsUpdated,
      metadata: result,
    });
    return result;
  } catch (error) {
    const errorMessage = sanitiseIngestionError(error);
    try {
      await input.store.failRun({
        runId,
        completedAt: now(),
        recordsRead,
        errorMessage,
      });
    } catch {}
    throw new IngestionExecutionError(errorMessage);
  }
}
