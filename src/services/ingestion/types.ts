import type {
  AvailableMetric,
  NormalisedObservation,
} from "@/data-sources/types";

export type IngestionSourceRecord = {
  id: string;
  slug: string;
  enabled: boolean;
};

export type PersistObservationsResult = {
  recordsCreated: number;
  recordsUpdated: number;
};

export type CompleteIngestionRunInput = {
  runId: string;
  sourceId: string;
  completedAt: Date;
  recordsRead: number;
  recordsCreated: number;
  recordsUpdated: number;
};

export interface IngestionStore {
  findSource(slug: string): Promise<IngestionSourceRecord | null>;
  createRun(input: {
    sourceId: string;
    startedAt: Date;
    metadata: Record<string, unknown>;
  }): Promise<string>;
  markSourceAttempted(sourceId: string, attemptedAt: Date): Promise<void>;
  persistMetricObservations(input: {
    sourceId: string;
    metric: AvailableMetric;
    countryCode: string;
    sectorSlug: string;
    observations: readonly NormalisedObservation[];
  }): Promise<PersistObservationsResult>;
  completeRun(input: CompleteIngestionRunInput): Promise<void>;
  failRun(input: {
    runId: string;
    completedAt: Date;
    errorMessage: string;
    recordsRead: number;
    recordsCreated: number;
    recordsUpdated: number;
  }): Promise<void>;
}

export type IngestionResult = {
  runId: string;
  sourceSlug: string;
  startPeriod: string;
  endPeriod: string;
  metricsProcessed: string[];
  recordsRead: number;
  recordsCreated: number;
  recordsUpdated: number;
  durationMs: number;
};
