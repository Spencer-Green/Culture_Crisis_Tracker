import { renderToStaticMarkup } from "react-dom/server";
import { describe, it, expect } from "vitest";
import { ResearchFinding } from "./evidence";
import type { ResearchDevelopment } from "@/services/developments/research-development";
const finding: ResearchDevelopment = {
  contractVersion: "development-v1",
  id: "research:one",
  kind: "RESEARCH_FINDING",
  sector: "Music",
  geography: "Australia",
  summary: "Reported venue contraction",
  observations: [],
  source: {
    id: "source",
    url: "https://example.test",
    publisher: "Example",
    title: "Report",
    traceConfidence: "TRACE_ATTEMPTED",
    mediation: "SEARCH_MEDIATED",
  },
  publication: { exactDate: null, raw: "2026" },
  reportingPeriod: { start: null, end: null, raw: "2025" },
  firstDiscoveredAt: "2026-01-01T00:00:00Z",
  lastObservedAt: "2026-09-11T00:00:00Z",
  occurrenceCount: 10,
  verification: "UNVERIFIED",
  reviewState: "APPROVED_FOR_INGESTION_INVESTIGATION",
  contentHash: "hash",
};
describe("research finding display", () => {
  it("renders approval and text access without suggesting canonical truth", () => {
    const html = renderToStaticMarkup(<ResearchFinding item={finding} />);
    expect(html).toContain("not independently verified");
    expect(html).toContain("Approved for ingestion investigation");
    expect(html).toContain("First discovered:");
    expect(html).toContain("Last observed:");
    expect(html).toContain("Reporting period: 2025");
    expect(html).toContain("inspection not established");
    expect(html).not.toContain("Updated");
  });
  it("renders quarantine separately", () => {
    expect(
      renderToStaticMarkup(
        <ResearchFinding item={{ ...finding, verification: "QUARANTINED" }} />,
      ),
    ).toContain("Quarantined · excluded from assessments");
  });
});
