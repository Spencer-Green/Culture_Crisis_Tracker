import { describe, expect, it } from "vitest";

import { parseNewsApiCli, parseRssCli } from "@/data-sources/news/media-cli";

describe("media CLI", () => {
  it("parses bounded NewsAPI and RSS options", () => {
    expect(
      parseNewsApiCli(["--hours=24", "--max-requests=15", "--family=ai-music"]),
    ).toMatchObject({ hours: 24, maxRequests: 15, family: "ai-music" });
    expect(parseRssCli(["--hours=72", "--sector=gaming"])).toMatchObject({
      hours: 72,
      sector: "gaming",
    });
  });
  it("rejects request-budget and sector errors", () => {
    expect(() => parseNewsApiCli(["--max-requests=26"])).toThrow();
    expect(() => parseRssCli(["--sector=sports"])).toThrow();
  });
});
