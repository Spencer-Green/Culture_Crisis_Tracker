import { describe, expect, it } from "vitest";

import {
  enabledRssFeeds,
  institutionalRssFeeds,
} from "@/data-sources/news/rss-registry";

describe("RSS source registry", () => {
  it("registers only the approved P0-A institutional feeds", () => {
    const feeds = institutionalRssFeeds();
    expect(feeds.map((feed) => feed.slug)).toEqual([
      "copyright-newsnet",
      "cfpb-newsroom",
      "ftc-competition",
      "ftc-consumer-protection",
      "nist-information-technology",
      "uk-dsit",
      "uk-ipo",
      "uk-cma",
      "eu-dg-connect",
    ]);
    expect(
      feeds.every(
        (feed) =>
          feed.evidenceRole === "PRIMARY_DOCUMENT" &&
          feed.sourcePerspective === "OFFICIAL" &&
          feed.dataSourceSlug === feed.slug,
      ),
    ).toBe(true);
  });

  it("keeps institutional feeds out of the three-hour curated media group", () => {
    const curated = enabledRssFeeds();
    expect(
      curated.every((feed) => feed.schedulingGroup === "CURATED_MEDIA"),
    ).toBe(true);
    expect(curated.map((feed) => feed.slug)).not.toContain("ftc-competition");
  });

  it("does not add prohibited broad or stale alternatives", () => {
    const urls = institutionalRssFeeds().map((feed) => feed.feedUrl);
    expect(urls).not.toContain("https://www.ftc.gov/feeds/press-releases.xml");
    expect(urls.join(" ")).not.toMatch(/eur-lex|openai|anthropic|aisi/i);
  });
});
