import { describe, expect, it, vi } from "vitest";

import {
  inspectMVTReport,
  MVTResponseError,
  validateMVTUrl,
} from "@/data-sources/music/mvt-api";

describe("MVT official report access", () => {
  it("accepts official HTTPS report URLs", () => {
    expect(
      validateMVTUrl(
        "https://www.musicvenuetrust.com/wp-content/uploads/2026/01/report.pdf#page=2",
      ),
    ).toBe(
      "https://www.musicvenuetrust.com/wp-content/uploads/2026/01/report.pdf",
    );
  });

  it("rejects unofficial and unsafe report URLs", () => {
    expect(() =>
      validateMVTUrl("http://www.musicvenuetrust.com/a.pdf"),
    ).toThrow(MVTResponseError);
    expect(() => validateMVTUrl("https://example.com/a.pdf")).toThrow(
      MVTResponseError,
    );
  });

  it("validates a PDF with a bounded HEAD request", async () => {
    const fetchImplementation = vi.fn(
      async () =>
        new Response(null, {
          status: 200,
          headers: {
            "content-type": "application/pdf",
            "content-length": "1234",
          },
        }),
    );
    const result = await inspectMVTReport(
      {
        year: 2025,
        url: "https://www.musicvenuetrust.com/report.pdf",
        fields: ["venueCount"],
      },
      { fetchImplementation },
    );
    expect(result).toMatchObject({
      reachable: true,
      httpStatus: 200,
      contentLength: 1234,
      fields: ["venueCount"],
    });
    expect(fetchImplementation).toHaveBeenCalledWith(
      "https://www.musicvenuetrust.com/report.pdf",
      expect.objectContaining({ method: "HEAD", redirect: "follow" }),
    );
  });

  it("reports an upstream access block without bypassing it", async () => {
    const result = await inspectMVTReport(
      {
        year: 2025,
        url: "https://www.musicvenuetrust.com/report.pdf",
        fields: [],
      },
      {
        fetchImplementation: async () =>
          new Response(null, {
            status: 401,
            headers: { "content-type": "text/html" },
          }),
      },
    );
    expect(result).toMatchObject({ reachable: false, httpStatus: 401 });
  });

  it("rejects non-PDF responses without exposing raw content", async () => {
    await expect(
      inspectMVTReport(
        {
          year: 2025,
          url: "https://www.musicvenuetrust.com/report.pdf",
          fields: [],
        },
        {
          fetchImplementation: async () =>
            new Response(null, {
              status: 200,
              headers: { "content-type": "text/html" },
            }),
        },
      ),
    ).rejects.toThrow("did not return a PDF");
  });
});
