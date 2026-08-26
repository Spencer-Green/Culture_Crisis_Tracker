import { describe, expect, it } from "vitest";

import {
  getMediaQueryFamily,
  MEDIA_QUERY_FAMILIES,
} from "@/data-sources/news/media-queries";

const AI_FAMILY_IDS = [
  "ai-frontier-capabilities",
  "ai-compute-infrastructure",
  "ai-policy-governance",
  "ai-labour-economics",
  "ai-rights-creative",
] as const;

describe("TheNewsAPI media query families", () => {
  it("keeps five structural AI families inside the scheduled request prefix", () => {
    expect(
      MEDIA_QUERY_FAMILIES.filter((family) => family.aiRelated).map(
        (family) => family.id,
      ),
    ).toEqual(AI_FAMILY_IDS);
    expect(
      MEDIA_QUERY_FAMILIES.slice(0, 10).map((family) => family.id),
    ).toEqual([
      ...AI_FAMILY_IDS,
      "venue-closures",
      "layoffs",
      "insolvency",
      "cancellations",
      "demand-weakness",
    ]);
  });

  it("uses query families only as AI discovery hints", () => {
    for (const id of AI_FAMILY_IDS) {
      expect(getMediaQueryFamily(id)).toMatchObject({
        id,
        sector: "ai-policy",
        fallbackEventType: null,
        fallbackPolarity: "neutral/ambiguous",
        aiRelated: true,
        sort: "relevance_score",
      });
    }
  });

  it("covers the audited structural domains without company-specific queries", () => {
    expect(getMediaQueryFamily("ai-frontier-capabilities")?.search).toMatch(
      /frontier model.*reasoning model.*multimodal model/,
    );
    expect(getMediaQueryFamily("ai-compute-infrastructure")?.search).toMatch(
      /GPU.*semiconductor.*data center.*power agreement/,
    );
    expect(getMediaQueryFamily("ai-policy-governance")?.search).toMatch(
      /regulat.*export controls.*antitrust.*governance/,
    );
    expect(getMediaQueryFamily("ai-labour-economics")?.search).toMatch(
      /workforce.*automation.*productivity.*investment.*trillion/,
    );
    expect(getMediaQueryFamily("ai-rights-creative")?.search).toMatch(
      /music.*film.*publishing.*copyright.*training data.*eligibility/,
    );

    const searches = AI_FAMILY_IDS.map(
      (id) => getMediaQueryFamily(id)?.search ?? "",
    ).join(" ");
    expect(searches).not.toMatch(
      /\b(OpenAI|Anthropic|Google|Microsoft|Nvidia)\b/,
    );
  });

  it("keeps family identifiers unique and resolvable", () => {
    const ids = MEDIA_QUERY_FAMILIES.map((family) => family.id);
    expect(new Set(ids).size).toBe(ids.length);
    for (const id of ids) expect(getMediaQueryFamily(id)?.id).toBe(id);
  });
});
