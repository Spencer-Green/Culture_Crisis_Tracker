import "server-only";

import { getSourceDefinition } from "@/data-sources/catalog";
import { usBoxOfficeAdapter } from "@/data-sources/film/us-box-office";
import { env } from "@/lib/env";
import { getPrisma } from "@/lib/prisma";
import { runUSBoxOfficeIngestion } from "@/services/film/us-box-office-ingestion-core";
import { PrismaUSBoxOfficeIngestionStore } from "@/services/film/us-box-office-prisma-store";

export function ingestUSBoxOffice(startYear: number) {
  return runUSBoxOfficeIngestion({
    sourceDefinition: getSourceDefinition("us-box-office"),
    adapter: usBoxOfficeAdapter,
    store: new PrismaUSBoxOfficeIngestionStore(getPrisma()),
    baseUrl: env.US_BOX_OFFICE_BASE_URL,
    startYear,
  });
}
