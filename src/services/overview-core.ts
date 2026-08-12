import { isCurrentSource } from "@/data-sources/source-role";

export type OverviewSourceRecord = {
  slug: string;
  name: string;
  lastSuccessfulSyncAt: Date | null;
  ingestionRuns: {
    completedAt: Date | null;
  }[];
  metricDefinitions: {
    observations: {
      periodStart: Date;
      periodEnd: Date;
    }[];
  }[];
};

export type SourceFreshness = {
  slug: string;
  name: string;
  latestObservationPeriod: {
    start: string;
    end: string;
  } | null;
  lastSuccessfulIngestionAt: string | null;
};

export type OverviewState = {
  databaseStatus: "available" | "unavailable";
  successfulSourceCount: number;
  contributingSourceCount: number;
  latestSuccessfulIngestionAt: string | null;
  sourceFreshness: SourceFreshness[];
};

type SuccessfullyIngestedSourceLoader = () => Promise<OverviewSourceRecord[]>;

function latestDate(values: (Date | null | undefined)[]): Date | null {
  return values.reduce<Date | null>((latest, value) => {
    if (!value || (latest && value <= latest)) {
      return latest;
    }

    return value;
  }, null);
}

export async function buildOverviewState(
  loadSuccessfullyIngestedSources: SuccessfullyIngestedSourceLoader,
): Promise<OverviewState> {
  try {
    const records = await loadSuccessfullyIngestedSources();
    const sourceFreshness = records
      .map((source): SourceFreshness => {
        const observations = source.metricDefinitions.flatMap(
          (definition) => definition.observations,
        );
        const latestObservation =
          observations.length === 0
            ? null
            : observations.reduce((latest, observation) =>
                observation.periodEnd > latest.periodEnd ? observation : latest,
              );
        const lastSuccessfulIngestionAt = latestDate([
          source.lastSuccessfulSyncAt,
          ...source.ingestionRuns.map((run) => run.completedAt),
        ]);

        return {
          slug: source.slug,
          name: source.name,
          latestObservationPeriod: latestObservation
            ? {
                start: latestObservation.periodStart.toISOString(),
                end: latestObservation.periodEnd.toISOString(),
              }
            : null,
          lastSuccessfulIngestionAt:
            lastSuccessfulIngestionAt?.toISOString() ?? null,
        };
      })
      .sort((left, right) =>
        (right.lastSuccessfulIngestionAt ?? "").localeCompare(
          left.lastSuccessfulIngestionAt ?? "",
        ),
      );

    const currentSourceFreshness = sourceFreshness.filter((source) =>
      isCurrentSource(source.slug),
    );
    const latestSuccessfulIngestionAt = currentSourceFreshness.reduce<
      string | null
    >((latest, source) => {
      if (
        !source.lastSuccessfulIngestionAt ||
        (latest && source.lastSuccessfulIngestionAt <= latest)
      ) {
        return latest;
      }

      return source.lastSuccessfulIngestionAt;
    }, null);

    return {
      databaseStatus: "available",
      successfulSourceCount: records.length,
      contributingSourceCount: currentSourceFreshness.filter(
        (source) => source.latestObservationPeriod !== null,
      ).length,
      latestSuccessfulIngestionAt,
      sourceFreshness,
    };
  } catch {
    return {
      databaseStatus: "unavailable",
      successfulSourceCount: 0,
      contributingSourceCount: 0,
      latestSuccessfulIngestionAt: null,
      sourceFreshness: [],
    };
  }
}
