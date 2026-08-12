import { describe, expect, it } from "vitest";

import type { GdeltArticle } from "@/data-sources/news/gdelt-api";
import {
  classifyGdeltArticle,
  classifyGdeltSector,
  inferGdeltCountry,
} from "@/data-sources/news/gdelt-classifier";

function article(title: string, queryFamily = "venue-closure"): GdeltArticle {
  return {
    url: "https://example.com/article",
    title,
    publishedAt: new Date("2026-08-10T00:00:00Z"),
    domain: "example.com",
    language: "English",
    sourceCountry: "Australia",
    socialImage: null,
    mobileUrl: null,
    tone: null,
    queryFamilies: [queryFamily as GdeltArticle["queryFamilies"][number]],
  };
}

describe("GDELT candidate classification", () => {
  it("classifies an explicit venue closure conservatively", () => {
    expect(
      classifyGdeltArticle(article("Sydney music venue to close permanently")),
    ).toMatchObject({
      eventType: "VENUE_CLOSURE",
      confidenceLevel: "high",
      polarity: "negative",
      sectorSlug: "music",
      countryCode: "AU",
    });
  });

  it("keeps a threatened venue distinct from a confirmed closure", () => {
    expect(
      classifyGdeltArticle(
        article("Toronto theatre at risk without emergency funding"),
      ),
    ).toMatchObject({
      eventType: "VENUE_AT_RISK",
      confidenceLevel: "medium",
      countryCode: "CA",
    });
  });

  it.each([
    [
      "Film publisher enters administration",
      "insolvency-bankruptcy",
      "BANKRUPTCY_INSOLVENCY",
    ],
    ["Game studio announces 200 layoffs", "layoffs", "LAYOFFS"],
    [
      "London arts festival cancelled",
      "festival-cancellation",
      "FESTIVAL_CANCELLATION",
    ],
    [
      "New Melbourne cinema opening this week",
      "positive-signals",
      "VENUE_OPENING",
    ],
  ])("classifies %s", (title, queryFamily, eventType) => {
    expect(classifyGdeltArticle(article(title, queryFamily))).toMatchObject({
      eventType,
    });
  });

  it("assigns ambiguous query matches low confidence without confirming the event", () => {
    expect(
      classifyGdeltArticle(article("Artists discuss changing venue economics")),
    ).toMatchObject({
      eventType: "VENUE_CLOSURE",
      confidenceLevel: "low",
      polarity: "neutral/ambiguous",
    });
  });

  it("uses cross-sector when a title spans several sectors", () => {
    expect(classifyGdeltSector("Film and music festival faces closure")).toBe(
      "industry-events",
    );
  });

  it("does not infer geography from publisher source country", () => {
    expect(inferGdeltCountry("Music venue faces closure")).toBeNull();
    expect(
      inferGdeltCountry("Australian theatre expands in London"),
    ).toBeNull();
  });
});
