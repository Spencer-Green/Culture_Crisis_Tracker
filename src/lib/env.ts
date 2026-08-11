import "server-only";

import { getSourceDefinition, type SourceSlug } from "@/data-sources/catalog";
import {
  getSourceConfigurationStatus as getConfigurationStatus,
  type SourceConfigurationStatus,
} from "@/data-sources/configuration";
import { parseServerEnv } from "@/lib/env-schema";

export const env = parseServerEnv(process.env);

export function getSourceConfigurationStatus(
  sourceSlug: SourceSlug,
): SourceConfigurationStatus {
  return getConfigurationStatus(getSourceDefinition(sourceSlug), env);
}

export function isSourceConfigured(sourceSlug: SourceSlug): boolean {
  return getSourceConfigurationStatus(sourceSlug).configured;
}

export function requireDatabaseUrl(): string {
  if (!env.DATABASE_URL) {
    throw new Error(
      "DATABASE_URL is required for this database operation. Set it in the server environment.",
    );
  }

  return env.DATABASE_URL;
}
