import { z } from "zod";

import type { HealthStatus } from "@/data-sources/status";
import type { CountryCode, SectorSlug } from "@/lib/constants";

export type DataSourceHealth = {
  status: HealthStatus;
  checkedAt: string | null;
  latencyMs?: number;
  message?: string;
};

export type AvailableMetric = {
  slug: string;
  name: string;
  description: string;
  unit: string;
  frequency: string;
  countryCode?: CountryCode;
  sectorSlug?: SectorSlug;
};

export type ObservationRequest = {
  metricSlug: string;
  countryCode?: CountryCode;
  startDate: Date;
  endDate: Date;
};

const decimalString = z
  .string()
  .trim()
  .regex(
    /^-?(?:0|[1-9]\d*)(?:\.\d+)?$/,
    "Value must be a decimal-compatible string",
  );

export const normalisedObservationSchema = z
  .object({
    metricSlug: z.string().trim().min(1),
    countryCode: z.string().trim().min(2).max(3).optional(),
    sectorSlug: z.string().trim().min(1),
    periodStart: z.coerce.date(),
    periodEnd: z.coerce.date(),
    value: decimalString,
    previousValue: decimalString.nullable().optional(),
    prePandemicBaseline: decimalString.nullable().optional(),
    sourceUrl: z.string().url().nullable().optional(),
    retrievedAt: z.coerce.date(),
    metadata: z.record(z.string(), z.unknown()).default({}),
  })
  .refine((observation) => observation.periodEnd >= observation.periodStart, {
    message: "periodEnd must be on or after periodStart",
    path: ["periodEnd"],
  });

export type NormalisedObservation = z.infer<typeof normalisedObservationSchema>;

export interface DataSourceAdapter {
  readonly slug: string;
  readonly name: string;
  readonly countries: readonly CountryCode[];
  readonly sectors: readonly SectorSlug[];
  isConfigured(): boolean;
  healthCheck(): Promise<DataSourceHealth>;
  fetchAvailableMetrics(): Promise<AvailableMetric[]>;
  fetchObservations(
    request: ObservationRequest,
  ): Promise<NormalisedObservation[]>;
}

export class NotImplementedError extends Error {
  constructor(sourceName: string, operation: string) {
    super(
      `${operation} is not implemented for ${sourceName}; live ingestion has not started.`,
    );
    this.name = "NotImplementedError";
  }
}
