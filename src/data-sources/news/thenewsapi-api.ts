import { z } from "zod";

import type { MediaQueryFamily } from "@/data-sources/news/media-queries";
import type { MediaSourceArticle } from "@/data-sources/news/media-types";
import {
  fetchText,
  HttpRequestError,
  sanitiseUrl,
  type FetchImplementation,
} from "@/lib/http";

export const THENEWSAPI_PATH = "/v1/news/all";
export const THENEWSAPI_RESULTS_PER_REQUEST = 3;
export const THENEWSAPI_MAX_REQUESTS_PER_RUN = 25;

const articleSchema = z.object({
  uuid: z.string(),
  title: z.string(),
  description: z.string().nullable().optional(),
  snippet: z.string().nullable().optional(),
  url: z.string(),
  language: z.string().nullable().optional(),
  published_at: z.string(),
  source: z.string().nullable().optional(),
  categories: z.array(z.string()).optional(),
  locale: z.string().nullable().optional(),
  relevance_score: z.union([z.number(), z.string()]).nullable().optional(),
});

const responseSchema = z.object({
  meta: z.object({
    found: z.number().optional(),
    returned: z.number().optional(),
    limit: z.number().optional(),
    page: z.number().optional(),
  }),
  data: z.array(z.unknown()),
});

export type TheNewsApiResponse = {
  articles: MediaSourceArticle[];
  found: number | null;
  returned: number;
  safeRequestUrl: string;
  latencyMs: number;
};

export type TheNewsApiOptions = {
  fetchImplementation?: FetchImplementation;
  timeoutMs?: number;
  maxRetries?: number;
  sleep?: (milliseconds: number) => Promise<void>;
};

export class TheNewsApiResponseError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "TheNewsApiResponseError";
  }
}

export function formatTheNewsApiDate(date: Date): string {
  return date.toISOString().slice(0, 19);
}

function endpoint(baseUrl: string): URL {
  const url = new URL(baseUrl);
  if (url.protocol !== "https:" || url.hostname !== "api.thenewsapi.com") {
    throw new TheNewsApiResponseError(
      "TheNewsAPI requires the official HTTPS API host.",
    );
  }
  const path = url.pathname.replace(/\/+$/, "");
  url.pathname = path.endsWith(THENEWSAPI_PATH) ? path : THENEWSAPI_PATH;
  url.search = "";
  url.hash = "";
  return url;
}

export function buildTheNewsApiUrl(input: {
  baseUrl: string;
  apiToken: string;
  family: MediaQueryFamily;
  startDate: Date;
  endDate: Date;
}): URL {
  if (!input.apiToken.trim()) {
    throw new TheNewsApiResponseError("TheNewsAPI token is missing.");
  }
  if (
    Number.isNaN(input.startDate.getTime()) ||
    Number.isNaN(input.endDate.getTime()) ||
    input.endDate < input.startDate
  ) {
    throw new TheNewsApiResponseError("TheNewsAPI date range is invalid.");
  }
  const url = endpoint(input.baseUrl);
  url.searchParams.set("api_token", input.apiToken);
  url.searchParams.set("search", input.family.search);
  url.searchParams.set("search_fields", "title,description,keywords");
  url.searchParams.set("language", "en");
  url.searchParams.set(
    "published_after",
    formatTheNewsApiDate(input.startDate),
  );
  url.searchParams.set("published_before", formatTheNewsApiDate(input.endDate));
  url.searchParams.set("limit", String(THENEWSAPI_RESULTS_PER_REQUEST));
  url.searchParams.set("sort", "published_at");
  return url;
}

function cleanText(value: string | null | undefined): string | null {
  const cleaned = value?.replace(/\s+/g, " ").trim();
  return cleaned ? cleaned.slice(0, 600) : null;
}

export function parseTheNewsApiResponse(
  body: string,
  family: MediaQueryFamily,
): { articles: MediaSourceArticle[]; found: number | null; returned: number } {
  let json: unknown;
  try {
    json = JSON.parse(body);
  } catch {
    throw new TheNewsApiResponseError("TheNewsAPI returned invalid JSON.");
  }
  const response = responseSchema.safeParse(json);
  if (!response.success) {
    throw new TheNewsApiResponseError(
      "TheNewsAPI returned an invalid response.",
    );
  }
  const articles: MediaSourceArticle[] = [];
  for (const raw of response.data.data) {
    const parsed = articleSchema.safeParse(raw);
    if (!parsed.success) continue;
    const publishedAt = new Date(parsed.data.published_at);
    const title = cleanText(parsed.data.title);
    if (!title || Number.isNaN(publishedAt.getTime())) continue;
    let domain: string;
    try {
      domain = new URL(parsed.data.url).hostname.toLowerCase();
    } catch {
      continue;
    }
    const relevanceScore = Number(parsed.data.relevance_score);
    articles.push({
      sourceType: "THENEWSAPI",
      externalId: parsed.data.uuid,
      url: parsed.data.url,
      title,
      description: cleanText(parsed.data.description ?? parsed.data.snippet),
      publisher: cleanText(parsed.data.source) ?? domain,
      sourceDomain: domain,
      publishedAt,
      language: cleanText(parsed.data.language),
      sourceCountry: cleanText(parsed.data.locale),
      queryFamily: family.id,
      feedSlug: null,
      sectorHint: family.sector,
      sourceMetadata: {
        categories: parsed.data.categories ?? [],
        relevanceScore: Number.isFinite(relevanceScore) ? relevanceScore : null,
      },
    });
  }
  return {
    articles,
    found: response.data.meta.found ?? null,
    returned: response.data.meta.returned ?? articles.length,
  };
}

const defaultSleep = (milliseconds: number) =>
  new Promise<void>((resolve) => setTimeout(resolve, milliseconds));

export async function fetchTheNewsApiArticles(
  input: {
    baseUrl: string;
    apiToken: string;
    family: MediaQueryFamily;
    startDate: Date;
    endDate: Date;
  },
  options: TheNewsApiOptions = {},
): Promise<TheNewsApiResponse> {
  const url = buildTheNewsApiUrl(input);
  const retries = Math.min(Math.max(options.maxRetries ?? 2, 0), 2);
  const sleep = options.sleep ?? defaultSleep;
  for (let attempt = 0; ; attempt += 1) {
    try {
      const response = await fetchText(url, {
        accept: "application/json",
        acceptedContentTypes: ["application/json"],
        timeoutMs: options.timeoutMs ?? 12_000,
        maxResponseBytes: 500_000,
        fetchImplementation: options.fetchImplementation,
      });
      const parsed = parseTheNewsApiResponse(response.body, input.family);
      return {
        ...parsed,
        safeRequestUrl: sanitiseUrl(url, ["api_token"]),
        latencyMs: response.latencyMs,
      };
    } catch (error) {
      const retryable =
        error instanceof HttpRequestError &&
        (error.kind === "rate-limit" ||
          (error.kind === "http" && (error.status ?? 0) >= 500));
      if (!retryable || attempt >= retries) throw error;
      await sleep(Math.min(error.retryAfterMs ?? 1_500 * 2 ** attempt, 8_000));
    }
  }
}
