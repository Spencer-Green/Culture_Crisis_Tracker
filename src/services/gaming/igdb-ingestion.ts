import "server-only";

import { getSourceDefinition } from "@/data-sources/catalog";
import { igdbAdapter } from "@/data-sources/entertainment/igdb";
import { getPrisma } from "@/lib/prisma";
import { runIgdbIngestion } from "@/services/gaming/igdb-ingestion-core";
import { PrismaIgdbIngestionStore } from "@/services/gaming/igdb-prisma-store";

export function ingestIgdb(input: {
  startDate: Date;
  endDateExclusive: Date;
  startPeriod: string;
  endPeriod: string;
}) {
  return runIgdbIngestion({
    sourceDefinition: getSourceDefinition("igdb"),
    adapter: igdbAdapter,
    store: new PrismaIgdbIngestionStore(getPrisma()),
    ...input,
  });
}
