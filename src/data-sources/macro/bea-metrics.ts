import type { AvailableMetric } from "@/data-sources/types";

export const BEA_DATASET = "NIPA" as const;
export const BEA_FREQUENCY = "M" as const;

export type BeaMetricDefinition = AvailableMetric & {
  countryCode: "US";
  sectorSlug: "consumer-spending";
  dataset: typeof BEA_DATASET;
  tableName: "T20805" | "T20806";
  tableTitle: string;
  lineNumber: "1" | "18";
  lineDescription: string;
  seriesCode: string;
  metricName: "Current Dollars" | "Chained Dollars";
  unitMultiplier: "6";
  adjustment: string;
  priceBasis: "current-prices" | "chained-2017-dollars";
  firstAvailablePeriod: string;
};

const CURRENT_DOLLAR_TABLE = {
  tableName: "T20805",
  tableTitle:
    "Table 2.8.5. Personal Consumption Expenditures by Major Type of Product, Monthly",
  metricName: "Current Dollars",
  unit: "USD millions SAAR",
  unitMultiplier: "6",
  adjustment: "Seasonally adjusted at annual rates (SAAR)",
  priceBasis: "current-prices",
  firstAvailablePeriod: "1959-01",
} as const;

const REAL_DOLLAR_TABLE = {
  tableName: "T20806",
  tableTitle:
    "Table 2.8.6. Real Personal Consumption Expenditures by Major Type of Product, Monthly, Chained Dollars",
  metricName: "Chained Dollars",
  unit: "chained 2017 USD millions SAAR",
  unitMultiplier: "6",
  adjustment: "Seasonally adjusted at annual rates (SAAR)",
  priceBasis: "chained-2017-dollars",
  firstAvailablePeriod: "2007-01",
} as const;

const COMMON = {
  countryCode: "US",
  sectorSlug: "consumer-spending",
  dataset: BEA_DATASET,
  frequency: "monthly",
} as const;

export const BEA_METRICS = [
  {
    slug: "us-pce-total-current-price",
    name: "US personal consumption expenditures, current dollars",
    description:
      "Monthly US personal consumption expenditures at current dollars, seasonally adjusted at annual rates.",
    lineNumber: "1",
    lineDescription: "Personal consumption expenditures (PCE)",
    seriesCode: "DPCERC",
    ...COMMON,
    ...CURRENT_DOLLAR_TABLE,
  },
  {
    slug: "us-pce-total-real",
    name: "US real personal consumption expenditures",
    description:
      "Monthly real US personal consumption expenditures in chained 2017 dollars, seasonally adjusted at annual rates.",
    lineNumber: "1",
    lineDescription: "Personal consumption expenditures (PCE)",
    seriesCode: "DPCERX",
    ...COMMON,
    ...REAL_DOLLAR_TABLE,
  },
  {
    slug: "us-recreation-services-pce-current-price",
    name: "US recreation services PCE, current dollars",
    description:
      "Monthly US personal consumption expenditures on recreation services at current dollars, seasonally adjusted at annual rates.",
    lineNumber: "18",
    lineDescription: "Recreation services",
    seriesCode: "DRCARC",
    ...COMMON,
    ...CURRENT_DOLLAR_TABLE,
  },
  {
    slug: "us-recreation-services-pce-real",
    name: "US real recreation services PCE",
    description:
      "Monthly real US personal consumption expenditures on recreation services in chained 2017 dollars, seasonally adjusted at annual rates.",
    lineNumber: "18",
    lineDescription: "Recreation services",
    seriesCode: "DRCARX",
    ...COMMON,
    ...REAL_DOLLAR_TABLE,
  },
] as const satisfies readonly BeaMetricDefinition[];

export type BeaMetricSlug = (typeof BEA_METRICS)[number]["slug"];

export function getBeaMetric(slug: string): BeaMetricDefinition | undefined {
  return BEA_METRICS.find((metric) => metric.slug === slug);
}
