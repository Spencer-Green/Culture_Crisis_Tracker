import "server-only";

import { getSourceDefinition } from "@/data-sources/catalog";
import { steamAdapter } from "@/data-sources/entertainment/steam";
import { getPrisma } from "@/lib/prisma";
import { runSteamIngestion } from "@/services/gaming/steam-ingestion-core";
import { PrismaSteamIngestionStore } from "@/services/gaming/steam-prisma-store";

export function ingestSteam(input: {
  limit: number;
  offset: number;
  capturedAt: Date;
}) {
  return runSteamIngestion({
    sourceDefinition: getSourceDefinition("steam"),
    adapter: steamAdapter,
    store: new PrismaSteamIngestionStore(getPrisma()),
    ...input,
  });
}
