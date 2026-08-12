import type { AvailableMetric } from "@/data-sources/types";

export type FredMetricDefinition = AvailableMetric & {
  seriesId:
    | "TOTALSL"
    | "REVOLSL"
    | "DRCCLACBS"
    | "CORCCACBS"
    | "CPIAUCSL"
    | "POPTHM"
    | "DSPI";
  expectedTitle: string;
  expectedFrequency: string;
  expectedUnits: string;
  expectedSeasonalAdjustment:
    | "Seasonally Adjusted"
    | "Not Seasonally Adjusted"
    | "Seasonally Adjusted Annual Rate";
  source:
    | "Board of Governors of the Federal Reserve System (US)"
    | "U.S. Bureau of Labor Statistics"
    | "U.S. Bureau of Economic Analysis";
  release: string;
  countryCode: "US";
  sectorSlug: "consumer-spending";
  measureType: "credit-balance" | "credit-stress-rate" | "normalization-input";
  periodType: "monthly" | "quarterly";
  sourceSemantics: string;
  presentationRole: "headline" | "supporting-input";
  normalizationPurpose?:
    | "inflation-normalization"
    | "per-capita-normalization"
    | "income-normalization";
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
    presentationRole: "headline",
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
    presentationRole: "headline",
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
    presentationRole: "headline",
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
    presentationRole: "headline",
    ...COMMON,
  },
  {
    slug: "us-cpi-all-urban-consumers-sa",
    name: "US consumer price index, all urban consumers",
    description:
      "Monthly seasonally adjusted US consumer price index for all urban consumers, all items.",
    unit: "index 1982-1984=100",
    frequency: "monthly",
    seriesId: "CPIAUCSL",
    expectedTitle:
      "Consumer Price Index for All Urban Consumers: All Items in U.S. City Average",
    expectedFrequency: "Monthly",
    expectedUnits: "Index 1982-1984=100",
    expectedSeasonalAdjustment: "Seasonally Adjusted",
    source: "U.S. Bureau of Labor Statistics",
    release: "Consumer Price Index",
    countryCode: "US",
    sectorSlug: "consumer-spending",
    measureType: "normalization-input",
    periodType: "monthly",
    sourceSemantics:
      "Seasonally adjusted monthly price index, 1982-1984 average equals 100",
    presentationRole: "supporting-input",
    normalizationPurpose: "inflation-normalization",
  },
  {
    slug: "us-population-monthly",
    name: "US population",
    description:
      "Monthly US population including resident population plus armed forces overseas.",
    unit: "thousands of persons",
    frequency: "monthly",
    seriesId: "POPTHM",
    expectedTitle: "Population",
    expectedFrequency: "Monthly",
    expectedUnits: "Thousands",
    expectedSeasonalAdjustment: "Not Seasonally Adjusted",
    source: "U.S. Bureau of Economic Analysis",
    release: "Personal Income and Outlays",
    countryCode: "US",
    sectorSlug: "consumer-spending",
    measureType: "normalization-input",
    periodType: "monthly",
    sourceSemantics:
      "Monthly population in thousands of persons, not seasonally adjusted",
    presentationRole: "supporting-input",
    normalizationPurpose: "per-capita-normalization",
  },
  {
    slug: "us-disposable-personal-income-saar",
    name: "US disposable personal income",
    description:
      "Monthly US disposable personal income at seasonally adjusted annual rates.",
    unit: "USD billions SAAR",
    frequency: "monthly",
    seriesId: "DSPI",
    expectedTitle: "Disposable Personal Income",
    expectedFrequency: "Monthly",
    expectedUnits: "Billions of Dollars",
    expectedSeasonalAdjustment: "Seasonally Adjusted Annual Rate",
    source: "U.S. Bureau of Economic Analysis",
    release: "Personal Income and Outlays",
    countryCode: "US",
    sectorSlug: "consumer-spending",
    measureType: "normalization-input",
    periodType: "monthly",
    sourceSemantics:
      "Monthly disposable personal income in billions of dollars at a seasonally adjusted annual rate",
    presentationRole: "supporting-input",
    normalizationPurpose: "income-normalization",
  },
] as const satisfies readonly FredMetricDefinition[];

export type FredMetricSlug = (typeof FRED_METRICS)[number]["slug"];

export function getFredMetric(slug: string): FredMetricDefinition | undefined {
  return FRED_METRICS.find((metric) => metric.slug === slug);
}
