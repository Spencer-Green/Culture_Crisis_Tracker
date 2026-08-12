import { z } from "zod";

import type { GdeltQueryFamilyId } from "@/data-sources/news/gdelt-queries";
import {
  fetchText,
  HttpRequestError,
  type FetchImplementation,
} from "@/lib/http";

export const GDELT_DOC_PATH = "/api/v2/doc/doc";
export const GDELT_MAX_RECORDS = 100;

export type GdeltArticle = {
  url: string;
  title: string;
  publishedAt: Date;
  domain: string;
  language: string | null;
  sourceCountry: string | null;
  socialImage: string | null;
  mobileUrl: string | null;
  tone: number | null;
  queryFamilies: GdeltQueryFamilyId[];
};

export type GdeltArticleRequest = {
  query: string;
  queryFamily: GdeltQueryFamilyId;
  startDate: Date;
  endDate: Date;
  maxRecords: number;
};

export type GdeltArticleResponse = {
  articles: GdeltArticle[];
  requestUrl: string;
  latencyMs: number;
};

export type GdeltRequestOptions = {
  fetchImplementation?: FetchImplementation;
  timeoutMs?: number;
  maxRetries?: number;
  sleep?: (milliseconds: number) => Promise<void>;
};

export class GdeltResponseError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "GdeltResponseError";
  }
}

const articleSchema = z.object({
  url: z.string(),
  title: z.string(),
  seendate: z.string(),
  domain: z.string().optional(),
  language: z.string().optional(),
  sourcecountry: z.string().optional(),
  socialimage: z.string().optional(),
  url_mobile: z.string().optional(),
  tone: z.union([z.number(), z.string()]).optional(),
});

function resolveGdeltDocUrl(baseUrl: string): URL {
  const url = new URL(baseUrl);
  if (url.protocol !== "https:") {
    throw new GdeltResponseError("GDELT requires an HTTPS base URL.");
  }
  const trimmedPath = url.pathname.replace(/\/+$/, "");
  url.pathname = trimmedPath.endsWith(GDELT_DOC_PATH)
    ? trimmedPath
    : GDELT_DOC_PATH;
  url.search = "";
  url.hash = "";
  return url;
}

export function formatGdeltDateTime(date: Date): string {
  if (Number.isNaN(date.getTime())) {
    throw new GdeltResponseError("GDELT request date is invalid.");
  }
  return date
    .toISOString()
    .replace(/[-:]/g, "")
    .replace("T", "")
    .replace(/\.\d{3}Z$/, "");
}

export function buildGdeltArticleListUrl(
  baseUrl: string,
  request: GdeltArticleRequest,
): URL {
  if (request.endDate < request.startDate) {
    throw new GdeltResponseError(
      "GDELT request end date must not precede start date.",
    );
  }
  if (
    !Number.isInteger(request.maxRecords) ||
    request.maxRecords < 1 ||
    request.maxRecords > GDELT_MAX_RECORDS
  ) {
    throw new GdeltResponseError(
      `GDELT maxrecords must be between 1 and ${GDELT_MAX_RECORDS}.`,
    );
  }
  const url = resolveGdeltDocUrl(baseUrl);
  url.searchParams.set("query", request.query);
  url.searchParams.set("mode", "artlist");
  url.searchParams.set("format", "json");
  url.searchParams.set("maxrecords", request.maxRecords.toString());
  url.searchParams.set("startdatetime", formatGdeltDateTime(request.startDate));
  url.searchParams.set("enddatetime", formatGdeltDateTime(request.endDate));
  url.searchParams.set("sort", "datedesc");
  return url;
}

export function parseGdeltPublicationDate(value: string): Date | null {
  const match = /^(\d{4})(\d{2})(\d{2})T(\d{2})(\d{2})(\d{2})Z$/.exec(
    value.trim(),
  );
  if (!match) return null;
  const date = new Date(
    Date.UTC(
      Number(match[1]),
      Number(match[2]) - 1,
      Number(match[3]),
      Number(match[4]),
      Number(match[5]),
      Number(match[6]),
    ),
  );
  return Number.isNaN(date.getTime()) ? null : date;
}

function safeHttpUrl(value: string | undefined): string | null {
  if (!value) return null;
  try {
    const url = new URL(value);
    return url.protocol === "http:" || url.protocol === "https:"
      ? url.toString()
      : null;
  } catch {
    return null;
  }
}

export function parseGdeltArticleList(
  body: string,
  queryFamily: GdeltQueryFamilyId,
): GdeltArticle[] {
  let payload: unknown;
  try {
    payload = JSON.parse(body);
  } catch {
    throw new GdeltResponseError("GDELT returned invalid JSON.");
  }
  if (!payload || typeof payload !== "object" || Array.isArray(payload)) {
    throw new GdeltResponseError("GDELT returned an invalid response.");
  }
  const rawArticles = (payload as Record<string, unknown>).articles;
  if (!Array.isArray(rawArticles)) {
    throw new GdeltResponseError("GDELT returned no ArticleList array.");
  }

  const articles: GdeltArticle[] = [];
  for (const rawArticle of rawArticles) {
    const parsed = articleSchema.safeParse(rawArticle);
    if (!parsed.success) continue;
    const url = safeHttpUrl(parsed.data.url);
    const publishedAt = parseGdeltPublicationDate(parsed.data.seendate);
    const title = parsed.data.title.replace(/\s+/g, " ").trim();
    if (!url || !publishedAt || !title) continue;
    const tone = Number(parsed.data.tone);
    articles.push({
      url,
      title,
      publishedAt,
      domain: parsed.data.domain?.trim().toLowerCase() || new URL(url).hostname,
      language: parsed.data.language?.trim() || null,
      sourceCountry: parsed.data.sourcecountry?.trim() || null,
      socialImage: safeHttpUrl(parsed.data.socialimage),
      mobileUrl: safeHttpUrl(parsed.data.url_mobile),
      tone: Number.isFinite(tone) ? tone : null,
      queryFamilies: [queryFamily],
    });
  }
  return articles.sort(
    (left, right) => right.publishedAt.getTime() - left.publishedAt.getTime(),
  );
}

function defaultSleep(milliseconds: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, milliseconds));
}

function retryDelay(error: HttpRequestError, attempt: number): number {
  return Math.min(error.retryAfterMs ?? 5_000 * 2 ** attempt, 20_000);
}

export async function fetchGdeltArticleList(
  baseUrl: string,
  request: GdeltArticleRequest,
  options: GdeltRequestOptions = {},
): Promise<GdeltArticleResponse> {
  const url = buildGdeltArticleListUrl(baseUrl, request);
  const maxRetries = Math.min(Math.max(options.maxRetries ?? 2, 0), 3);
  const sleep = options.sleep ?? defaultSleep;

  for (let attempt = 0; ; attempt += 1) {
    try {
      const response = await fetchText(url, {
        accept: "application/json",
        acceptedContentTypes: ["application/json"],
        timeoutMs: options.timeoutMs ?? 20_000,
        maxResponseBytes: 2_000_000,
        fetchImplementation: options.fetchImplementation,
      });
      return {
        articles: parseGdeltArticleList(response.body, request.queryFamily),
        requestUrl: url.toString(),
        latencyMs: response.latencyMs,
      };
    } catch (error) {
      const retryable =
        error instanceof HttpRequestError &&
        (error.kind === "rate-limit" ||
          (error.kind === "http" && (error.status ?? 0) >= 500));
      if (!retryable || attempt >= maxRetries) throw error;
      await sleep(retryDelay(error, attempt));
    }
  }
}
