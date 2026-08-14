import { describe, expect, it } from "vitest";

import { parseBFICli } from "@/data-sources/film/bfi-cli";

describe("BFI CLI", () => {
  it("defaults to a bounded current-year refresh", () => {
    expect(parseBFICli([], 2026)).toEqual({ sinceYear: 2026 });
  });

  it("accepts historical year bounds", () => {
    expect(parseBFICli(["--since=2019"], 2026)).toEqual({ sinceYear: 2019 });
  });

  it("rejects invalid and reversed future ranges", () => {
    expect(() => parseBFICli(["--since=20x9"], 2026)).toThrow();
    expect(() => parseBFICli(["--since=2027"], 2026)).toThrow();
  });
});
