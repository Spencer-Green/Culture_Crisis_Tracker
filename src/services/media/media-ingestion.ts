import "server-only";

import { getSourceDefinition, type SourceSlug } from "@/data-sources/catalog";
import { enabledRssFeeds, getRssFeed } from "@/data-sources/news/rss-registry";
import { theNewsApiAdapter } from "@/data-sources/news/thenewsapi";
import { getPrisma } from "@/lib/prisma";
import { runNewsApiIngestion } from "@/services/media/media-ingestion-core";
import { PrismaMediaIngestionStore } from "@/services/media/media-prisma-store";
import { runRssIngestion } from "@/services/media/rss-ingestion-core";

export function ingestTheNewsApi(
  input: Omit<
    Parameters<typeof runNewsApiIngestion>[0],
    "sourceDefinition" | "adapter" | "store"
  >,
) {
  return runNewsApiIngestion({
    ...input,
    sourceDefinition: getSourceDefinition("thenewsapi"),
    adapter: theNewsApiAdapter,
    store: new PrismaMediaIngestionStore(getPrisma()),
  });
}

export function ingestRss(
  input: Omit<
    Parameters<typeof runRssIngestion>[0],
    "sourceDefinition" | "store" | "feeds"
  >,
) {
  const selectedFeed = input.sourceSlug
    ? getRssFeed(input.sourceSlug)
    : undefined;
  const sourceDefinition = selectedFeed?.dataSourceSlug
    ? getSourceDefinition(selectedFeed.dataSourceSlug as SourceSlug)
    : getSourceDefinition("rss");
  return runRssIngestion({
    ...input,
    sourceDefinition,
    feeds: selectedFeed ? [selectedFeed] : enabledRssFeeds(),
    store: new PrismaMediaIngestionStore(getPrisma()),
  });
}
