import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

import { getMediaQueryFamily } from "@/data-sources/news/media-queries";
import {
  buildTheNewsApiUrl,
  fetchTheNewsApiArticles,
  formatTheNewsApiDate,
  parseTheNewsApiResponse,
} from "@/data-sources/news/thenewsapi-api";

const fixture = readFileSync(
  new URL("./__fixtures__/thenewsapi-response.json", import.meta.url),
  "utf8",
);
const family = getMediaQueryFamily("ai-frontier-capabilities")!;

describe("TheNewsAPI client", () => {
  it("formats UTC timestamps using the API date-time contract", () => {
    expect(formatTheNewsApiDate(new Date("2026-08-12T04:05:06.789Z"))).toBe(
      "2026-08-12T04:05:06",
    );
  });

  it("parses article UUIDs, source metadata, dates, and missing values", () => {
    const result = parseTheNewsApiResponse(fixture, family);
    expect(result).toMatchObject({ found: 24, returned: 2 });
    expect(result.articles[0]).toMatchObject({
      externalId: "news-1",
      publisher: "Music Trade",
      queryFamily: "ai-frontier-capabilities",
      language: "en",
    });
    expect(result.articles[0].publishedAt.toISOString()).toBe(
      "2026-08-13T05:30:00.000Z",
    );
    expect(result.articles[1].description).toBeNull();
  });

  it("encodes search syntax and date filtering", () => {
    const url = buildTheNewsApiUrl({
      baseUrl: "https://api.thenewsapi.com/v1",
      apiToken: "secret-token",
      family,
      startDate: new Date("2026-08-12T00:00:00Z"),
      endDate: new Date("2026-08-13T00:00:00Z"),
    });
    expect(url.searchParams.get("search")).toBe(family.search);
    expect(url.searchParams.get("search_fields")).toBe(
      "title,description,keywords",
    );
    expect(url.searchParams.get("limit")).toBe("3");
    expect(url.searchParams.get("sort")).toBe("relevance_score");
    expect(url.toString()).not.toContain("%252B");
  });

  it("keeps chronological ranking for non-AI event families", () => {
    const eventFamily = getMediaQueryFamily("venue-closures")!;
    const url = buildTheNewsApiUrl({
      baseUrl: "https://api.thenewsapi.com/v1",
      apiToken: "secret-token",
      family: eventFamily,
      startDate: new Date("2026-08-12T00:00:00Z"),
      endDate: new Date("2026-08-13T00:00:00Z"),
    });

    expect(url.searchParams.get("sort")).toBe("published_at");
  });

  it("returns a safe request URL without the API token", async () => {
    const response = await fetchTheNewsApiArticles(
      {
        baseUrl: "https://api.thenewsapi.com/v1",
        apiToken: "secret-token",
        family,
        startDate: new Date("2026-08-12T00:00:00Z"),
        endDate: new Date("2026-08-13T00:00:00Z"),
      },
      {
        fetchImplementation: async () =>
          new Response(fixture, {
            status: 200,
            headers: { "content-type": "application/json" },
          }),
      },
    );
    expect(response.safeRequestUrl).not.toContain("secret-token");
    expect(response.safeRequestUrl).not.toContain("api_token");
  });
});
