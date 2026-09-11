import { describe, expect, it } from "vitest";
import type { MediaArticleView } from "@/services/media/media-service-core";
import { monitorFilters } from "./core";
import { selectDevelopments, storyDiscovery } from "./developments-core";

function article(
  id: string,
  overrides: Partial<MediaArticleView> = {},
): MediaArticleView {
  return {
    id,
    sourceType: "RSS",
    canonicalUrl: `https://example.test/${id}`,
    title: "Major music venue closes permanently after funding cut",
    description:
      "The live music venue announced its permanent closure and staff layoffs following a funding cut.",
    publisher: "Music Trade",
    sourceDomain: "example.test",
    publishedAt: "2026-09-10T00:00:00Z",
    retrievedAt: "2026-09-11T00:00:00Z",
    firstSeenAt: "2026-09-10T01:00:00Z",
    lastSeenAt: "2026-09-11T00:00:00Z",
    countryCode: "AU",
    sectorSlug: "music",
    eventType: "CLOSURE",
    polarity: "negative",
    signalDirection: "NEGATIVE",
    confidence: "high",
    importance: 4,
    aiImpactType: null,
    reviewState: "unreviewed",
    classificationRationale: "Reported permanent closure",
    classificationFeedback: null,
    storyFingerprint: "same-closure",
    possibleDuplicateStory: false,
    sourceMatches: ["RSS"],
    ...overrides,
  };
}
describe("documented development selection", () => {
  it("groups multiple reports rather than counting each as a development", () => {
    const stories = selectDevelopments(
      [
        article("a"),
        article("b", {
          publisher: "Other trade",
          publishedAt: "2026-09-10T02:00:00Z",
        }),
      ],
      monitorFilters({}),
    );
    expect(stories).toHaveLength(1);
    expect(stories[0].articleIds).toHaveLength(2);
  });
  it("keeps unknown geography out of a specific country view and respects sector scope", () => {
    expect(
      selectDevelopments(
        [article("a", { countryCode: null })],
        monitorFilters({ country: "AU" }),
      ),
    ).toHaveLength(0);
    expect(
      selectDevelopments([article("a")], monitorFilters({ sector: "gaming" })),
    ).toHaveLength(0);
  });
  it("preserves original discovery despite later rediscovery and does not fabricate missing dates", () => {
    const stories = selectDevelopments(
      [
        article("a"),
        article("b", {
          firstSeenAt: "2026-09-10T02:00:00Z",
          lastSeenAt: "2026-12-01T00:00:00Z",
        }),
      ],
      monitorFilters({}),
    );
    expect(storyDiscovery(stories[0])).toBe("2026-09-10T01:00:00Z");
    expect(
      storyDiscovery({
        ...stories[0],
        articles: [article("c", { firstSeenAt: undefined })],
      }),
    ).toBeNull();
  });
});
