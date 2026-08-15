import { describe, expect, it } from "vitest";

import { getSourceDefinition } from "@/data-sources/catalog";
import { getSourceConfigurationStatus } from "@/data-sources/configuration";

describe("source configuration status", () => {
  it("configures a public source only when its base URL is valid", () => {
    const abs = getSourceDefinition("abs");

    expect(
      getSourceConfigurationStatus(abs, {
        ABS_BASE_URL: "https://data.api.abs.gov.au/rest",
      }),
    ).toEqual({
      configured: true,
      missingConfiguration: [],
    });

    expect(getSourceConfigurationStatus(abs, {})).toEqual({
      configured: false,
      missingConfiguration: ["ABS_BASE_URL"],
    });
  });

  it("rejects malformed public base URLs", () => {
    const abs = getSourceDefinition("abs");

    expect(
      getSourceConfigurationStatus(abs, {
        ABS_BASE_URL: "not-a-url",
      }),
    ).toEqual({
      configured: false,
      missingConfiguration: ["ABS_BASE_URL"],
    });
  });

  it("configures ONS v1 without an API credential", () => {
    expect(
      getSourceConfigurationStatus(getSourceDefinition("ons"), {
        ONS_BASE_URL: "https://api.beta.ons.gov.uk/v1",
      }),
    ).toEqual({
      configured: true,
      missingConfiguration: [],
    });
  });

  it("configures the public Eurostat endpoint with only a valid URL", () => {
    const eurostat = getSourceDefinition("eurostat");
    expect(
      getSourceConfigurationStatus(eurostat, {
        EUROSTAT_BASE_URL:
          "https://ec.europa.eu/eurostat/api/dissemination/statistics/1.0",
      }),
    ).toEqual({ configured: true, missingConfiguration: [] });
    expect(getSourceConfigurationStatus(eurostat, {})).toEqual({
      configured: false,
      missingConfiguration: ["EUROSTAT_BASE_URL"],
    });
  });

  it("configures public Statistics Canada WDS without a credential", () => {
    expect(
      getSourceConfigurationStatus(getSourceDefinition("statcan"), {
        STATCAN_BASE_URL: "https://www150.statcan.gc.ca/t1/wds",
      }),
    ).toEqual({ configured: true, missingConfiguration: [] });
  });

  it("configures the public BFI report index without credentials", () => {
    expect(
      getSourceConfigurationStatus(getSourceDefinition("bfi"), {
        BFI_BASE_URL:
          "https://www.bfi.org.uk/industry-data-insights/weekend-box-office-figures",
      }),
    ).toEqual({ configured: true, missingConfiguration: [] });
  });

  it("configures public MVT reports without credentials", () => {
    expect(
      getSourceConfigurationStatus(getSourceDefinition("mvt"), {
        MVT_BASE_URL: "https://www.musicvenuetrust.com/resources/",
      }),
    ).toEqual({ configured: true, missingConfiguration: [] });
  });

  it("configures the public LPA report archive without credentials", () => {
    expect(
      getSourceConfigurationStatus(getSourceDefinition("lpa"), {
        LPA_BASE_URL: "https://reports.liveperformance.com.au/",
      }),
    ).toEqual({ configured: true, missingConfiguration: [] });
  });

  it("configures public Census AIES downloads without credentials", () => {
    expect(
      getSourceConfigurationStatus(getSourceDefinition("census"), {
        CENSUS_BASE_URL: "https://www2.census.gov/programs-surveys/aies/data",
      }),
    ).toEqual({ configured: true, missingConfiguration: [] });
  });

  it("requires both the base URL and declared authentication fields", () => {
    const ticketmaster = getSourceDefinition("ticketmaster");
    const baseEnvironment = {
      TICKETMASTER_BASE_URL: "https://app.ticketmaster.com/discovery/v2",
    } as const;

    expect(getSourceConfigurationStatus(ticketmaster, baseEnvironment)).toEqual(
      {
        configured: false,
        missingConfiguration: ["TICKETMASTER_API_KEY"],
      },
    );

    expect(
      getSourceConfigurationStatus(ticketmaster, {
        ...baseEnvironment,
        TICKETMASTER_API_KEY: "test-only-key",
      }),
    ).toEqual({
      configured: true,
      missingConfiguration: [],
    });
  });

  it.each([
    ["bea" as const, "BEA_BASE_URL" as const, "BEA_API_KEY" as const],
    ["fred" as const, "FRED_BASE_URL" as const, "FRED_API_KEY" as const],
  ])("configures %s only with its URL and key", (slug, urlKey, keyName) => {
    const source = getSourceDefinition(slug);
    const url =
      slug === "bea"
        ? "https://apps.bea.gov/api/data"
        : "https://api.stlouisfed.org/fred";

    expect(getSourceConfigurationStatus(source, { [urlKey]: url })).toEqual({
      configured: false,
      missingConfiguration: [keyName],
    });
    expect(
      getSourceConfigurationStatus(source, {
        [urlKey]: url,
        [keyName]: "test-only-key",
      }),
    ).toEqual({ configured: true, missingConfiguration: [] });
  });
});
