import type { SourceDefinition } from "@/data-sources/catalog";
import type { TicketmasterDataSourceAdapter } from "@/data-sources/entertainment/ticketmaster-adapter";
import {
  getTicketmasterSegment,
  TICKETMASTER_SEGMENTS,
} from "@/data-sources/entertainment/ticketmaster-classifications";
import { searchTicketmasterWindow } from "@/data-sources/entertainment/ticketmaster-search";
import {
  TICKETMASTER_COUNTRIES,
  type TicketmasterCountryCode,
  type TicketmasterEventRecord,
} from "@/data-sources/entertainment/ticketmaster-types";
import {
  IngestionExecutionError,
  IngestionPolicyError,
  sanitiseIngestionError,
} from "@/services/ingestion/service-core";
import {
  buildTicketmasterSupplySnapshots,
  type TicketmasterSupplySnapshotData,
} from "@/services/industry-events/ticketmaster-longitudinal-core";

export interface TicketmasterIngestionStore {
  findSource(
    slug: string,
  ): Promise<{ id: string; slug: string; enabled: boolean } | null>;
  createRun(input: {
    sourceId: string;
    startedAt: Date;
    metadata: Record<string, unknown>;
  }): Promise<string>;
  markSourceAttempted(sourceId: string, attemptedAt: Date): Promise<void>;
  persistEvents(input: {
    runId: string;
    sourceId: string;
    events: readonly TicketmasterEventRecord[];
    retrievedAt: Date;
  }): Promise<{
    recordsCreated: number;
    recordsUpdated: number;
    statusChanges: number;
  }>;
  completeRun(input: {
    runId: string;
    sourceId: string;
    completedAt: Date;
    recordsRead: number;
    recordsCreated: number;
    recordsUpdated: number;
    snapshots: readonly TicketmasterSupplySnapshotData[];
    metadata: Record<string, unknown>;
  }): Promise<void>;
  failRun(input: {
    runId: string;
    completedAt: Date;
    recordsRead: number;
    errorMessage: string;
  }): Promise<void>;
}

export type TicketmasterIngestionResult = {
  runId: string;
  days: number;
  startDate: string;
  endDateExclusive: string;
  countries: string[];
  segments: string[];
  apiCalls: number;
  windowsQueried: number;
  windowsSplit: number;
  recordsReturned: number;
  outsideWindowRemoved: number;
  splitProbeRecordsDiscarded: number;
  uniqueEvents: number;
  duplicatesRemoved: number;
  recordsCreated: number;
  recordsUpdated: number;
  statusChanges: number;
  snapshotsCreated: number;
  uniqueVenues: number;
  priceRangeEvents: number;
  statusDistribution: Record<string, number>;
  countryDistribution: Record<string, number>;
  segmentDistribution: Record<string, number>;
  dailyQuotaRemaining: number | null;
  retrievedAt: string;
  durationMs: number;
};

function countBy(values: readonly string[]): Record<string, number> {
  const counts = new Map<string, number>();
  for (const value of values) counts.set(value, (counts.get(value) ?? 0) + 1);
  return Object.fromEntries([...counts.entries()].sort());
}

export async function runTicketmasterIngestion(input: {
  sourceDefinition: SourceDefinition;
  adapter: TicketmasterDataSourceAdapter;
  store: TicketmasterIngestionStore;
  days: number;
  startDate: Date;
  endDateExclusive: Date;
  countryCode?: TicketmasterCountryCode;
  segmentSlug?: string;
  now?: () => Date;
}): Promise<TicketmasterIngestionResult> {
  const source = await input.store.findSource(input.sourceDefinition.slug);
  if (!source)
    throw new IngestionPolicyError(
      'Source "ticketmaster" is not present. Run seed first.',
    );
  if (input.sourceDefinition.implementationStatus !== "implemented") {
    throw new IngestionPolicyError('Source "ticketmaster" is not implemented.');
  }
  if (!input.adapter.isConfigured())
    throw new IngestionPolicyError('Source "ticketmaster" is not configured.');
  if (!source.enabled)
    throw new IngestionPolicyError('Source "ticketmaster" is disabled.');

  const countries = input.countryCode
    ? [input.countryCode]
    : [...TICKETMASTER_COUNTRIES];
  const selectedSegment = input.segmentSlug
    ? getTicketmasterSegment(input.segmentSlug)
    : undefined;
  if (input.segmentSlug && !selectedSegment) {
    throw new IngestionPolicyError(
      `Unsupported Ticketmaster segment "${input.segmentSlug}".`,
    );
  }
  const segments = selectedSegment
    ? [selectedSegment]
    : [...TICKETMASTER_SEGMENTS];
  const now = input.now ?? (() => new Date());
  const startedAt = now();
  const runId = await input.store.createRun({
    sourceId: source.id,
    startedAt,
    metadata: {
      days: input.days,
      startDate: input.startDate.toISOString(),
      endDateExclusive: input.endDateExclusive.toISOString(),
      countries,
      segments: segments.map((segment) => segment.slug),
      requestUrlsPersisted: false,
    },
  });
  let recordsRead = 0;
  try {
    await input.store.markSourceAttempted(source.id, startedAt);
    const client = input.adapter.createClient();
    const { baseUrl, apiKey } = input.adapter.requireRequestConfiguration();
    const fetched: TicketmasterEventRecord[] = [];
    let apiCalls = 0;
    let windowsQueried = 0;
    let windowsSplit = 0;
    let duplicatesRemoved = 0;
    let outsideWindowRemoved = 0;
    let splitProbeRecordsDiscarded = 0;
    let dailyQuotaRemaining: number | null = null;
    for (const countryCode of countries) {
      for (const segment of segments) {
        const result = await searchTicketmasterWindow({
          client,
          baseUrl,
          apiKey,
          countryCode,
          segment,
          window: {
            startDate: input.startDate,
            endDateExclusive: input.endDateExclusive,
          },
        });
        fetched.push(...result.events);
        apiCalls += result.apiCalls;
        recordsRead += result.recordsReturned;
        windowsQueried += result.windowsQueried.length;
        windowsSplit += result.splitCount;
        duplicatesRemoved += result.duplicatesRemoved;
        outsideWindowRemoved += result.outsideWindowRemoved;
        splitProbeRecordsDiscarded += result.splitProbeRecordsDiscarded;
        dailyQuotaRemaining =
          result.rateLimit.dailyRemaining ?? dailyQuotaRemaining;
      }
    }
    const unique = new Map<string, TicketmasterEventRecord>();
    for (const event of fetched) unique.set(event.ticketmasterId, event);
    duplicatesRemoved += fetched.length - unique.size;
    const events = [...unique.values()];
    const retrievedAt = now();
    const persisted = await input.store.persistEvents({
      runId,
      sourceId: source.id,
      events,
      retrievedAt,
    });
    const completeCoverage =
      countries.length === TICKETMASTER_COUNTRIES.length &&
      segments.length === TICKETMASTER_SEGMENTS.length;
    const snapshots = completeCoverage
      ? buildTicketmasterSupplySnapshots({
          ingestionRunId: runId,
          capturedAt: retrievedAt,
          startDate: input.startDate,
          runWindowDays: input.days,
          events,
        })
      : [];
    const completedAt = now();
    const result = {
      runId,
      days: input.days,
      startDate: input.startDate.toISOString(),
      endDateExclusive: input.endDateExclusive.toISOString(),
      countries,
      segments: segments.map((segment) => segment.slug),
      apiCalls,
      windowsQueried,
      windowsSplit,
      recordsReturned: recordsRead,
      outsideWindowRemoved,
      splitProbeRecordsDiscarded,
      uniqueEvents: events.length,
      duplicatesRemoved,
      recordsCreated: persisted.recordsCreated,
      recordsUpdated: persisted.recordsUpdated,
      statusChanges: persisted.statusChanges,
      snapshotsCreated: snapshots.length,
      uniqueVenues: new Set(
        events.map((event) => event.venue?.ticketmasterId).filter(Boolean),
      ).size,
      priceRangeEvents: events.filter(
        (event) => event.priceMin !== null || event.priceMax !== null,
      ).length,
      statusDistribution: countBy(events.map((event) => event.status)),
      countryDistribution: countBy(events.map((event) => event.countryCode)),
      segmentDistribution: countBy(events.map((event) => event.segmentName)),
      dailyQuotaRemaining,
      retrievedAt: retrievedAt.toISOString(),
      durationMs: completedAt.getTime() - startedAt.getTime(),
    } satisfies TicketmasterIngestionResult;
    await input.store.completeRun({
      runId,
      sourceId: source.id,
      completedAt,
      recordsRead,
      recordsCreated: persisted.recordsCreated,
      recordsUpdated: persisted.recordsUpdated,
      snapshots,
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
