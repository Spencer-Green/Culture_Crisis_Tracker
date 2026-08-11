import "server-only";

import { getSourceDefinition, type SourceSlug } from "@/data-sources/catalog";
import { getAdapter } from "@/data-sources/registry";
import { getPrisma } from "@/lib/prisma";
import { PrismaIngestionStore } from "@/services/ingestion/prisma-store";
import { runIngestion } from "@/services/ingestion/service-core";

export type IngestSourceInput = {
  sourceSlug: SourceSlug;
  startDate: Date;
  endDate: Date;
  startPeriod: string;
  endPeriod: string;
  metricSlugs?: readonly string[];
};

export async function ingestSource(input: IngestSourceInput) {
  const sourceDefinition = getSourceDefinition(input.sourceSlug);
  const adapter = getAdapter(input.sourceSlug);

  if (!adapter) {
    throw new Error(`Adapter "${input.sourceSlug}" is not registered.`);
  }

  return runIngestion({
    sourceDefinition,
    adapter,
    store: new PrismaIngestionStore(getPrisma()),
    startDate: input.startDate,
    endDate: input.endDate,
    startPeriod: input.startPeriod,
    endPeriod: input.endPeriod,
    metricSlugs: input.metricSlugs,
  });
}
