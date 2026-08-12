import { describe, expect, it } from "vitest";

import type { GdeltArticle } from "@/data-sources/news/gdelt-api";
import {
  articleIdentity,
  canonicaliseArticleUrl,
  deduplicateGdeltArticles,
} from "@/data-sources/news/gdelt-dedup";

function article(
  url: string,
  family: GdeltArticle["queryFamilies"][number],
): GdeltArticle {
  return {
    url,
    title: "Music venue to close permanently",
    publishedAt: new Date("2026-08-10T00:00:00Z"),
    domain: "example.com",
    language: null,
    sourceCountry: null,
    socialImage: null,
    mobileUrl: null,
    tone: null,
    queryFamilies: [family],
  };
}

describe("GDELT article deduplication", () => {
  it("normalises safe URLs and removes tracking parameters", () => {
    expect(
      canonicaliseArticleUrl(
        "HTTPS://Example.COM:443/story/?utm_source=x&b=2&a=1#top",
      ),
    ).toBe("https://example.com/story?a=1&b=2");
    expect(canonicaliseArticleUrl("javascript:alert(1)")).toBeNull();
  });

  it("merges query tags when the same article matches several families", () => {
    const result = deduplicateGdeltArticles([
      article("https://example.com/story?utm_source=a", "venue-closure"),
      article("https://example.com/story", "insolvency-bankruptcy"),
      article("https://example.com/other", "layoffs"),
    ]);
    expect(result.articles).toHaveLength(2);
    expect(result.duplicateCount).toBe(1);
    expect(result.overlapCount).toBe(1);
    expect(
      result.articles.find((item) => item.url.endsWith("/story"))
        ?.queryFamilies,
    ).toEqual(["venue-closure", "insolvency-bankruptcy"]);
  });

  it("creates a stable UUID identity without conflating distinct URLs", () => {
    expect(articleIdentity("https://example.com/story")).toMatch(
      /^[0-9a-f]{8}-[0-9a-f]{4}-5[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/,
    );
    expect(articleIdentity("https://example.com/story")).not.toBe(
      articleIdentity("https://example.com/other"),
    );
  });
});
