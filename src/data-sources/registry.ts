import "server-only";

import { SOURCE_DEFINITIONS } from "@/data-sources/catalog";
import { eventbriteAdapter } from "@/data-sources/entertainment/eventbrite";
import { igdbAdapter } from "@/data-sources/entertainment/igdb";
import { steamAdapter } from "@/data-sources/entertainment/steam";
import { ticketmasterAdapter } from "@/data-sources/entertainment/ticketmaster";
import { usBoxOfficeAdapter } from "@/data-sources/film/us-box-office";
import { bfiAdapter } from "@/data-sources/film/bfi";
import { screenAustraliaAdapter } from "@/data-sources/film/screen-australia";
import { mvtAdapter } from "@/data-sources/music/mvt";
import { censusAdapter } from "@/data-sources/music/census";
import { absAdapter } from "@/data-sources/macro/abs";
import { beaAdapter } from "@/data-sources/macro/bea";
import { eurostatAdapter } from "@/data-sources/macro/eurostat";
import { fredAdapter } from "@/data-sources/macro/fred";
import { onsAdapter } from "@/data-sources/macro/ons";
import { statcanAdapter } from "@/data-sources/macro/statcan";
import { statsNzAdapter } from "@/data-sources/macro/stats-nz";
import { gdeltAdapter } from "@/data-sources/news/gdelt";
import { mediastackAdapter } from "@/data-sources/news/mediastack";
import { rssAdapter } from "@/data-sources/news/rss";
import { theNewsApiAdapter } from "@/data-sources/news/thenewsapi";
import { broadwayBusinessAdapter } from "@/data-sources/theatre/broadway-business";
import { lpaAdapter } from "@/data-sources/theatre/lpa";
import { buildStaticSourceRegistry } from "@/data-sources/registry-core";
import {
  buildRuntimeSourceRegistry,
  type RuntimeSourceRegistry,
} from "@/data-sources/registry-runtime-core";
import type { DataSourceAdapter } from "@/data-sources/types";
import { env } from "@/lib/env";
import { getPrisma } from "@/lib/prisma";

export const adapters: readonly DataSourceAdapter[] = [
  absAdapter,
  beaAdapter,
  fredAdapter,
  onsAdapter,
  eurostatAdapter,
  statcanAdapter,
  statsNzAdapter,
  gdeltAdapter,
  ticketmasterAdapter,
  eventbriteAdapter,
  steamAdapter,
  igdbAdapter,
  theNewsApiAdapter,
  rssAdapter,
  mediastackAdapter,
  usBoxOfficeAdapter,
  broadwayBusinessAdapter,
  bfiAdapter,
  screenAustraliaAdapter,
  mvtAdapter,
  censusAdapter,
  lpaAdapter,
];

export function getStaticSourceRegistry() {
  return buildStaticSourceRegistry(env);
}

export async function getSourceRegistry(): Promise<RuntimeSourceRegistry> {
  const staticSources = getStaticSourceRegistry();

  return buildRuntimeSourceRegistry(staticSources, async () =>
    getPrisma().dataSource.findMany({
      where: {
        slug: {
          in: SOURCE_DEFINITIONS.map((source) => source.slug),
        },
      },
      select: {
        slug: true,
        enabled: true,
        lastAttemptedSyncAt: true,
        lastSuccessfulSyncAt: true,
      },
    }),
  );
}

export function getAdapter(slug: string): DataSourceAdapter | undefined {
  return adapters.find((adapter) => adapter.slug === slug);
}
