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
    expect(
      likelyDuplicateStory(
        {
          title:
            "Suno x BMG: AI Music Platform Strikes Its 2nd important Major Label Licensing Deal",
          publishedAt: first.publishedAt,
        },
        {
          title:
            "Suno, the AI music making platform, has inked global licensing deal with BMG",
          publishedAt: second.publishedAt,
        },
      ),
    ).toBe(true);
    expect(
      likelyDuplicateStory(
        {
          title:
            "Paramount completes Warner Bros merger after regulator approval",
          publishedAt: first.publishedAt,
        },
        {
          title:
            "Paramount launches streaming bundle with Warner Bros catalogue",
          publishedAt: second.publishedAt,
        },
      ),
    ).toBe(false);
    expect(normaliseHeadline("The Studio's New Plan")).toBe("studio new plan");
  });
});
