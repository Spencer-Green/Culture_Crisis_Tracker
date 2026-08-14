import type { CountryCode, SectorSlug } from "@/lib/constants";
import type { ImplementationStatus } from "@/data-sources/status";
import type {
  BaseUrlEnvironmentKey,
  SecretEnvironmentKey,
} from "@/lib/env-schema";

type SourceDefinitionShape = {
  slug: string;
  name: string;
  provider: string;
  baseUrlEnvironmentKey: BaseUrlEnvironmentKey;
  requiredCredentialEnvironmentKeys: readonly SecretEnvironmentKey[];
  countries: readonly CountryCode[];
  sectors: readonly SectorSlug[];
  requiresAuthentication: boolean;
  implementationStatus: ImplementationStatus;
};

const ALL_COUNTRIES = ["AU", "US", "GB", "CA", "NZ", "EU"] as const;
const ALL_SECTORS = [
  "consumer-spending",
  "music",
  "film",
  "theatre",
  "gaming",
  "ai-policy",
  "industry-events",
] as const;

export const SOURCE_DEFINITIONS = [
  {
    slug: "abs",
    name: "ABS",
    provider: "Australian Bureau of Statistics",
    baseUrlEnvironmentKey: "ABS_BASE_URL",
    requiredCredentialEnvironmentKeys: [],
    countries: ["AU"],
    sectors: ["consumer-spending"],
    requiresAuthentication: false,
    implementationStatus: "implemented",
  },
  {
    slug: "bea",
    name: "BEA",
    provider: "U.S. Bureau of Economic Analysis",
    baseUrlEnvironmentKey: "BEA_BASE_URL",
    requiredCredentialEnvironmentKeys: ["BEA_API_KEY"],
    countries: ["US"],
    sectors: ["consumer-spending", "music"],
    requiresAuthentication: true,
    implementationStatus: "implemented",
  },
  {
    slug: "fred",
    name: "FRED",
    provider: "Federal Reserve Bank of St. Louis",
    baseUrlEnvironmentKey: "FRED_BASE_URL",
    requiredCredentialEnvironmentKeys: ["FRED_API_KEY"],
    countries: ["US"],
    sectors: ["consumer-spending"],
    requiresAuthentication: true,
    implementationStatus: "implemented",
  },
  {
    slug: "ons",
    name: "ONS",
    provider: "Office for National Statistics",
    baseUrlEnvironmentKey: "ONS_BASE_URL",
    requiredCredentialEnvironmentKeys: [],
    countries: ["GB"],
    sectors: ["consumer-spending"],
    requiresAuthentication: false,
    implementationStatus: "implemented",
  },
  {
    slug: "eurostat",
    name: "EU Structural Benchmark",
    provider: "European Commission",
    baseUrlEnvironmentKey: "EUROSTAT_BASE_URL",
    requiredCredentialEnvironmentKeys: [],
    countries: ["EU"],
    sectors: ["consumer-spending"],
    requiresAuthentication: false,
    implementationStatus: "implemented",
  },
  {
    slug: "statcan",
    name: "Statistics Canada",
    provider: "Government of Canada",
    baseUrlEnvironmentKey: "STATCAN_BASE_URL",
    requiredCredentialEnvironmentKeys: [],
    countries: ["CA"],
    sectors: ["consumer-spending"],
    requiresAuthentication: false,
    implementationStatus: "implemented",
  },
  {
    slug: "stats-nz",
    name: "Stats NZ",
    provider: "Statistics New Zealand",
    baseUrlEnvironmentKey: "STATS_NZ_BASE_URL",
    requiredCredentialEnvironmentKeys: ["STATS_NZ_API_KEY"],
    countries: ["NZ"],
    sectors: ["consumer-spending"],
    requiresAuthentication: true,
    implementationStatus: "not-implemented",
  },
  {
    slug: "gdelt",
    name: "GDELT",
    provider: "GDELT Project",
    baseUrlEnvironmentKey: "GDELT_BASE_URL",
    requiredCredentialEnvironmentKeys: [],
    countries: ["AU", "US", "GB", "CA"],
    sectors: ["music", "film", "theatre", "gaming", "industry-events"],
    requiresAuthentication: false,
    implementationStatus: "implemented",
  },
  {
    slug: "ticketmaster",
    name: "Ticketmaster Discovery",
    provider: "Ticketmaster",
    baseUrlEnvironmentKey: "TICKETMASTER_BASE_URL",
    requiredCredentialEnvironmentKeys: ["TICKETMASTER_API_KEY"],
    countries: ["AU", "US", "GB", "CA"],
    sectors: ["music", "theatre", "film", "industry-events"],
    requiresAuthentication: true,
    implementationStatus: "implemented",
  },
  {
    slug: "eventbrite",
    name: "Eventbrite",
    provider: "Eventbrite",
    baseUrlEnvironmentKey: "EVENTBRITE_BASE_URL",
    requiredCredentialEnvironmentKeys: ["EVENTBRITE_PRIVATE_TOKEN"],
    countries: ALL_COUNTRIES,
    sectors: ["music", "theatre", "industry-events"],
    requiresAuthentication: true,
    implementationStatus: "not-implemented",
  },
  {
    slug: "steam",
    name: "Steam Web API",
    provider: "Valve",
    baseUrlEnvironmentKey: "STEAM_BASE_URL",
    requiredCredentialEnvironmentKeys: ["STEAM_WEB_API_KEY"],
    countries: ALL_COUNTRIES,
    sectors: ["gaming"],
    requiresAuthentication: true,
    implementationStatus: "implemented",
  },
  {
    slug: "igdb",
    name: "IGDB",
    provider: "Twitch",
    baseUrlEnvironmentKey: "IGDB_BASE_URL",
    requiredCredentialEnvironmentKeys: ["IGDB_CLIENT_ID", "IGDB_CLIENT_SECRET"],
    countries: ALL_COUNTRIES,
    sectors: ["gaming"],
    requiresAuthentication: true,
    implementationStatus: "implemented",
  },
  {
    slug: "thenewsapi",
    name: "TheNewsAPI",
    provider: "TheNewsAPI",
    baseUrlEnvironmentKey: "THENEWSAPI_BASE_URL",
    requiredCredentialEnvironmentKeys: ["THENEWSAPI_API_KEY"],
    countries: ALL_COUNTRIES,
    sectors: [
      "music",
      "film",
      "theatre",
      "gaming",
      "ai-policy",
      "industry-events",
    ],
    requiresAuthentication: true,
    implementationStatus: "implemented",
  },
  {
    slug: "rss",
    name: "Curated RSS Feeds",
    provider: "Publisher-exposed RSS and Atom feeds",
    baseUrlEnvironmentKey: "RSS_BASE_URL",
    requiredCredentialEnvironmentKeys: [],
    countries: ALL_COUNTRIES,
    sectors: [
      "music",
      "film",
      "theatre",
      "gaming",
      "ai-policy",
      "industry-events",
    ],
    requiresAuthentication: false,
    implementationStatus: "implemented",
  },
  {
    slug: "mediastack",
    name: "Mediastack",
    provider: "APILayer",
    baseUrlEnvironmentKey: "MEDIASTACK_BASE_URL",
    requiredCredentialEnvironmentKeys: ["MEDIASTACK_API_KEY"],
    countries: ALL_COUNTRIES,
    sectors: ALL_SECTORS,
    requiresAuthentication: true,
    implementationStatus: "not-implemented",
  },
  {
    slug: "us-box-office",
    name: "US Box Office — Provisional",
    provider: "Kaggle community dataset",
    baseUrlEnvironmentKey: "US_BOX_OFFICE_BASE_URL",
    requiredCredentialEnvironmentKeys: [],
    countries: ["US"],
    sectors: ["film"],
    requiresAuthentication: false,
    implementationStatus: "implemented",
  },
  {
    slug: "broadway-business",
    name: "Broadway Business",
    provider: "Broadway Business",
    baseUrlEnvironmentKey: "BROADWAY_BUSINESS_BASE_URL",
    requiredCredentialEnvironmentKeys: [],
    countries: ["US"],
    sectors: ["theatre"],
    requiresAuthentication: false,
    implementationStatus: "implemented",
  },
  {
    slug: "bfi",
    name: "British Film Institute",
    provider: "British Film Institute",
    baseUrlEnvironmentKey: "BFI_BASE_URL",
    requiredCredentialEnvironmentKeys: [],
    countries: ["GB"],
    sectors: ["film"],
    requiresAuthentication: false,
    implementationStatus: "implemented",
  },
  {
    slug: "mvt",
    name: "Music Venue Trust",
    provider: "Music Venue Trust",
    baseUrlEnvironmentKey: "MVT_BASE_URL",
    requiredCredentialEnvironmentKeys: [],
    countries: ["GB"],
    sectors: ["music"],
    requiresAuthentication: false,
    implementationStatus: "implemented",
  },
  {
    slug: "census",
    name: "US Census Bureau",
    provider: "U.S. Census Bureau",
    baseUrlEnvironmentKey: "CENSUS_BASE_URL",
    requiredCredentialEnvironmentKeys: [],
    countries: ["US"],
    sectors: ["music"],
    requiresAuthentication: false,
    implementationStatus: "implemented",
  },
] as const satisfies readonly SourceDefinitionShape[];

export type SourceDefinition = (typeof SOURCE_DEFINITIONS)[number];
export type SourceSlug = SourceDefinition["slug"];

export function getSourceDefinition(slug: SourceSlug): SourceDefinition {
  const source = SOURCE_DEFINITIONS.find(
    (definition) => definition.slug === slug,
  );

  if (!source) {
    throw new Error(`Unknown data source: ${slug}`);
  }

  return source;
}
