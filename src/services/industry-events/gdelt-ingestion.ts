import "server-only";

import { getSourceDefinition } from "@/data-sources/catalog";
import {
  gdeltMaxRecordsForDays,
  resolveGdeltWindow,
} from "@/data-sources/news/gdelt-cli";
import type { GdeltQueryFamilyId } from "@/data-sources/news/gdelt-queries";
import type { GdeltCountryCode } from "@/data-sources/news/gdelt-taxonomy";
import { gdeltAdapter } from "@/data-sources/news/gdelt";
import { getPrisma } from "@/lib/prisma";
import { runGdeltIngestion } from "@/services/industry-events/gdelt-ingestion-core";
import { PrismaGdeltIngestionStore } from "@/services/industry-events/gdelt-prisma-store";

export function ingestGdelt(input: {
  days: number;
  queryFamily?: GdeltQueryFamilyId;
  countryCode?: GdeltCountryCode;
  now?: Date;
}) {
  const now = input.now ?? new Date();
  const range = resolveGdeltWindow(input.days, now);
  return runGdeltIngestion({
    sourceDefinition: getSourceDefinition("gdelt"),
    adapter: gdeltAdapter,
    store: new PrismaGdeltIngestionStore(getPrisma()),
    days: input.days,
    ...range,
    maxRecords: gdeltMaxRecordsForDays(input.days),
    queryFamily: input.queryFamily,
    countryCode: input.countryCode,
  });
}
