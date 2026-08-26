import { describe, expect, it, vi } from "vitest";

import { getSourceDefinition } from "@/data-sources/catalog";
import { institutionalRssFeeds } from "@/data-sources/news/rss-registry";
import type { MediaIngestionStore } from "@/services/media/media-ingestion-core";
import { runRssIngestion } from "@/services/media/rss-ingestion-core";

class MemoryMediaStore implements MediaIngestionStore {
  private readonly urls = new Set<string>();
  private run = 0;

  findSource(slug: string) {
    return Promise.resolve({ id: slug, slug, enabled: true });
  }
  createRun() {
    this.run += 1;
    return Promise.resolve(`run-${this.run}`);
  }
  markSourceAttempted() {
    return Promise.resolve();
  }
  persistArticles(
    input: Parameters<MediaIngestionStore["persistArticles"]>[0],
  ) {
    let recordsCreated = 0;
    let recordsUpdated = 0;
    for (const bundle of input.bundles) {
      if (this.urls.has(bundle.article.canonicalUrl)) recordsUpdated += 1;
      else {
        this.urls.add(bundle.article.canonicalUrl);
        recordsCreated += 1;
      }
    }
    return Promise.resolve({
      recordsCreated,
      recordsUpdated,
      crossSourceMatches: 0,
    });
  }
  completeRun() {
    return Promise.resolve();
  }
  failRun() {
    return Promise.resolve();
  }
}

describe("institutional RSS ingestion", () => {
  it("uses one feed request and updates rather than duplicates on repeat", async () => {
    const feed = institutionalRssFeeds()[0];
    const fetchFeed = vi.fn().mockResolvedValue({
      format: "RSS 2.0" as const,
      title: feed.name,
      latencyMs: 5,
      articles: [
        {
          sourceType: "RSS" as const,
          externalId: "newsnet-1",
          url: "https://copyright.gov/newsnet/2026/example.html",
          title: "Copyright Office publishes artificial intelligence report",
          description: "The Office published a report on copyright policy.",
          publisher: feed.name,
          sourceDomain: feed.publisherDomain,
          publishedAt: new Date("2026-08-25T12:00:00Z"),
          language: "en",
          sourceCountry: "US",
          queryFamily: null,
          feedSlug: feed.slug,
          sectorHint: "ai-policy" as const,
          sourceMetadata: {
            evidenceRole: "PRIMARY_DOCUMENT",
            sourcePerspective: "OFFICIAL",
          },
        },
      ],
    });
    const store = new MemoryMediaStore();
    const input = {
      sourceDefinition: getSourceDefinition("copyright-newsnet"),
      store,
      feeds: [feed],
      hours: 72,
      startDate: new Date("2026-08-23T00:00:00Z"),
      sourceSlug: feed.slug,
      fetchFeed,
      now: () => new Date("2026-08-26T00:00:00Z"),
    };

    const first = await runRssIngestion(input);
    const second = await runRssIngestion(input);

    expect(first).toMatchObject({ created: 1, updated: 0, feedsAttempted: 1 });
    expect(second).toMatchObject({ created: 0, updated: 1, feedsAttempted: 1 });
    expect(fetchFeed).toHaveBeenCalledTimes(2);
  });

  it("excludes future-dated feed entries", async () => {
    const feed = institutionalRssFeeds()[0];
    const result = await runRssIngestion({
      sourceDefinition: getSourceDefinition("copyright-newsnet"),
      store: new MemoryMediaStore(),
      feeds: [feed],
      hours: 72,
      startDate: new Date("2026-08-23T00:00:00Z"),
      sourceSlug: feed.slug,
      fetchFeed: vi.fn().mockResolvedValue({
        format: "RSS 2.0" as const,
        title: feed.name,
        latencyMs: 5,
        articles: [
          {
            sourceType: "RSS" as const,
            externalId: "future",
            url: "https://copyright.gov/newsnet/future.html",
            title: "Future dated official publication",
            description: null,
            publisher: feed.name,
            sourceDomain: feed.publisherDomain,
            publishedAt: new Date("2026-09-02T00:00:00Z"),
            language: "en",
            sourceCountry: "US",
            queryFamily: null,
            feedSlug: feed.slug,
            sectorHint: "ai-policy" as const,
            sourceMetadata: { evidenceRole: "PRIMARY_DOCUMENT" },
          },
        ],
      }),
      now: () => new Date("2026-08-26T00:00:00Z"),
    });

    expect(result).toMatchObject({
      entriesRead: 1,
      entriesAccepted: 0,
      entriesSkipped: 1,
      created: 0,
    });
  });
});
