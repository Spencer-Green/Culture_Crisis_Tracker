import type { SourceDefinition } from "@/data-sources/catalog";
import type { IgdbDataSourceAdapter } from "@/data-sources/entertainment/igdb-adapter";
import type { IgdbGameRecord } from "@/data-sources/entertainment/igdb-types";
import {
  IngestionExecutionError,
  IngestionPolicyError,
  sanitiseIngestionError,
} from "@/services/ingestion/service-core";

export interface IgdbIngestionStore {
  findSource(
    slug: string,
  ): Promise<{ id: string; slug: string; enabled: boolean } | null>;
  createRun(input: {
    sourceId: string;
    startedAt: Date;
    metadata: Record<string, unknown>;
  }): Promise<string>;
  markSourceAttempted(sourceId: string, attemptedAt: Date): Promise<void>;
  persistGames(input: {
    sourceId: string;
    games: readonly IgdbGameRecord[];
    retrievedAt: Date;
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

export type IgdbIngestionResult = {
  runId: string;
  startPeriod: string;
  endPeriod: string;
  apiCalls: number;
  partitions: number;
  recordsRead: number;
  recordsExcluded: number;
  uniqueGames: number;
  recordsCreated: number;
  recordsUpdated: number;
  steamMappedGames: number;
  developers: number;
  publishers: number;
  genres: number;
  platforms: number;
  gameTypes: Record<string, number>;
  durationMs: number;
};

export function buildMonthlyWindows(startDate: Date, endDateExclusive: Date) {
  if (endDateExclusive <= startDate) {
    throw new IngestionPolicyError("IGDB release window must be positive.");
  }
  const windows: { startDate: Date; endDateExclusive: Date }[] = [];
  let cursor = new Date(startDate);
  while (cursor < endDateExclusive) {
    const nextMonth = new Date(
      Date.UTC(cursor.getUTCFullYear(), cursor.getUTCMonth() + 1, 1),
    );
    const end = nextMonth < endDateExclusive ? nextMonth : endDateExclusive;
    windows.push({
      startDate: new Date(cursor),
      endDateExclusive: new Date(end),
    });
    cursor = end;
  }
  return windows;
}

function countBy(values: readonly string[]): Record<string, number> {
  const counts = new Map<string, number>();
  for (const value of values) counts.set(value, (counts.get(value) ?? 0) + 1);
  return Object.fromEntries([...counts.entries()].sort());
}

export async function runIgdbIngestion(input: {
  sourceDefinition: SourceDefinition;
  adapter: IgdbDataSourceAdapter;
  store: IgdbIngestionStore;
  startDate: Date;
  endDateExclusive: Date;
  startPeriod: string;
  endPeriod: string;
  now?: () => Date;
}): Promise<IgdbIngestionResult> {
  const source = await input.store.findSource(input.sourceDefinition.slug);
  if (!source)
    throw new IngestionPolicyError(
      'Source "igdb" is not present. Run seed first.',
    );
  if (input.sourceDefinition.implementationStatus !== "implemented") {
    throw new IngestionPolicyError('Source "igdb" is not implemented.');
  }
  if (!input.adapter.isConfigured())
    throw new IngestionPolicyError('Source "igdb" is not configured.');
  if (!source.enabled)
    throw new IngestionPolicyError('Source "igdb" is disabled.');

  const now = input.now ?? (() => new Date());
  const startedAt = now();
  const runId = await input.store.createRun({
    sourceId: source.id,
    startedAt,
    metadata: {
      startPeriod: input.startPeriod,
      endPeriod: input.endPeriod,
      inclusionGameTypes: [
        "Main Game",
        "Standalone Expansion",
        "Remake",
        "Remaster",
      ],
      versionParentsExcluded: true,
      authenticatedRequestUrlPersisted: false,
    },
  });
  let recordsRead = 0;
  let recordsExcluded = 0;
  try {
    await input.store.markSourceAttempted(source.id, startedAt);
    const client = input.adapter.createClient();
    const windows = buildMonthlyWindows(
      input.startDate,
      input.endDateExclusive,
    );
    const games = new Map<number, IgdbGameRecord>();
    let apiCalls = 0;
    for (const window of windows) {
      for (let offset = 0; ; offset += 500) {
        const page = await client.fetchGamesPage({
          ...window,
          limit: 500,
          offset,
        });
        apiCalls += 1;
        recordsRead += page.rawCount;
        recordsExcluded += page.rawCount - page.games.length;
        for (const game of page.games) games.set(game.igdbId, game);
        if (page.rawCount < 500) break;
        if (offset >= 9_500) {
          throw new IngestionExecutionError(
            "IGDB monthly partition exceeded the safe pagination boundary.",
          );
        }
      }
    }
    const records = [...games.values()];
    const retrievedAt = now();
    const persisted = await input.store.persistGames({
      sourceId: source.id,
      games: records,
      retrievedAt,
    });
    const developers = new Set<number>();
    const publishers = new Set<number>();
    for (const game of records) {
      for (const company of game.companies) {
        if (company.developer) developers.add(company.igdbId);
        if (company.publisher) publishers.add(company.igdbId);
      }
    }
    const completedAt = now();
    const result: IgdbIngestionResult = {
      runId,
      startPeriod: input.startPeriod,
      endPeriod: input.endPeriod,
      apiCalls,
      partitions: windows.length,
      recordsRead,
      recordsExcluded,
      uniqueGames: records.length,
      recordsCreated: persisted.recordsCreated,
      recordsUpdated: persisted.recordsUpdated,
      steamMappedGames: records.filter((game) => game.steamAppId !== null)
        .length,
      developers: developers.size,
      publishers: publishers.size,
      genres: new Set(
        records.flatMap((game) => game.genres.map((genre) => genre.igdbId)),
      ).size,
      platforms: new Set(
        records.flatMap((game) =>
          game.platforms.map((platform) => platform.igdbId),
        ),
      ).size,
      gameTypes: countBy(records.map((game) => game.gameType.name)),
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
