import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { BaselineSignal } from "./baseline";
import type { SourceOperationalFreshness } from "@/services/scheduler/freshness-core";

describe("baseline time and scope display", () => {
  it("does not relabel an annual reporting period after a recent collection", () => {
    const html = renderToStaticMarkup(
      <BaselineSignal
        item={{
          id: "annual",
          sector: "music",
          label: "UK grassroots venue count",
          value: "800 venues",
          change: null,
          period: "2024",
          frequency: "Annual",
          source: "Music Venue Trust",
          sourceId: "mvt",
          country: "GB",
          proxy: false,
          caveat: "UK coverage only",
        }}
        collection={
          {
            lastSuccessAt: "2026-09-11T00:00:00Z",
            status: "STRUCTURAL",
          } as SourceOperationalFreshness
        }
      />,
    );
    expect(html).toContain("Reporting period");
    expect(html).toContain("2024");
    expect(html).toContain("Last successful source collection");
    expect(html).toContain("11 Sept 2026");
    expect(html).toContain("comparison unavailable");
    expect(html).not.toContain("Updated");
    expect(html).not.toContain("Improving");
  });
  it("keeps supply proxies out of the deterministic-baseline label", () => {
    const html = renderToStaticMarkup(
      <BaselineSignal
        item={{
          id: "supply",
          sector: "music",
          label: "AU forward supply",
          value: "100 events",
          change: "20 active venues",
          period: "90 days",
          frequency: "Listings",
          source: "Ticketmaster",
          sourceId: "ticketmaster",
          country: "AU",
          proxy: true,
          caveat: "Not realized demand",
        }}
      />,
    );
    expect(html).toContain("Activity / supply proxy");
    expect(html).toContain("Coverage window");
    expect(html).not.toContain("Deterministic baseline");
    expect(html).not.toContain("year over year");
  });
});
