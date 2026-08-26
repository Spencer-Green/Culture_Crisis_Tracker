import { describe, expect, it } from "vitest";

import {
  enabledRssFeeds,
  institutionalRssFeeds,
  specialistRssFeeds,
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

  it("registers exactly the approved P0-C specialist feeds", () => {
    const feeds = specialistRssFeeds();
    expect(feeds.map((feed) => feed.slug)).toEqual([
      "tech-policy-press",
      "lawfare-cybersecurity-tech",
      "cset",
      "ai-now-institute",
      "kluwer-copyright-blog",
      "normal-technology",
      "blood-in-the-machine",
      "chinai",
      "authors-alliance",
      "creative-commons",
    ]);
    expect(
      feeds.every(
        (feed) =>
          feed.evidenceRole === "SPECIALIST_ANALYSIS" &&
          feed.dataSourceSlug === feed.slug &&
          feed.maxItemsPerRun !== undefined &&
          feed.maximumAgeHours !== undefined,
      ),
    ).toBe(true);
    expect(specialistRssFeeds()[0]).toMatchObject({
      maxItemsPerRun: 20,
      maxItemsToParse: 100,
      maximumAgeHours: 72,
      schedulingGroup: "SPECIALIST",
    });
  });

  it("keeps deferred feeds out of P0-C", () => {
    const urls = specialistRssFeeds()
      .map((feed) => feed.feedUrl)
      .join(" ");
    expect(urls).not.toMatch(
      /ipkat|brookings|stanford|oecd|govai|upjohn|1709|institute-for-progress/i,
    );
  });
});
