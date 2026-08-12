import { describe, expect, it } from "vitest";

import {
  isCurrentSource,
  isStructuralBenchmarkSource,
} from "@/data-sources/source-role";

describe("source analytical roles", () => {
  it("treats Eurostat as a structural benchmark rather than a current source", () => {
    expect(isStructuralBenchmarkSource("eurostat")).toBe(true);
    expect(isCurrentSource("eurostat")).toBe(false);
  });

  it.each(["abs", "ons", "bea", "fred", "statcan"])(
    "keeps %s in active current-source counts",
    (slug) => {
      expect(isCurrentSource(slug)).toBe(true);
      expect(isStructuralBenchmarkSource(slug)).toBe(false);
    },
  );
});
