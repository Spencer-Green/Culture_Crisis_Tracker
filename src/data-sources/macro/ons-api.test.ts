import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

import { describe, expect, it, vi } from "vitest";

import {
  buildOnsDataUrl,
  buildOnsSearchUrl,
  discoverOnsSeries,
  resolveOnsSeries,
} from "@/data-sources/macro/ons-api";
import { ONS_METRICS } from "@/data-sources/macro/ons-metrics";

const searchFixture = readFileSync(
  fileURLToPath(
    new URL("./__fixtures__/ons-search-zakv.json", import.meta.url),
  ),
  "utf8",
);

describe("ONS v1 discovery", () => {
  it("constructs current v1 search and encoded data URLs", () => {
    expect(
      buildOnsSearchUrl("https://api.beta.ons.gov.uk/v1", "ZAKV").toString(),
    ).toBe(
      "https://api.beta.ons.gov.uk/v1/search?content_type=timeseries&cdids=ZAKV",
    );
    expect(
      buildOnsDataUrl(
        "https://api.beta.ons.gov.uk/v1",
        "/economy/nationalaccounts/satelliteaccounts/timeseries/zakv/ct",
      ).toString(),
    ).toBe(
      "https://api.beta.ons.gov.uk/v1/data?uri=%2Feconomy%2Fnationalaccounts%2Fsatelliteaccounts%2Ftimeseries%2Fzakv%2Fct",
    );
  });

  it("resolves the exact CT result rather than another dataset", () => {
    expect(resolveOnsSeries(searchFixture, ONS_METRICS[0])).toEqual({
      cdid: "ZAKV",
      title:
        "0 Household final consumption expenditure: Domestic concept CP SA £m",
      datasetId: "CT",
      edition: null,
      uri: "/economy/nationalaccounts/satelliteaccounts/timeseries/zakv/ct",
      releaseDate: "2026-06-29T23:00:00.000Z",
    });
  });

  it("rejects a silently changed title mapping", () => {
    expect(() =>
      resolveOnsSeries(
        searchFixture.replace(
          /0 Household final consumption expenditure: Domestic concept CP SA £m/g,
          "Different series",
        ),
        ONS_METRICS[0],
      ),
    ).toThrow("title mismatch");
  });

  it("respects Retry-After once for a 429 response", async () => {
    const fetchImplementation = vi
      .fn<typeof fetch>()
      .mockResolvedValueOnce(
        new Response("rate limited", {
          status: 429,
          headers: {
            "content-type": "application/json",
            "retry-after": "2",
          },
        }),
      )
      .mockResolvedValueOnce(
        new Response(searchFixture, {
          status: 200,
          headers: { "content-type": "application/json" },
        }),
      );
    const sleep = vi.fn(async () => undefined);

    await expect(
      discoverOnsSeries("https://api.beta.ons.gov.uk/v1", ONS_METRICS[0], {
        fetchImplementation,
        sleep,
      }),
    ).resolves.toMatchObject({ cdid: "ZAKV", datasetId: "CT" });
    expect(sleep).toHaveBeenCalledOnce();
    expect(sleep).toHaveBeenCalledWith(2_000);
    expect(fetchImplementation).toHaveBeenCalledTimes(2);
  });
});
