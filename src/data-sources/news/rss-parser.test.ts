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
  evidenceRole: "JOURNALISTIC_REPORTING",
  sourcePerspective: "JOURNALISTIC",
  jurisdiction: "GB",
  sourceSpecialisms: [],
  schedulingGroup: "CURATED_MEDIA",
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

  it("bounds normalization before mapping a large historical feed", () => {
    const parsed = parseRssOrAtom(rss, feed, { maxItems: 1 });
    expect(parsed.articles).toHaveLength(1);
    expect(parsed.articles[0].externalId).toBe("rss-1");
  });

  it("parses Atom entries and alternate links", () => {
    const parsed = parseRssOrAtom(atom, { ...feed, sector: "gaming" });
    expect(parsed.format).toBe("Atom");
    expect(parsed.articles[0]).toMatchObject({
      externalId: "tag:example.com,2026:1",
      url: "https://example.com/games/hiring",
    });
  });

  it("propagates trusted source-role metadata separately from feed content", () => {
    const parsed = parseRssOrAtom(atom, {
      ...feed,
      evidenceRole: "PRIMARY_DOCUMENT",
      sourcePerspective: "OFFICIAL",
      jurisdiction: "GB",
      sourceSpecialisms: ["AI_POLICY", "COPYRIGHT"],
      schedulingGroup: "INSTITUTIONAL",
    });

    expect(parsed.articles[0].sourceMetadata).toEqual({
      feedFormat: "Atom",
      sourceTier: "SPECIALIST",
      evidenceRole: "PRIMARY_DOCUMENT",
      sourcePerspective: "OFFICIAL",
      sourcePerspectives: ["OFFICIAL"],
      jurisdiction: "GB",
      sourceSpecialisms: ["AI_POLICY", "COPYRIGHT"],
      institution: "Fixture",
      translationStatus: null,
      originalSourceUrl: null,
    });
  });

  it("preserves specialist perspective and clean translation provenance", () => {
    const parsed = parseRssOrAtom(
      `<?xml version="1.0"?><rss version="2.0"><channel><title>ChinAI</title><item><title>AI governance translation</title><link>https://chinai.substack.com/p/example</link><guid>translation-1</guid><pubDate>Tue, 25 Aug 2026 12:00:00 GMT</pubDate><description><![CDATA[<p>Translated analysis of AI policy. <a href="https://example.cn/original">Original source</a></p>]]></description></item></channel></rss>`,
      {
        ...feed,
        slug: "chinai",
        name: "ChinAI",
        sector: "ai-policy",
        publisherDomain: "chinai.substack.com",
        evidenceRole: "SPECIALIST_ANALYSIS",
        sourcePerspective: "ANALYTICAL",
        sourcePerspectives: ["ANALYTICAL", "TRANSLATION"],
        jurisdiction: "CHINA",
        sourceSpecialisms: ["CHINA_AI", "AI_GOVERNANCE"],
        schedulingGroup: "SPECIALIST",
        translationStatus: "TRANSLATED_OR_SUMMARISED",
      },
    );

    expect(parsed.articles[0].sourceMetadata).toMatchObject({
      evidenceRole: "SPECIALIST_ANALYSIS",
      sourcePerspectives: ["ANALYTICAL", "TRANSLATION"],
      translationStatus: "TRANSLATED_OR_SUMMARISED",
      originalSourceUrl: "https://example.cn/original",
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
