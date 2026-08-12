import "server-only";

import { getSourceDefinition } from "@/data-sources/catalog";
import type { TicketmasterSegmentSlug } from "@/data-sources/entertainment/ticketmaster-classifications";
import { resolveTicketmasterWindow } from "@/data-sources/entertainment/ticketmaster-cli";
import { ticketmasterAdapter } from "@/data-sources/entertainment/ticketmaster";
import type { TicketmasterCountryCode } from "@/data-sources/entertainment/ticketmaster-types";
import { getPrisma } from "@/lib/prisma";
import { runTicketmasterIngestion } from "@/services/industry-events/ticketmaster-ingestion-core";
import { PrismaTicketmasterIngestionStore } from "@/services/industry-events/ticketmaster-prisma-store";

export function ingestTicketmaster(input: {
  days: 7 | 30 | 90;
  countryCode?: TicketmasterCountryCode;
  segmentSlug?: TicketmasterSegmentSlug;
  now?: Date;
}) {
  const now = input.now ?? new Date();
  return runTicketmasterIngestion({
    sourceDefinition: getSourceDefinition("ticketmaster"),
    adapter: ticketmasterAdapter,
    store: new PrismaTicketmasterIngestionStore(getPrisma()),
    days: input.days,
    ...resolveTicketmasterWindow(input.days, now),
    countryCode: input.countryCode,
    segmentSlug: input.segmentSlug,
  });
}
