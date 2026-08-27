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
      importance: 1,
    });
  });

  it("does not turn an attributed AI forecast into a fallback event", () => {
    expect(
      classifyMediaArticle(
        article(
          "AI lab CEO estimates a $30T addressable market",
          "The chief executive predicts the market opportunity but reports no observed economic outcome.",
          {
            sourceType: "THENEWSAPI",
            queryFamily: "ai-labour-economics",
            feedSlug: null,
            sectorHint: "ai-policy",
          },
        ),
      ),
    ).toMatchObject({
      sectorSlug: "ai-policy",
      eventType: null,
      aiImpactType: "AMBIGUOUS",
      signalDirection: "AMBIGUOUS",
      confidence: "high",
      importance: 4,
    });
  });

  it("represents a material senior AI infrastructure departure as a leadership event", () => {
    expect(
      classifyMediaArticle(
        article(
          "OpenAI loses a top data center exec as stream of high-profile departures continues",
          "OpenAI said it recently reorganized its infrastructure organization after the executive's departure.",
          {
            sectorHint: "ai-policy",
            sourceMetadata: {
              evidenceRole: "JOURNALISTIC_REPORTING",
              sourcePerspective: "JOURNALISTIC",
            },
          },
        ),
      ),
    ).toMatchObject({
      sectorSlug: "ai-policy",
      eventType: "EXECUTIVE_LEADERSHIP_CHANGE",
      aiImpactType: "AMBIGUOUS",
      confidence: "high",
      importance: 4,
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
      eventType: "AI_ADOPTION",
      importance: 1,
    });
    expect(classified?.sectorSlug).not.toBe("film");
  });

  it("does not treat structural query-family membership as event evidence", () => {
    expect(
      classifyMediaArticle(
        article(
          "Value Classes Still Need Compiler Sympathy",
          "A programming-language discussion without a relevant news event.",
          {
            sourceType: "THENEWSAPI",
            queryFamily: "ai-frontier-capabilities",
            feedSlug: null,
            sectorHint: "ai-policy",
          },
        ),
      ),
    ).toMatchObject({
      sectorSlug: "ai-policy",
      eventType: null,
      aiImpactType: null,
      confidence: "low",
      importance: 1,
    });
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

  it("does not treat film sales or plot-level shutdown language as a closure", () => {
    const classified = classifyMediaArticle(
      article(
        "Iranian Drama 'A Bit of Light' Sells Wide Ahead of Venice Premiere",
        "The film follows a doctor whose medical practice was shut down after an arrest.",
        { sectorHint: "film" },
      ),
    );

    expect(classified).toMatchObject({
      sectorSlug: "film",
      eventType: null,
    });
    expect(
      classifyMediaArticle(
        article("A Close Look at International Film Sales", null, {
          sectorHint: "film",
        }),
      )?.eventType,
    ).toBeNull();
  });

  it("still recognizes an actual cultural operation shutting down", () => {
    expect(
      classifyMediaArticle(
        article(
          "Local production update",
          "The independent film studio shut down operations permanently.",
          { sectorHint: "film" },
        ),
      ),
    ).toMatchObject({
      sectorSlug: "film",
      eventType: "CLOSURE",
      signalDirection: "NEGATIVE",
    });
  });

  it("does not use an insolvency query match as financial-distress evidence", () => {
    const classified = classifyMediaArticle(
      article(
        "Pune cops firm on no-loud-music stand during festival",
        "Police will enforce noise rules and seize speakers exceeding sound limits.",
        {
          sourceType: "THENEWSAPI",
          queryFamily: "insolvency",
          feedSlug: null,
          sectorHint: "music",
        },
      ),
    );

    expect(classified).toMatchObject({
      sectorSlug: "music",
      eventType: null,
      signalDirection: "AMBIGUOUS",
    });
  });

  it("does not confuse AI-powered license plates with AI licensing", () => {
    const classified = classifyMediaArticle(
      article(
        "Cities cut AI-powered license plate cameras over privacy fears",
        "Officials are investigating a surveillance network and vehicle data practices.",
        { sectorHint: "ai-policy" },
      ),
    );

    expect(classified?.eventType).not.toBe("AI_LICENSING");
    expect(classified).toMatchObject({
      sectorSlug: "ai-policy",
      eventType: "AI_ADOPTION",
      signalDirection: "AMBIGUOUS",
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

  it("treats a substantive AI safety framework as first-class AI intelligence", () => {
    expect(
      classifyMediaArticle(
        article("Government publishes new AI safety regulation framework"),
      ),
    ).toMatchObject({
      sectorSlug: "ai-policy",
      eventType: "AI_POLICY_REGULATION",
      confidence: "high",
      importance: 5,
    });
  });

  it("does not turn primary-source analysis into a completed event", () => {
    expect(
      classifyMediaArticle(
        article(
          "Research report analyses AI layoffs and copyright litigation",
          "The report discusses workforce and court developments.",
          {
            sectorHint: "ai-policy",
            sourceMetadata: { evidenceRole: "PRIMARY_DOCUMENT" },
          },
        ),
      ),
    ).toMatchObject({
      sectorSlug: "ai-policy",
      eventType: null,
      importance: 2,
    });
  });

  it("classifies national cultural-market AI eligibility rules as very high materiality", () => {
    expect(
      classifyMediaArticle(
        article(
          "AI-generated songs banned from Australian charts",
          "Songs made entirely using AI may have accreditations withdrawn and will no longer be eligible for the ARIA Charts.",
          { sectorHint: "music" },
        ),
      ),
    ).toMatchObject({
      sectorSlug: "music",
      eventType: "RIGHTS_OR_ELIGIBILITY_RULE_CHANGE",
      aiImpactType: "POLICY_REGULATION",
      signalDirection: "AMBIGUOUS",
      confidence: "high",
      importance: 5,
    });
  });

  it("preserves an explicit primary competition action without regulator inflation", () => {
    expect(
      classifyMediaArticle(
        article("FTC challenges proposed film studio acquisition", null, {
          sectorHint: "ai-policy",
          sourceMetadata: { evidenceRole: "PRIMARY_DOCUMENT" },
        }),
      ),
    ).toMatchObject({
      sectorSlug: "film",
      eventType: "CONSOLIDATION_ACQUISITION",
      confidence: "high",
      importance: 4,
    });
  });

  it("gives an explicit official AI standard high claim confidence", () => {
    expect(
      classifyMediaArticle(
        article(
          "NIST adopts national AI risk-management standard",
          "The agency adopted binding requirements for covered AI systems.",
          {
            sectorHint: "ai-policy",
            sourceMetadata: {
              evidenceRole: "PRIMARY_DOCUMENT",
              sourcePerspective: "OFFICIAL",
            },
          },
        ),
      ),
    ).toMatchObject({
      sectorSlug: "ai-policy",
      eventType: "AI_POLICY_REGULATION",
      confidence: "high",
      importance: 5,
    });
  });

  it("keeps a major official AI proposal proposed while preserving materiality", () => {
    expect(
      classifyMediaArticle(
        article(
          "Government consultation on proposed national AI regulation",
          "The government proposes binding rules for frontier AI systems.",
          {
            sectorHint: "ai-policy",
            sourceMetadata: {
              evidenceRole: "PRIMARY_DOCUMENT",
              sourcePerspective: "OFFICIAL",
            },
          },
        ),
      ),
    ).toMatchObject({
      sectorSlug: "ai-policy",
      eventType: null,
      aiImpactType: "POLICY_REGULATION",
      confidence: "medium",
      importance: 4,
    });
  });

  it("keeps a primary consultation proposed rather than classifying an enacted event", () => {
    expect(
      classifyMediaArticle(
        article(
          "Government consultation on proposed AI copyright rules",
          null,
          {
            sectorHint: "ai-policy",
            sourceMetadata: { evidenceRole: "PRIMARY_DOCUMENT" },
          },
        ),
      ),
    ).toMatchObject({
      sectorSlug: "ai-policy",
      eventType: null,
    });
  });

  it("does not route broad official material to AI policy from the feed hint alone", () => {
    expect(
      classifyMediaArticle(
        article("Patent Journal special notices", null, {
          sectorHint: "ai-policy",
          sourceMetadata: { evidenceRole: "PRIMARY_DOCUMENT" },
        }),
      ),
    ).toMatchObject({
      sectorSlug: "industry-events",
      eventType: null,
      importance: 1,
    });
  });
});
