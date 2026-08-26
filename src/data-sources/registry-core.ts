import { SOURCE_DEFINITIONS } from "@/data-sources/catalog";
import type { SourceDefinition, SourceSlug } from "@/data-sources/catalog";
import { getSourceConfigurationStatus } from "@/data-sources/configuration";
import type { HealthStatus, ImplementationStatus } from "@/data-sources/status";
import type { ServerEnv, SourceEnvironmentKey } from "@/lib/env-schema";

export type SafeSourceMetadata = {
  slug: SourceSlug;
  name: string;
  provider: string;
  countries: readonly string[];
  sectors: readonly string[];
  isPublic: boolean;
  requiresAuthentication: boolean;
  configured: boolean;
  missingConfiguration: readonly SourceEnvironmentKey[];
  implementationStatus: ImplementationStatus;
  healthStatus: HealthStatus;
  sourceUrl: string | null;
  evidenceRole: string | null;
  sourcePerspective: string | null;
  jurisdiction: string | null;
  sourceSpecialisms: readonly string[];
};

export function buildStaticSourceRegistry(
  environment: Readonly<Partial<ServerEnv>>,
): SafeSourceMetadata[] {
  return SOURCE_DEFINITIONS.map((source) => {
    const definition = source as SourceDefinition;
    const configuration = getSourceConfigurationStatus(source, environment);

    return {
      slug: source.slug,
      name: source.name,
      provider: source.provider,
      countries: source.countries,
      sectors: source.sectors,
      isPublic: !source.requiresAuthentication,
      requiresAuthentication: source.requiresAuthentication,
      configured: configuration.configured,
      missingConfiguration: configuration.missingConfiguration,
      implementationStatus: source.implementationStatus,
      healthStatus: "not-checked",
      sourceUrl: definition.sourceUrl ?? null,
      evidenceRole: definition.evidenceRole ?? null,
      sourcePerspective: definition.sourcePerspective ?? null,
      jurisdiction: definition.jurisdiction ?? null,
      sourceSpecialisms: definition.sourceSpecialisms ?? [],
    };
  });
}
