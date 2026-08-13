import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

import {
  parseRssOrAtom,
  RssParseError,
  sanitiseFeedSnippet,
} from "@/data-sources/news/rss-parser";
import type { RssFeedDefinition } from "@/data-sources/news/rss-registry";

const rss = readFileSync(
  new URL("./__fixtures__/media-rss.xml", import.meta.url),
  "utf8",
);
const atom = readFileSync(
  new URL("./__fixtures__/media-atom.xml", import.meta.url),
  "utf8",
);
const feed: RssFeedDefinition = {
  slug: "fixture",
  name: "Fixture",
  sector: "theatre",
  feedUrl: "https://example.com/feed",
  publisherDomain: "example.com",
  enabled: true,
  tier: "SPECIALIST",
  geography: "GB",
  notes: "test",
};

describe("RSS and Atom parsing", () => {
  it("parses RSS 2.0 GUIDs, dates, links, and missing GUIDs", () => {
    const parsed = parseRssOrAtom(rss, feed);
    expect(parsed.format).toBe("RSS 2.0");
    expect(parsed.articles).toHaveLength(2);
    expect(parsed.articles[0]).toMatchObject({
      externalId: "rss-1",
      sectorHint: "theatre",
    });
    expect(parsed.articles[1].externalId).toBeNull();
  });

  it("parses Atom entries and alternate links", () => {
    const parsed = parseRssOrAtom(atom, { ...feed, sector: "gaming" });
    expect(parsed.format).toBe("Atom");
    expect(parsed.articles[0]).toMatchObject({
      externalId: "tag:example.com,2026:1",
      url: "https://example.com/games/hiring",
    });
  });

  it("sanitises embedded HTML and rejects malformed feed roots", () => {
    expect(sanitiseFeedSnippet("<p>Hello</p><script>bad()</script>")).toBe(
      "Hello",
    );
    expect(() =>
      parseRssOrAtom("<html><body>no feed</body></html>", feed),
    ).toThrow(RssParseError);
  });
});
