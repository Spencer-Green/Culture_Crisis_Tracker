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
  "MEDIASTACK_BASE_URL",
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
  MEDIASTACK_BASE_URL: optionalUrl("MEDIASTACK_BASE_URL"),
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
