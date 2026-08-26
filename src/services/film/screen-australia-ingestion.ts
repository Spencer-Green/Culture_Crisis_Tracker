import "server-only";

import { getSourceDefinition } from "@/data-sources/catalog";
import { fetchScreenAustraliaWidget } from "@/data-sources/film/screen-australia-api";
import { parseScreenAustraliaWidgetHtml } from "@/data-sources/film/screen-australia-parser";
import { screenAustraliaAdapter } from "@/data-sources/film/screen-australia";
import { env } from "@/lib/env";
import { getPrisma } from "@/lib/prisma";
import { IngestionPolicyError } from "@/services/ingestion/service-core";
import { runScreenAustraliaIngestion } from "@/services/film/screen-australia-ingestion-core";
import { PrismaScreenAustraliaIngestionStore } from "@/services/film/screen-australia-prisma-store";

export async function inspectScreenAustralia() {
  if (!env.SCREEN_AUSTRALIA_BASE_URL)
    throw new IngestionPolicyError("Screen Australia is not configured.");
  const response = await fetchScreenAustraliaWidget(
    env.SCREEN_AUSTRALIA_BASE_URL,
  );
  return {
    ...parseScreenAustraliaWidgetHtml(response.html),
    requestCount: response.requestCount,
    latencyMs: response.latencyMs,
    cacheControl: response.cacheControl,
    sourceUrl: response.retrievedUrl,
  };
}

export function ingestScreenAustralia() {
  return runScreenAustraliaIngestion({
    sourceDefinition: getSourceDefinition("screen-australia"),
    adapter: screenAustraliaAdapter,
    store: new PrismaScreenAustraliaIngestionStore(getPrisma()),
    baseUrl: env.SCREEN_AUSTRALIA_BASE_URL,
  });
}
