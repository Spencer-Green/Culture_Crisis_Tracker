import { getMediaQueryFamily } from "@/data-sources/news/media-queries";
import type { MediaSectorSlug } from "@/data-sources/news/media-types";
import { THENEWSAPI_MAX_REQUESTS_PER_RUN } from "@/data-sources/news/thenewsapi-api";

const MEDIA_SECTORS = [
  "music",
  "film",
  "theatre",
  "gaming",
  "ai-policy",
  "industry-events",
] as const;

function args(argv: readonly string[]): Map<string, string> {
  const values = new Map<string, string>();
  for (const argument of argv) {
    const match = /^--([a-z-]+)=(.+)$/.exec(argument);
    if (!match)
      throw new Error(
        `Invalid argument "${argument}". Use --name=value syntax.`,
      );
    values.set(match[1], match[2]);
  }
  return values;
}

function integer(
  value: string | undefined,
  fallback: number,
  name: string,
  min: number,
  max: number,
): number {
  const parsed = value === undefined ? fallback : Number(value);
  if (!Number.isInteger(parsed) || parsed < min || parsed > max)
    throw new Error(`${name} must be an integer between ${min} and ${max}.`);
  return parsed;
}

function sector(value: string | undefined): MediaSectorSlug | undefined {
  if (!value) return undefined;
  if (!(MEDIA_SECTORS as readonly string[]).includes(value))
    throw new Error(`Unknown media sector "${value}".`);
  return value as MediaSectorSlug;
}

export function parseNewsApiCli(argv: readonly string[]) {
  const values = args(argv);
  const family = values.get("family");
  if (family && !getMediaQueryFamily(family))
    throw new Error(`Unknown media query family "${family}".`);
  return {
    hours: integer(values.get("hours"), 24, "hours", 1, 168),
    maxRequests: integer(
      values.get("max-requests"),
      15,
      "max-requests",
      1,
      THENEWSAPI_MAX_REQUESTS_PER_RUN,
    ),
    family,
    sector: sector(values.get("sector")),
  };
}

export function parseRssCli(argv: readonly string[]) {
  const values = args(argv);
  return {
    hours: integer(values.get("hours"), 72, "hours", 1, 168),
    sourceSlug: values.get("source"),
    sector: sector(values.get("sector")),
  };
}

export function mediaWindow(
  hours: number,
  now = new Date(),
): { startDate: Date; endDate: Date } {
  return {
    startDate: new Date(now.getTime() - hours * 60 * 60 * 1_000),
    endDate: now,
  };
}
