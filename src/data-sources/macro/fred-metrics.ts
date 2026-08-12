import type { AvailableMetric } from "@/data-sources/types";

export type FredMetricDefinition = AvailableMetric & {
  seriesId: "TOTALSL" | "REVOLSL" | "DRCCLACBS" | "CORCCACBS";
  expectedTitle: string;
  expectedFrequency: string;
  expectedUnits: string;
  expectedSeasonalAdjustment: "Seasonally Adjusted";
  source: "Board of Governors of the Federal Reserve System (US)";
  release: string;
  countryCode: "US";
  sectorSlug: "consumer-spending";
  measureType: "credit-balance" | "credit-stress-rate";
  periodType: "monthly" | "quarterly";
  sourceSemantics: string;
};

const COMMON = {
  source: "Board of Governors of the Federal Reserve System (US)",
  expectedSeasonalAdjustment: "Seasonally Adjusted",
  countryCode: "US",
  sectorSlug: "consumer-spending",
} as const;

export const FRED_METRICS = [
  {
    slug: "us-total-consumer-credit-sa",
    name: "US total consumer credit",
    description:
      "Total US consumer credit owned and securitized, seasonally adjusted.",
    unit: "USD millions",
    frequency: "monthly",
    seriesId: "TOTALSL",
    expectedTitle: "Total Consumer Credit Owned and Securitized",
    expectedFrequency: "Monthly",
    expectedUnits: "Millions of U.S. Dollars",
    release: "G.19 Consumer Credit",
    measureType: "credit-balance",
    periodType: "monthly",
    sourceSemantics: "Seasonally adjusted monthly credit balance",
    ...COMMON,
  },
  {
    slug: "us-revolving-consumer-credit-sa",
    name: "US revolving consumer credit",
    description:
      "US revolving consumer credit owned and securitized, seasonally adjusted.",
    unit: "USD millions",
    frequency: "monthly",
    seriesId: "REVOLSL",
    expectedTitle: "Revolving Consumer Credit Owned and Securitized",
    expectedFrequency: "Monthly",
    expectedUnits: "Millions of U.S. Dollars",
    release: "G.19 Consumer Credit",
    measureType: "credit-balance",
    periodType: "monthly",
    sourceSemantics: "Seasonally adjusted monthly revolving credit balance",
    ...COMMON,
  },
  {
    slug: "us-credit-card-delinquency-rate-sa",
    name: "US credit-card delinquency rate",
    description:
      "Delinquency rate on credit-card loans at all US commercial banks, seasonally adjusted and measured at quarter end.",
    unit: "percent",
    frequency: "quarterly",
    seriesId: "DRCCLACBS",
    expectedTitle:
      "Delinquency Rate on Credit Card Loans, All Commercial Banks",
    expectedFrequency: "Quarterly, End of Period",
    expectedUnits: "Percent",
    release:
      "Charge-Off and Delinquency Rates on Loans and Leases at Commercial Banks",
    measureType: "credit-stress-rate",
    periodType: "quarterly",
    sourceSemantics: "Seasonally adjusted quarterly end-of-period rate",
    ...COMMON,
  },
  {
    slug: "us-credit-card-chargeoff-rate-sa",
    name: "US credit-card charge-off rate",
    description:
      "Charge-off rate on credit-card loans at all US commercial banks, seasonally adjusted, annualized, and net of recoveries.",
    unit: "percent",
    frequency: "quarterly",
    seriesId: "CORCCACBS",
    expectedTitle: "Charge-Off Rate on Credit Card Loans, All Commercial Banks",
    expectedFrequency: "Quarterly",
    expectedUnits: "Percent",
    release:
      "Charge-Off and Delinquency Rates on Loans and Leases at Commercial Banks",
    measureType: "credit-stress-rate",
    periodType: "quarterly",
    sourceSemantics:
      "Seasonally adjusted quarterly rate, annualized and net of recoveries",
    ...COMMON,
  },
] as const satisfies readonly FredMetricDefinition[];

export type FredMetricSlug = (typeof FRED_METRICS)[number]["slug"];

export function getFredMetric(slug: string): FredMetricDefinition | undefined {
  return FRED_METRICS.find((metric) => metric.slug === slug);
}
