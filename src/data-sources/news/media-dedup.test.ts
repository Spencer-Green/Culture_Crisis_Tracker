import { describe, expect, it } from "vitest";

import {
  canonicaliseMediaUrl,
  likelyDuplicateStory,
  normaliseHeadline,
} from "@/data-sources/news/media-dedup";

describe("media deduplication", () => {
  it("removes tracking parameters but preserves meaningful query identifiers", () => {
    expect(
      canonicaliseMediaUrl(
        "https://EXAMPLE.com/story/?utm_source=x&id=42&fbclid=y",
      ),
    ).toBe("https://example.com/story?id=42");
  });

  it("rejects unsafe or non-HTTPS protocols", () => {
    expect(canonicaliseMediaUrl("javascript:alert(1)")).toBeNull();
    expect(canonicaliseMediaUrl("http://example.com/story")).toBeNull();
  });

  it("flags only close-time, strongly overlapping headlines", () => {
    const first = {
      title: "Major game studio announces one hundred layoffs today",
      publishedAt: new Date("2026-08-13T05:00:00Z"),
    };
    const second = {
      title: "Major game studio announces one hundred layoffs today",
      publishedAt: new Date("2026-08-13T06:00:00Z"),
    };
    expect(likelyDuplicateStory(first, second)).toBe(true);
    expect(
      likelyDuplicateStory(first, {
        ...second,
        title: "Festival launches new investment fund",
      }),
    ).toBe(false);
    expect(normaliseHeadline("The Studio's New Plan")).toBe("studio new plan");
  });
});
