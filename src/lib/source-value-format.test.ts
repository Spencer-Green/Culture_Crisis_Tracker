import { describe, expect, it } from "vitest";

import {
  formatMillions,
  formatPublishedValue,
} from "@/lib/source-value-format";

describe("source value formatting", () => {
  it("formats USD millions as readable billions and trillions", () => {
    expect(formatMillions(22_184_132, "USD")).toBe("$22.18T");
    expect(formatMillions(870_899, "USD")).toBe("$870.9B");
    expect(formatMillions(5_166_907.71, "USD")).toBe("$5.17T");
    expect(formatMillions(1_351_069.14, "USD")).toBe("$1.35T");
  });

  it("uses the Australian-dollar prefix and suitable precision", () => {
    expect(formatMillions(81_284.5, "AUD")).toBe("A$81.28B");
    expect(formatMillions(13_746.9, "AUD")).toBe("A$13.75B");
  });

  it("uses the pound symbol for GBP millions", () => {
    expect(formatMillions(13_746.9, "GBP")).toBe("£13.75B");
  });

  it("uses the euro symbol for Eurostat million-euro values", () => {
    expect(formatMillions(9_339_872.8, "EUR")).toBe("€9.34T");
    expect(
      formatPublishedValue("870899", "EUR millions chain-linked volume (2020)")
        .headline,
    ).toBe("€870.9B");
  });

  it("uses the Canadian-dollar prefix for Statistics Canada millions", () => {
    expect(formatMillions(452_296, "CAD")).toBe("C$452.3B");
    expect(formatMillions(34_106, "CAD")).toBe("C$34.11B");
    expect(
      formatPublishedValue(
        "364807",
        "2017 constant CAD millions, quarterly rate",
      ).headline,
    ).toBe("C$364.8B");
  });

  it("applies stable precision rules across magnitude bands", () => {
    expect(formatMillions(500, "USD")).toBe("$500M");
    expect(formatMillions(1_250, "USD")).toBe("$1.25B");
    expect(formatMillions(125_000, "USD")).toBe("$125B");
    expect(formatMillions(2_000_000, "USD")).toBe("$2T");
  });

  it("labels nominal BEA SAAR values as annualized without dividing by twelve", () => {
    expect(formatPublishedValue("22184132", "USD millions SAAR")).toEqual({
      headline: "$22.18T annualized",
      descriptor: "Current dollars, SAAR",
      sourceUnit: "USD millions SAAR",
      annualized: true,
    });
  });

  it("labels real BEA chained-dollar SAAR values precisely", () => {
    expect(
      formatPublishedValue("16890000", "chained 2017 USD millions SAAR"),
    ).toEqual({
      headline: "$16.89T annualized",
      descriptor: "Chained 2017 dollars, SAAR",
      sourceUnit: "chained 2017 USD millions SAAR",
      annualized: true,
    });
  });

  it("preserves ABS, ONS, BEA, FRED, and Eurostat source semantics", () => {
    expect(formatPublishedValue("81284.5", "AUD millions").headline).toBe(
      "A$81.28B",
    );
    expect(
      formatPublishedValue("13746.9", "GBP millions current prices").headline,
    ).toBe("£13.75B");
    expect(formatPublishedValue("5166907.71", "USD millions").headline).toBe(
      "$5.17T",
    );
    expect(formatPublishedValue("3.25", "percent").headline).toBe("3.25%");
    expect(
      formatPublishedValue("9339872.8", "EUR millions current prices").headline,
    ).toBe("€9.34T");
  });
});
