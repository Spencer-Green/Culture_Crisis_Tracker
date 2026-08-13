import { describe, expect, it } from "vitest";

import {
  buildBroadwayBusinessUrls,
  fetchBroadwayBusinessDataset,
  parseBroadwayBusinessChart,
  parseBroadwayBusinessPage,
} from "@/data-sources/theatre/broadway-business-api";

const payload = {
  initialData: {
    home: {
      currentWeek: {
        id: 624,
        number: 11,
        start: "2026-08-03",
        end: "2026-08-09",
        notes: null,
        grosses: {
          data: [{ show: "Example" }],
        },
        stats: {
          this_week: {
            gross: 3371602500,
            attendance: 257464,
            shows: 29,
            capacity_percentage: 9156,
            ticket_average: 13095,
            performances: 231,
            previews: 0,
          },
          last_week: {
            gross: 3388985600,
            attendance: 263897,
            shows: 29,
            capacity_percentage: 9384,
            ticket_average: 12842,
            performances: 231,
            previews: 0,
          },
          last_season: {
            gross: 3100386000,
            attendance: 251610,
            shows: 29,
            capacity_percentage: 9056,
            ticket_average: 12322,
            performances: 216,
            previews: 14,
          },
        },
      },
    },
  },
  upToDate: true,
};

const html = `<html><script>window.broadwayBusiness = ${JSON.stringify(payload)}\n    </script></html>`;
const chart = JSON.stringify([
  {
    attendance: { potential: 9056, total: 251612 },
    gross: { total: 3100386000 },
    end: "2025-08-10",
    number: 11,
  },
  {
    number: 11,
    end: "2026-08-09",
    gross: { total: 3371602500 },
    attendance: { total: 257464, potential: 9156 },
  },
]);

describe("Broadway Business structured client", () => {
  it("uses only the official structured endpoint", () => {
    const urls = buildBroadwayBusinessUrls(
      "https://broadwaybusiness.com/grosses",
    );
    expect(urls.chartUrl.toString()).toBe(
      "https://broadwaybusiness.com/grosses/api/week/stats/chart?uptodate=1",
    );
    expect(() =>
      buildBroadwayBusinessUrls("https://example.com/grosses"),
    ).toThrow("official HTTPS host");
  });

  it("parses embedded JSON and rejects malformed pages", () => {
    expect(
      parseBroadwayBusinessPage(html).initialData.home.currentWeek.id,
    ).toBe(624);
    expect(() => parseBroadwayBusinessPage("<html />")).toThrow(
      "structured payload",
    );
  });

  it("parses reordered aggregate fields and exact source units", () => {
    const records = parseBroadwayBusinessChart(chart);
    expect(records[0]).toMatchObject({
      grossUsd: 31_003_860,
      attendance: 251_612,
      capacityPct: 90.56,
    });
    expect(records[1].weekEnding.toISOString()).toBe(
      "2026-08-09T00:00:00.000Z",
    );
    expect(() => parseBroadwayBusinessChart("{}")).toThrow("unexpected shape");
  });

  it("merges current-week detail without exposing unsafe URLs", async () => {
    const responses = [
      new Response(html, { headers: { "content-type": "text/html" } }),
      new Response(chart, {
        headers: {
          "content-type": "application/json",
          "x-ratelimit-limit": "60",
          "x-ratelimit-remaining": "59",
        },
      }),
    ];
    const dataset = await fetchBroadwayBusinessDataset(
      "https://broadwaybusiness.com/grosses",
      { fetchImplementation: async () => responses.shift()! },
    );
    expect(dataset.requestCount).toBe(2);
    expect(dataset.latestPageWeek).toMatchObject({
      showCount: 29,
      averageTicketPriceUsd: 130.95,
      performanceCount: 231,
    });
    expect(dataset.records[0]).toMatchObject({
      showCount: 29,
      averageTicketPriceUsd: 123.22,
    });
    expect(dataset.rateLimit).toEqual({ limit: 60, remaining: 59 });
    expect(dataset.safeChartUrl).not.toContain("token");
  });
});
