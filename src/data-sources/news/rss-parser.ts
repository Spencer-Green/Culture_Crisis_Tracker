import { XMLParser } from "fast-xml-parser";

import type { MediaSourceArticle } from "@/data-sources/news/media-types";
import type { RssFeedDefinition } from "@/data-sources/news/rss-registry";

export type ParsedFeed = {
  format: "RSS 2.0" | "Atom";
  title: string;
  articles: MediaSourceArticle[];
};

export class RssParseError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "RssParseError";
  }
}

const parser = new XMLParser({
  ignoreAttributes: false,
  attributeNamePrefix: "@_",
  textNodeName: "#text",
  processEntities: false,
  trimValues: true,
});

function array<T>(value: T | T[] | undefined): T[] {
  return value === undefined ? [] : Array.isArray(value) ? value : [value];
}

function text(value: unknown): string | null {
  if (typeof value === "string" || typeof value === "number")
    return String(value).trim() || null;
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  const record = value as Record<string, unknown>;
  return text(record["#text"] ?? record["@_href"] ?? record["@_url"]);
}

export function sanitiseFeedSnippet(value: unknown): string | null {
  const raw = text(value);
  if (!raw) return null;
  const cleaned = raw
    .replace(/<script[\s\S]*?<\/script>/gi, " ")
    .replace(/<style[\s\S]*?<\/style>/gi, " ")
    .replace(/<[^>]+>/g, " ")
    .replace(/&nbsp;|&#160;/gi, " ")
    .replace(/&amp;/gi, "&")
    .replace(/&quot;|&#34;/gi, '"')
    .replace(/&#39;|&apos;/gi, "'")
    .replace(/&lt;/gi, "<")
    .replace(/&gt;/gi, ">")
    .replace(/&#(\d+);/g, (_, code: string) =>
      String.fromCodePoint(Number(code)),
    )
    .replace(/&#x([0-9a-f]+);/gi, (_, code: string) =>
      String.fromCodePoint(Number.parseInt(code, 16)),
    )
    .replace(/\s+/g, " ")
    .trim();
  return cleaned ? cleaned.slice(0, 600) : null;
}

function date(value: unknown): Date | null {
  const parsed = new Date(text(value) ?? "");
  return Number.isNaN(parsed.getTime()) ? null : parsed;
}

function safeLink(value: unknown): string | null {
  if (Array.isArray(value)) {
    const alternate = value.find((item) => {
      const record =
        item && typeof item === "object" && !Array.isArray(item)
          ? (item as Record<string, unknown>)
          : {};
      return !record["@_rel"] || record["@_rel"] === "alternate";
    });
    return safeLink(alternate ?? value[0]);
  }
  const candidate = text(value);
  if (!candidate) return null;
  try {
    const url = new URL(candidate);
    return url.protocol === "https:" ? url.toString() : null;
  } catch {
    return null;
  }
}

function originalSourceUrl(
  item: Record<string, unknown>,
  feed: RssFeedDefinition,
): string | null {
  if (!feed.translationStatus) return null;
  const raw = text(
    item.description ?? item.summary ?? item.content ?? item["content:encoded"],
  );
  if (!raw) return null;
  const links = [...raw.matchAll(/href=["'](https:\/\/[^"']+)["']/gi)];
  for (const match of links) {
    try {
      const url = new URL(match[1].replace(/&amp;/gi, "&"));
      if (
        url.hostname === feed.publisherDomain ||
        url.hostname.endsWith(".substack.com") ||
        url.hostname.endsWith(".substackcdn.com")
      )
        continue;
      return url.toString();
    } catch {}
  }
  return null;
}

function itemToArticle(
  item: Record<string, unknown>,
  feed: RssFeedDefinition,
  atom: boolean,
): MediaSourceArticle | null {
  const title = sanitiseFeedSnippet(item.title);
  const url = safeLink(item.link);
  const publishedAt = date(
    item.pubDate ?? item.published ?? item.updated ?? item["dc:date"],
  );
  if (!title || !url || !publishedAt) return null;
  const guid = text(item.guid ?? item.id);
  const translatedOriginalSourceUrl = originalSourceUrl(item, feed);
  return {
    sourceType: "RSS",
    externalId: guid,
    url,
    title,
    description: sanitiseFeedSnippet(
      item.description ??
        item.summary ??
        item.content ??
        item["content:encoded"],
    ),
    publisher: feed.name,
    sourceDomain: feed.publisherDomain,
    publishedAt,
    language: null,
    sourceCountry: feed.geography,
    queryFamily: null,
    feedSlug: feed.slug,
    sectorHint: feed.sector,
    sourceMetadata: {
      feedFormat: atom ? "Atom" : "RSS 2.0",
      sourceTier: feed.tier,
      evidenceRole: feed.evidenceRole,
      sourcePerspective: feed.sourcePerspective,
      sourcePerspectives: [
        ...(feed.sourcePerspectives ?? [feed.sourcePerspective]),
      ],
      jurisdiction: feed.jurisdiction,
      sourceSpecialisms: [...feed.sourceSpecialisms],
      institution: feed.name,
      translationStatus: feed.translationStatus ?? null,
      originalSourceUrl: translatedOriginalSourceUrl,
    },
  };
}

export function parseRssOrAtom(
  xml: string,
  feed: RssFeedDefinition,
  options: { maxItems?: number } = {},
): ParsedFeed {
  let payload: unknown;
  try {
    payload = parser.parse(xml);
  } catch {
    throw new RssParseError("Feed XML is malformed.");
  }
  if (!payload || typeof payload !== "object" || Array.isArray(payload))
    throw new RssParseError("Feed response has no XML root.");
  const root = payload as Record<string, unknown>;
  const rss = root.rss as Record<string, unknown> | undefined;
  if (rss?.channel && typeof rss.channel === "object") {
    const channel = rss.channel as Record<string, unknown>;
    return {
      format: "RSS 2.0",
      title: text(channel.title) ?? feed.name,
      articles: array(
        channel.item as
          Record<string, unknown> | Record<string, unknown>[] | undefined,
      )
        .slice(0, options.maxItems)
        .map((item) => itemToArticle(item, feed, false))
        .filter((item): item is MediaSourceArticle => item !== null)
        .sort((a, b) => b.publishedAt.getTime() - a.publishedAt.getTime()),
    };
  }
  const atom = root.feed as Record<string, unknown> | undefined;
  if (atom) {
    return {
      format: "Atom",
      title: text(atom.title) ?? feed.name,
      articles: array(
        atom.entry as
          Record<string, unknown> | Record<string, unknown>[] | undefined,
      )
        .slice(0, options.maxItems)
        .map((item) => itemToArticle(item, feed, true))
        .filter((item): item is MediaSourceArticle => item !== null)
        .sort((a, b) => b.publishedAt.getTime() - a.publishedAt.getTime()),
    };
  }
  throw new RssParseError("Feed is neither RSS 2.0 nor Atom.");
}
