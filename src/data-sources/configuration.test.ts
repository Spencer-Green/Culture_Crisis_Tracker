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
