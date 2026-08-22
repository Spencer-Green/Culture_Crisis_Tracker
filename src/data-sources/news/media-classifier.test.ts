import { describe, expect, it } from "vitest";

import { classifyMediaArticle } from "@/data-sources/news/media-classifier";
import type { MediaSourceArticle } from "@/data-sources/news/media-types";

function article(
  title: string,
  description: string | null = null,
  overrides: Partial<MediaSourceArticle> = {},
): MediaSourceArticle {
  return {
    sourceType: "RSS",
    externalId: null,
    url: `https://example.com/${encodeURIComponent(title)}`,
    title,
    description,
    publisher: "Example",
    sourceDomain: "example.com",
    publishedAt: new Date("2026-08-13T05:00:00Z"),
    language: "en",
    sourceCountry: null,
    queryFamily: null,
    feedSlug: "fixture",
    sectorHint: null,
    sourceMetadata: {},
    ...overrides,
  };
}

describe("media classification", () => {
  it.each([
    ["XYZ venue to close permanently", "CLOSURE", "negative"],
    ["XYZ venue warns it could close without funding", "AT_RISK", "negative"],
    ["Film company enters administration", "BANKRUPTCY_INSOLVENCY", "negative"],
    ["Game studio announces 200 layoffs", "LAYOFFS", "negative"],
    ["Arts funding cut confirmed in budget", "FUNDING_CUT", "negative"],
    ["Studio secures major investment", "INVESTMENT", "positive"],
  ])("classifies %s", (title, eventType, polarity) => {
    expect(classifyMediaArticle(article(title))).toMatchObject({
      eventType,
      polarity,
    });
  });

  it.each([
    [
      "AI training data copyright lawsuit targets record label",
      "AI_COPYRIGHT",
      "RIGHTS_LICENSING",
    ],
    [
      "Musicians sign AI licensing and compensation deal",
      "AI_LICENSING",
      "RIGHTS_LICENSING",
    ],
    [
      "Studio replaces contractors with AI automation",
      "AI_LABOR_DISPLACEMENT",
      "LABOR_DISPLACEMENT",
    ],
    [
      "New AI regulation for creative industries",
      "AI_POLICY_REGULATION",
      "POLICY_REGULATION",
    ],
  ])("classifies AI impact for %s", (title, eventType, aiImpactType) => {
    expect(classifyMediaArticle(article(title))).toMatchObject({
      eventType,
      aiImpactType,
    });
  });

  it("keeps ambiguous AI reporting conservative", () => {
    expect(
      classifyMediaArticle(article("AI and music: what happens next?")),
    ).toMatchObject({
      eventType: "AI_ADOPTION",
      confidence: "low",
      aiImpactType: "AMBIGUOUS",
    });
  });

  it("does not turn generic AI cybersecurity into Film from a query hint", () => {
    const classified = classifyMediaArticle(
      article(
        "China-Linked Hackers Use Autonomous AI Agents to Breach Taiwan Government Systems",
        "A China-linked threat actor used a multi-agent artificial intelligence framework.",
        {
          sourceType: "THENEWSAPI",
          queryFamily: "ai-film-tv",
          feedSlug: null,
          sectorHint: "film",
        },
      ),
    );

    expect(classified).toMatchObject({
      sectorSlug: "ai-policy",
      eventType: "AI_POLICY_REGULATION",
      importance: 2,
    });
    expect(classified?.sectorSlug).not.toBe("film");
  });

  it("does not mistake government administration for insolvency", () => {
    expect(
      classifyMediaArticle(
        article(
          "Independence Day celebrations to feature fireworks and folk music",
          "The district administration is organising the public celebration.",
        ),
      ),
    ).toMatchObject({
      sectorSlug: "music",
      eventType: null,
      importance: 1,
    });
  });

  it("recognises explicit Film consolidation as material sector news", () => {
    expect(
      classifyMediaArticle(
        article(
          "DGA and IATSE Push Rob Bonta to Allow Paramount-Warner Bros. Merger With Conditions",
        ),
      ),
    ).toMatchObject({
      sectorSlug: "film",
      eventType: "CONSOLIDATION_ACQUISITION",
      confidence: "high",
      importance: 5,
    });
  });

  it("keeps generic AI policy outside cultural sectors", () => {
    expect(
      classifyMediaArticle(
        article("Government publishes new AI safety regulation framework"),
      ),
    ).toMatchObject({
      sectorSlug: "ai-policy",
      eventType: "AI_POLICY_REGULATION",
      importance: 2,
    });
  });
});
