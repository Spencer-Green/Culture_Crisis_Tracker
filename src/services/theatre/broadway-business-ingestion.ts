import "server-only";

import { getSourceDefinition } from "@/data-sources/catalog";
import { broadwayBusinessAdapter } from "@/data-sources/theatre/broadway-business";
import { env } from "@/lib/env";
import { getPrisma } from "@/lib/prisma";
import { runBroadwayBusinessIngestion } from "@/services/theatre/broadway-business-ingestion-core";
import { PrismaBroadwayBusinessIngestionStore } from "@/services/theatre/broadway-business-prisma-store";

export function ingestBroadwayBusiness(since: Date) {
  return runBroadwayBusinessIngestion({
    sourceDefinition: getSourceDefinition("broadway-business"),
    adapter: broadwayBusinessAdapter,
    store: new PrismaBroadwayBusinessIngestionStore(getPrisma()),
    baseUrl: env.BROADWAY_BUSINESS_BASE_URL,
    since,
  });
}
