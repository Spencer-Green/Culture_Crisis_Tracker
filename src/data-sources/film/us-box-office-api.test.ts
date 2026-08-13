import { describe, expect, it } from "vitest";

import {
  buildUSBoxOfficeDownloadUrl,
  downloadUSBoxOfficeArchive,
  fetchUSBoxOfficeMetadata,
} from "@/data-sources/film/us-box-office-api";

describe("US box-office Kaggle client", () => {
  it("constructs the supported public dataset endpoint", () => {
    expect(buildUSBoxOfficeDownloadUrl("https://www.kaggle.com/api/v1")).toBe(
      "https://www.kaggle.com/api/v1/datasets/download/jonbown/weekend-box-office-summaries",
    );
    expect(() =>
      buildUSBoxOfficeDownloadUrl("https://example.com/api/v1"),
    ).toThrow("official Kaggle");
  });

  it("validates public dataset metadata", async () => {
    const result = await fetchUSBoxOfficeMetadata(
      "https://www.kaggle.com/api/v1",
      {
        fetchImplementation: async () =>
          new Response(
            JSON.stringify({
              ref: "jonbown/weekend-box-office-summaries",
              title: "U.S. Weekend Box Office Summaries",
              lastUpdated: "2026-08-11T02:26:37.840Z",
              licenseName: "CC0: Public Domain",
            }),
            { headers: { "content-type": "application/json" } },
          ),
      },
    );
    expect(result.lastUpdated.toISOString()).toBe("2026-08-11T02:26:37.840Z");
  });

  it("does not require credentials or expose a signed redirect URL", async () => {
    const result = await downloadUSBoxOfficeArchive(
      "https://www.kaggle.com/api/v1",
      {
        fetchImplementation: async () =>
          new Response(new Uint8Array([80, 75, 3, 4]), {
            headers: { "content-type": "application/zip" },
          }),
      },
    );
    expect(result.safeRequestUrl).toContain("www.kaggle.com/api/v1");
    expect(result.safeRequestUrl).not.toContain("X-Goog-");
  });
});
