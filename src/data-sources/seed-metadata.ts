import type { SourceDefinition } from "@/data-sources/catalog";
import type { ServerEnv } from "@/lib/env-schema";

type SourceSeedMetadata = {
  name: string;
  provider: string;
  baseUrl: string;
  countryCode: SourceDefinition["countries"][number] | null;
  sectorSlug: SourceDefinition["sectors"][number] | null;
  requiresAuthentication: boolean;
};

export type SourceSeedOperation = {
  where: { slug: SourceDefinition["slug"] };
  update: SourceSeedMetadata;
  create: SourceSeedMetadata & {
    slug: SourceDefinition["slug"];
    enabled: false;
  };
};

export function buildSourceSeedOperation(
  source: SourceDefinition,
  environment: Readonly<Partial<ServerEnv>>,
): SourceSeedOperation {
  // Static coverage can be multi-country/multi-sector. The nullable database
  // fields retain only unambiguous single-value metadata during the MVP.
  const countryCode =
    source.countries.length === 1 ? source.countries[0] : null;
  const sectorSlug = source.sectors.length === 1 ? source.sectors[0] : null;
  const metadata = {
    name: source.name,
    provider: source.provider,
    baseUrl: environment[source.baseUrlEnvironmentKey] ?? "",
    countryCode,
    sectorSlug,
    requiresAuthentication: source.requiresAuthentication,
  };

  return {
    where: { slug: source.slug },
    update: metadata,
    create: {
      slug: source.slug,
      ...metadata,
      enabled: false,
    },
  };
}
