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

type SourceSeedRuntimeState = {
  enabled: boolean;
};

export type SourceSeedOperation = {
  where: { slug: SourceDefinition["slug"] };
  update: SourceSeedMetadata;
  create: SourceSeedMetadata &
    SourceSeedRuntimeState & {
      slug: SourceDefinition["slug"];
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
    baseUrl:
      source.sourceUrl ??
      environment[source.baseUrlEnvironmentKey] ??
      (source.slug === "us-box-office"
        ? "https://www.kaggle.com/api/v1"
        : source.slug === "broadway-business"
          ? "https://broadwaybusiness.com/grosses"
          : source.slug === "bfi"
            ? "https://www.bfi.org.uk/industry-data-insights/weekend-box-office-figures"
            : source.slug === "screen-australia"
              ? "https://box-office-widget.twistedpear-wgp.workers.dev"
              : source.slug === "mvt"
                ? "https://www.musicvenuetrust.com/resources/"
                : source.slug === "census"
                  ? "https://www2.census.gov/programs-surveys/aies/data"
                  : source.slug === "lpa"
                    ? "https://reports.liveperformance.com.au/"
                    : ""),
    countryCode,
    sectorSlug,
    requiresAuthentication: source.requiresAuthentication,
  };
  const runtimeState = {
    // Seed policy is explicit and independent from configuration or health.
    enabled: [
      "abs",
      "bea",
      "eurostat",
      "fred",
      "gdelt",
      "ons",
      "statcan",
      "ticketmaster",
      "igdb",
      "steam",
      "thenewsapi",
      "rss",
      "copyright-newsnet",
      "cfpb-newsroom",
      "ftc-competition",
      "ftc-consumer-protection",
      "nist-information-technology",
      "uk-dsit",
      "uk-ipo",
      "uk-cma",
      "eu-dg-connect",
      "tech-policy-press",
      "lawfare-cybersecurity-tech",
      "cset",
      "ai-now-institute",
      "kluwer-copyright-blog",
      "normal-technology",
      "blood-in-the-machine",
      "chinai",
      "authors-alliance",
      "creative-commons",
      "us-box-office",
      "broadway-business",
      "bfi",
      "screen-australia",
      "mvt",
      "census",
      "lpa",
    ].includes(source.slug),
  };

  return {
    where: { slug: source.slug },
    update: metadata,
    create: {
      slug: source.slug,
      ...metadata,
      ...runtimeState,
    },
  };
}
