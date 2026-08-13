import { fetchText, type FetchImplementation } from "@/lib/http";
import {
  parseRssOrAtom,
  type ParsedFeed,
} from "@/data-sources/news/rss-parser";
import type { RssFeedDefinition } from "@/data-sources/news/rss-registry";

export async function fetchRssFeed(
  feed: RssFeedDefinition,
  options: {
    fetchImplementation?: FetchImplementation;
    timeoutMs?: number;
  } = {},
): Promise<ParsedFeed & { latencyMs: number }> {
  const url = new URL(feed.feedUrl);
  if (url.protocol !== "https:")
    throw new Error("RSS registry URLs must use HTTPS.");
  const response = await fetchText(url, {
    accept:
      "application/rss+xml, application/atom+xml, application/xml, text/xml",
    acceptedContentTypes: [
      "application/rss+xml",
      "application/atom+xml",
      "application/xml",
      "text/xml",
      "text/plain",
    ],
    timeoutMs: options.timeoutMs ?? 12_000,
    maxResponseBytes: 2_000_000,
    fetchImplementation: options.fetchImplementation,
  });
  return {
    ...parseRssOrAtom(response.body, feed),
    latencyMs: response.latencyMs,
  };
}
