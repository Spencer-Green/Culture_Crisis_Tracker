import { describe, expect, it } from "vitest";

import {
  buildGdeltCorpusStats,
  filterIndustryEventCandidates,
  toIndustryEventCandidate,
} from "@/services/industry-events/events-core";

const record = {
  id: "event-id",
  eventType: "VENUE_CLOSURE",
  title: "Venue to close",
  summary: "Explicit closure title.",
  countryCode: "AU",
  sectorSlug: "music",
  eventDate: new Date("2026-08-10T00:00:00Z"),
  sourceUrl: "https://example.com/story",
  sourceName: "example.com",
  confidence: 0.9,
  metadata: {
    provider: "GDELT",
    polarity: "negative",
    confidenceLevel: "high",
    reviewState: "unreviewed",
    queryFamilies: ["venue-closure"],
    sourceCountry: "Australia",
    language: "English",
    classificationRationale: "Explicit closure title.",
  },
};

describe("industry-event presentation core", () => {
  it("maps safe GDELT provenance without article body content", () => {
    expect(toIndustryEventCandidate(record)).toMatchObject({
      sourceUrl: "https://example.com/story",
      queryFamilies: ["venue-closure"],
      reviewState: "unreviewed",
      confidenceLevel: "high",
    });
    expect(
      toIndustryEventCandidate({ ...record, sourceUrl: "file:///etc/passwd" }),
    ).toBeNull();
  });

  it("filters candidate dimensions and builds raw corpus counts", () => {
    const candidate = toIndustryEventCandidate(record)!;
    const positive = {
      ...candidate,
      id: "positive",
      polarity: "positive" as const,
      confidenceLevel: "medium" as const,
      countryCode: null,
    };
    expect(
      filterIndustryEventCandidates([candidate, positive], {
        confidenceLevel: "high",
      }),
    ).toEqual([candidate]);
    expect(buildGdeltCorpusStats([candidate, positive])).toEqual({
      total: 2,
      negative: 1,
      positive: 1,
      ambiguous: 0,
      highConfidence: 1,
      countriesCovered: 1,
    });
  });
});
