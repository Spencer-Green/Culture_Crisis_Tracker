import { readFile } from "node:fs/promises";

import { describe, expect, it, vi } from "vitest";

import {
  buildGdeltArticleListUrl,
  fetchGdeltArticleList,
  GdeltResponseError,
  parseGdeltArticleList,
  parseGdeltPublicationDate,
} from "@/data-sources/news/gdelt-api";

const fixtureUrl = new URL(
  "./__fixtures__/gdelt-artlist.json",
  import.meta.url,
);

describe("GDELT DOC ArticleList API", () => {
  it("builds a bounded encoded ArticleList JSON request", () => {
    const url = buildGdeltArticleListUrl("https://api.gdeltproject.org", {
      query: '("music venue" OR theatre) closure sourcecountry:australia',
      queryFamily: "venue-closure",
      startDate: new Date("2026-08-01T00:00:00.000Z"),
      endDate: new Date("2026-08-08T23:59:59.000Z"),
      maxRecords: 5,
    });

    expect(url.pathname).toBe("/api/v2/doc/doc");
    expect(url.searchParams.get("mode")).toBe("artlist");
    expect(url.searchParams.get("format")).toBe("json");
    expect(url.searchParams.get("maxrecords")).toBe("5");
    expect(url.searchParams.get("startdatetime")).toBe("20260801000000");
    expect(url.searchParams.get("enddatetime")).toBe("20260808235959");
    expect(url.searchParams.get("query")).toContain('"music venue"');
  });

  it("rejects unsafe ranges, protocols, and result limits", () => {
    const request = {
      query: "cinema closure",
      queryFamily: "venue-closure" as const,
      startDate: new Date("2026-08-08T00:00:00Z"),
      endDate: new Date("2026-08-01T00:00:00Z"),
      maxRecords: 5,
    };
    expect(() =>
      buildGdeltArticleListUrl("https://example.com", request),
    ).toThrow(GdeltResponseError);
    expect(() =>
      buildGdeltArticleListUrl("http://example.com", {
        ...request,
        startDate: request.endDate,
        endDate: request.startDate,
      }),
    ).toThrow("HTTPS");
    expect(() =>
      buildGdeltArticleListUrl("https://example.com", {
        ...request,
        startDate: request.endDate,
        endDate: request.startDate,
        maxRecords: 101,
      }),
    ).toThrow("between 1 and 100");
  });

  it("parses real ArticleList fields and skips malformed or unsafe records", async () => {
    const body = await readFile(fixtureUrl, "utf8");
    const articles = parseGdeltArticleList(body, "venue-closure");

    expect(articles).toHaveLength(3);
    expect(articles[0]).toMatchObject({
      title: "Melbourne music venue to close permanently after 30 years",
      domain: "example.com",
      language: "English",
      sourceCountry: "Australia",
      tone: -4.2,
      queryFamilies: ["venue-closure"],
    });
    expect(articles[2]).toMatchObject({
      language: null,
      sourceCountry: null,
      socialImage: null,
    });
  });

  it("parses GDELT timestamps deterministically", () => {
    expect(parseGdeltPublicationDate("20260810T041500Z")?.toISOString()).toBe(
      "2026-08-10T04:15:00.000Z",
    );
    expect(parseGdeltPublicationDate("2026-08-10")).toBeNull();
  });

  it("retries 429 responses with bounded backoff", async () => {
    const fetchImplementation = vi
      .fn<typeof fetch>()
      .mockResolvedValueOnce(
        new Response("rate limited", {
          status: 429,
          headers: { "content-type": "text/plain", "retry-after": "1" },
        }),
      )
      .mockResolvedValueOnce(
        new Response('{"articles":[]}', {
          status: 200,
          headers: { "content-type": "application/json" },
        }),
      );
    const sleep = vi.fn(async () => undefined);
    const result = await fetchGdeltArticleList(
      "https://api.gdeltproject.org",
      {
        query: '"music venue" closure',
        queryFamily: "venue-closure",
        startDate: new Date("2026-08-01T00:00:00Z"),
        endDate: new Date("2026-08-08T00:00:00Z"),
        maxRecords: 5,
      },
      { fetchImplementation, sleep, maxRetries: 1 },
    );

    expect(result.articles).toEqual([]);
    expect(fetchImplementation).toHaveBeenCalledTimes(2);
    expect(sleep).toHaveBeenCalledWith(1_000);
    expect(
      fetchImplementation.mock.calls.every(([url]) =>
        String(url).startsWith("https://api.gdeltproject.org/api/v2/doc/doc"),
      ),
    ).toBe(true);
  });
});
