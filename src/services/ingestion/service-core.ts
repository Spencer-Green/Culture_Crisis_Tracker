import type { SourceDefinition } from "@/data-sources/catalog";
import { HttpRequestError } from "@/lib/http";
import type {
  DataSourceAdapter,
  NormalisedObservation,
} from "@/data-sources/types";
import type {
  IngestionResult,
  IngestionStore,
} from "@/services/ingestion/types";

export class IngestionPolicyError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "IngestionPolicyError";
  }
}

export class IngestionExecutionError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "IngestionExecutionError";
  }
}

export function sanitiseIngestionError(error: unknown): string {
  if (error instanceof HttpRequestError) {
    return `Remote source request failed: ${error.message}`.slice(0, 500);
  }

  if (
    error instanceof IngestionPolicyError ||
    error instanceof IngestionExecutionError
  ) {
    return error.message.slice(0, 500);
  }

  if (
    error instanceof Error &&
    (error.name === "UnsupportedAbsMetricError" ||
      error.name === "UnsupportedOnsMetricError" ||
      error.name === "UnsupportedBeaMetricError" ||
      error.name === "UnsupportedFredMetricError" ||
      error.name === "UnsupportedEurostatMetricError" ||
      error.name === "UnsupportedStatCanMetricError" ||
      error.name === "BeaResponseError" ||
      error.name === "FredResponseError" ||
      error.name === "EurostatResponseError" ||
      error.name === "StatCanResponseError" ||
      error.name === "GdeltResponseError" ||
      error.name === "TheNewsApiResponseError" ||
      error.name === "RssParseError" ||
      error.name === "USBoxOfficeParseError" ||
      error.name === "USBoxOfficeResponseError" ||
      error.name === "BFIParseError" ||
      error.name === "BFIResponseError" ||
      error.name === "TicketmasterResponseError" ||
      error.name === "IgdbResponseError" ||
      error.name === "SteamResponseError")
  ) {
    return error.message.slice(0, 500);
  }

  return "Ingestion failed while processing source data.";
}

type RunIngestionInput = {
  sourceDefinition: SourceDefinition;
  adapter: DataSourceAdapter;
  store: IngestionStore;
  startDate: Date;
  endDate: Date;
  startPeriod: string;
  endPeriod: string;
  metricSlugs?: readonly string[];
  now?: () => Date;
};

export async function runIngestion(
  input: RunIngestionInput,
): Promise<IngestionResult> {
  const now = input.now ?? (() => new Date());
  const source = await input.store.findSource(input.sourceDefinition.slug);

  if (!source) {
    throw new IngestionPolicyError(
      `Source "${input.sourceDefinition.slug}" is not present in the database. Run the seed first.`,
    );
  }
  if (input.sourceDefinition.implementationStatus !== "implemented") {
    throw new IngestionPolicyError(
      `Source "${source.slug}" is not implemented.`,
    );
  }
  if (!input.adapter.isConfigured()) {
    throw new IngestionPolicyError(
      `Source "${source.slug}" is not configured.`,
    );
  }
  if (!source.enabled) {
    throw new IngestionPolicyError(`Source "${source.slug}" is disabled.`);
  }

  const availableMetrics = await input.adapter.fetchAvailableMetrics();
  const requestedMetricSlugs =
    input.metricSlugs && input.metricSlugs.length > 0
      ? [...new Set(input.metricSlugs)]
      : availableMetrics.map((metric) => metric.slug);
  const metricsBySlug = new Map(
    availableMetrics.map((metric) => [metric.slug, metric]),
  );

  for (const slug of requestedMetricSlugs) {
    if (!metricsBySlug.has(slug)) {
      throw new IngestionPolicyError(
        `Metric "${slug}" is not implemented for source "${source.slug}".`,
      );
    }
  }

  const startedAt = now();
  const runId = await input.store.createRun({
    sourceId: source.id,
    startedAt,
    metadata: {
      startPeriod: input.startPeriod,
      endPeriod: input.endPeriod,
      metrics: requestedMetricSlugs,
    },
  });

  let recordsRead = 0;
  let recordsCreated = 0;
  let recordsUpdated = 0;

  try {
    await input.store.markSourceAttempted(source.id, startedAt);

    const fetchedMetrics: {
      slug: string;
      observations: NormalisedObservation[];
    }[] = [];

    for (const metricSlug of requestedMetricSlugs) {
      const observations = await input.adapter.fetchObservations({
        metricSlug,
        countryCode: input.sourceDefinition.countries[0],
        startDate: input.startDate,
        endDate: input.endDate,
      });
      fetchedMetrics.push({ slug: metricSlug, observations });
      recordsRead += observations.length;
    }

    for (const fetched of fetchedMetrics) {
      const metric = metricsBySlug.get(fetched.slug);
      if (!metric) {
        throw new IngestionExecutionError(
          `Metric "${fetched.slug}" disappeared during ingestion.`,
        );
      }

      const persisted = await input.store.persistMetricObservations({
        sourceId: source.id,
        metric,
        countryCode: metric.countryCode ?? input.sourceDefinition.countries[0],
        sectorSlug: metric.sectorSlug ?? input.sourceDefinition.sectors[0],
        observations: fetched.observations,
      });
      recordsCreated += persisted.recordsCreated;
      recordsUpdated += persisted.recordsUpdated;
    }

    const completedAt = now();
    await input.store.completeRun({
      runId,
      sourceId: source.id,
      completedAt,
      recordsRead,
      recordsCreated,
      recordsUpdated,
    });

    return {
      runId,
      sourceSlug: source.slug,
      startPeriod: input.startPeriod,
      endPeriod: input.endPeriod,
      metricsProcessed: requestedMetricSlugs,
      recordsRead,
      recordsCreated,
      recordsUpdated,
      durationMs: completedAt.getTime() - startedAt.getTime(),
    };
  } catch (error) {
    const errorMessage = sanitiseIngestionError(error);

    try {
      await input.store.failRun({
        runId,
        completedAt: now(),
        errorMessage,
        recordsRead,
        recordsCreated,
        recordsUpdated,
      });
    } catch {
      // Preserve the sanitised source failure if database failure reporting
      // itself becomes unavailable.
    }

    throw new IngestionExecutionError(errorMessage);
  }
}
