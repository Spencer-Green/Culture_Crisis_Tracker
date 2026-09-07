import { z } from "zod";

export const SECRET_ENVIRONMENT_KEYS = [
  "BEA_API_KEY",
  "FRED_API_KEY",
  "STATS_NZ_API_KEY",
  "TICKETMASTER_API_KEY",
  "EVENTBRITE_PRIVATE_TOKEN",
  "STEAM_WEB_API_KEY",
  "IGDB_CLIENT_ID",
  "IGDB_CLIENT_SECRET",
  "THENEWSAPI_API_KEY",
  "MEDIASTACK_API_KEY",
  "OPENAI_API_KEY",
  "DEEPSEEK_API_KEY",
] as const;

export type SecretEnvironmentKey = (typeof SECRET_ENVIRONMENT_KEYS)[number];

export const BASE_URL_ENVIRONMENT_KEYS = [
  "ABS_BASE_URL",
  "BEA_BASE_URL",
  "FRED_BASE_URL",
  "ONS_BASE_URL",
  "EUROSTAT_BASE_URL",
  "STATCAN_BASE_URL",
  "STATS_NZ_BASE_URL",
  "GDELT_BASE_URL",
  "TICKETMASTER_BASE_URL",
  "EVENTBRITE_BASE_URL",
  "STEAM_BASE_URL",
  "IGDB_BASE_URL",
  "THENEWSAPI_BASE_URL",
  "RSS_BASE_URL",
  "US_BOX_OFFICE_BASE_URL",
  "BROADWAY_BUSINESS_BASE_URL",
  "BFI_BASE_URL",
  "SCREEN_AUSTRALIA_BASE_URL",
  "MVT_BASE_URL",
  "CENSUS_BASE_URL",
  "LPA_BASE_URL",
  "MEDIASTACK_BASE_URL",
  "OPENAI_BASE_URL",
  "DEEPSEEK_BASE_URL",
] as const;

export type BaseUrlEnvironmentKey = (typeof BASE_URL_ENVIRONMENT_KEYS)[number];

export type SourceEnvironmentKey = BaseUrlEnvironmentKey | SecretEnvironmentKey;

const optionalString = z.preprocess(
  (value) =>
    typeof value === "string" && value.trim() === "" ? undefined : value,
  z.string().trim().min(1).optional(),
);

const optionalUrl = (name: string) =>
  z.preprocess(
    (value) =>
      typeof value === "string" && value.trim() === "" ? undefined : value,
    z.string().url(`${name} must be a valid URL`).optional(),
  );

const optionalBoolean = z.preprocess((value) => {
  if (value === undefined || value === "") return undefined;
  if (typeof value === "string") {
    if (value.toLowerCase() === "true") return true;
    if (value.toLowerCase() === "false") return false;
  }
  return value;
}, z.boolean().optional());

const optionalPositiveInteger = (name: string, maximum: number) =>
  z.preprocess(
    (value) =>
      value === undefined || value === "" ? undefined : Number(value),
    z
      .number()
      .int(`${name} must be an integer`)
      .positive(`${name} must be positive`)
      .max(maximum, `${name} must not exceed ${maximum}`)
      .optional(),
  );

export const serverEnvSchema = z.object({
  DATABASE_URL: optionalUrl("DATABASE_URL"),
  BEA_API_KEY: optionalString,
  FRED_API_KEY: optionalString,
  STATS_NZ_API_KEY: optionalString,
  TICKETMASTER_API_KEY: optionalString,
  EVENTBRITE_PRIVATE_TOKEN: optionalString,
  STEAM_WEB_API_KEY: optionalString,
  IGDB_CLIENT_ID: optionalString,
  IGDB_CLIENT_SECRET: optionalString,
  THENEWSAPI_API_KEY: optionalString,
  MEDIASTACK_API_KEY: optionalString,
  OPENAI_API_KEY: optionalString,
  DEEPSEEK_API_KEY: optionalString,
  ABS_BASE_URL: optionalUrl("ABS_BASE_URL"),
  BEA_BASE_URL: optionalUrl("BEA_BASE_URL"),
  FRED_BASE_URL: optionalUrl("FRED_BASE_URL"),
  ONS_BASE_URL: optionalUrl("ONS_BASE_URL"),
  EUROSTAT_BASE_URL: optionalUrl("EUROSTAT_BASE_URL"),
  STATCAN_BASE_URL: optionalUrl("STATCAN_BASE_URL"),
  STATS_NZ_BASE_URL: optionalUrl("STATS_NZ_BASE_URL"),
  GDELT_BASE_URL: optionalUrl("GDELT_BASE_URL"),
  TICKETMASTER_BASE_URL: optionalUrl("TICKETMASTER_BASE_URL"),
  EVENTBRITE_BASE_URL: optionalUrl("EVENTBRITE_BASE_URL"),
  STEAM_BASE_URL: optionalUrl("STEAM_BASE_URL"),
  IGDB_BASE_URL: optionalUrl("IGDB_BASE_URL"),
  THENEWSAPI_BASE_URL: optionalUrl("THENEWSAPI_BASE_URL").default(
    "https://api.thenewsapi.com/v1",
  ),
  RSS_BASE_URL: optionalUrl("RSS_BASE_URL").default(
    "https://www.rssboard.org/rss-specification",
  ),
  US_BOX_OFFICE_BASE_URL: optionalUrl("US_BOX_OFFICE_BASE_URL").default(
    "https://www.kaggle.com/api/v1",
  ),
  BROADWAY_BUSINESS_BASE_URL: optionalUrl("BROADWAY_BUSINESS_BASE_URL").default(
    "https://broadwaybusiness.com/grosses",
  ),
  BFI_BASE_URL: optionalUrl("BFI_BASE_URL").default(
    "https://www.bfi.org.uk/industry-data-insights/weekend-box-office-figures",
  ),
  SCREEN_AUSTRALIA_BASE_URL: optionalUrl("SCREEN_AUSTRALIA_BASE_URL").default(
    "https://box-office-widget.twistedpear-wgp.workers.dev",
  ),
  MVT_BASE_URL: optionalUrl("MVT_BASE_URL").default(
    "https://www.musicvenuetrust.com/resources/",
  ),
  CENSUS_BASE_URL: optionalUrl("CENSUS_BASE_URL").default(
    "https://www2.census.gov/programs-surveys/aies/data",
  ),
  LPA_BASE_URL: optionalUrl("LPA_BASE_URL").default(
    "https://reports.liveperformance.com.au/",
  ),
  MEDIASTACK_BASE_URL: optionalUrl("MEDIASTACK_BASE_URL"),
  OPENAI_BASE_URL: optionalUrl("OPENAI_BASE_URL").default(
    "https://api.openai.com/v1",
  ),
  DEEPSEEK_BASE_URL: optionalUrl("DEEPSEEK_BASE_URL").default(
    "https://api.deepseek.com",
  ),
  LLM_RESEARCHER_ENABLED: optionalBoolean.default(false),
  LUNA_SYNTHESIS_ENABLED: optionalBoolean.default(false),
  LUNA_SYNTHESIS_MAX_PER_CYCLE: optionalPositiveInteger(
    "LUNA_SYNTHESIS_MAX_PER_CYCLE",
    6,
  ).default(4),
  LUNA_SYNTHESIS_DAILY_CALL_LIMIT: optionalPositiveInteger(
    "LUNA_SYNTHESIS_DAILY_CALL_LIMIT",
    100,
  ).default(16),
  LUNA_SYNTHESIS_LOOKBACK_HOURS: optionalPositiveInteger(
    "LUNA_SYNTHESIS_LOOKBACK_HOURS",
    168,
  ).default(48),
  LUNA_SYNTHESIS_REFRESH_HOURS: optionalPositiveInteger(
    "LUNA_SYNTHESIS_REFRESH_HOURS",
    24,
  ).default(3),
  SCHEDULER_ENABLED: optionalBoolean.default(false),
  SCHEDULER_CONCURRENCY: optionalPositiveInteger(
    "SCHEDULER_CONCURRENCY",
    2,
  ).default(1),
  SCHEDULER_POLL_MINUTES: optionalPositiveInteger(
    "SCHEDULER_POLL_MINUTES",
    60,
  ).default(5),
  MEDIA_REFRESH_HOURS: optionalPositiveInteger(
    "MEDIA_REFRESH_HOURS",
    24,
  ).default(3),
  TICKETMASTER_REFRESH_HOURS: optionalPositiveInteger(
    "TICKETMASTER_REFRESH_HOURS",
    168,
  ).default(24),
  GAMING_REFRESH_HOURS: optionalPositiveInteger(
    "GAMING_REFRESH_HOURS",
    168,
  ).default(24),
});

export type ServerEnv = z.infer<typeof serverEnvSchema>;

export function parseServerEnv(
  input: Readonly<Record<string, string | undefined>>,
): ServerEnv {
  const result = serverEnvSchema.safeParse(input);

  if (!result.success) {
    const issues = result.error.issues.map(
      (issue) => `${issue.path.join(".") || "environment"}: ${issue.message}`,
    );
    throw new Error(`Invalid server environment:\n${issues.join("\n")}`);
  }

  return result.data;
}
