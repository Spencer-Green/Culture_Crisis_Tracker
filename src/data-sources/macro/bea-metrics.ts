import type { AvailableMetric } from "@/data-sources/types";

export const BEA_DATASET = "NIPA" as const;
export const BEA_UNDERLYING_DETAIL_DATASET = "NIUnderlyingDetail" as const;
export const BEA_FREQUENCY = "M" as const;

export type BeaDataset =
  typeof BEA_DATASET | typeof BEA_UNDERLYING_DETAIL_DATASET;

export type BeaMetricDefinition = AvailableMetric & {
  countryCode: "US";
  sectorSlug: "consumer-spending" | "music";
  dataset: BeaDataset;
  tableName: "T20805" | "T20806" | "U20405" | "U20406";
  tableTitle: string;
  lineNumber: "1" | "18" | "45" | "225";
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

export const BEA_MACRO_METRICS = [
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

const UNDERLYING_CURRENT_DOLLAR_TABLE = {
  dataset: BEA_UNDERLYING_DETAIL_DATASET,
  tableName: "U20405",
  tableTitle:
    "Table 2.4.5U. Personal Consumption Expenditures by Type of Product",
  metricName: "Current Dollars",
  unit: "USD millions SAAR",
  unitMultiplier: "6",
  adjustment: "Seasonally adjusted at annual rates (SAAR)",
  priceBasis: "current-prices",
} as const;

const UNDERLYING_REAL_DOLLAR_TABLE = {
  dataset: BEA_UNDERLYING_DETAIL_DATASET,
  tableName: "U20406",
  tableTitle:
    "Table 2.4.6U. Real Personal Consumption Expenditures by Type of Product, Chained Dollars",
  metricName: "Chained Dollars",
  unit: "chained 2017 USD millions SAAR",
  unitMultiplier: "6",
  adjustment: "Seasonally adjusted at annual rates (SAAR)",
  priceBasis: "chained-2017-dollars",
} as const;

const MUSIC_COMMON = {
  countryCode: "US",
  sectorSlug: "music",
  frequency: "monthly",
} as const;

const AUDIO_STREAMING_RADIO = {
  lineNumber: "225",
  lineDescription:
    "Audio streaming and radio services (including satellite radio)",
  firstAvailablePeriod: "2007-01",
} as const;

const OWNED_RECORDED_MEDIA = {
  lineNumber: "45",
  lineDescription: "Audio discs, tapes, vinyl, and permanent digital downloads",
} as const;

export const BEA_MUSIC_METRICS = [
  {
    slug: "us-audio-streaming-radio-pce-current-price",
    name: "US audio streaming and radio services PCE, current dollars",
    description:
      "Monthly US household personal consumption expenditures on audio streaming and radio services, including satellite radio, at current dollars.",
    seriesCode: "LA000232",
    ...MUSIC_COMMON,
    ...AUDIO_STREAMING_RADIO,
    ...UNDERLYING_CURRENT_DOLLAR_TABLE,
  },
  {
    slug: "us-audio-streaming-radio-pce-real",
    name: "US real audio streaming and radio services PCE",
    description:
      "Monthly real US household personal consumption expenditures on audio streaming and radio services, including satellite radio, in chained 2017 dollars.",
    seriesCode: "LB000232",
    ...MUSIC_COMMON,
    ...AUDIO_STREAMING_RADIO,
    ...UNDERLYING_REAL_DOLLAR_TABLE,
  },
  {
    slug: "us-owned-recorded-music-pce-current-price",
    name: "US owned recorded media and downloads PCE, current dollars",
    description:
      "Monthly US household personal consumption expenditures on audio discs, tapes, vinyl, and permanent digital downloads at current dollars.",
    seriesCode: "DRTDRC",
    firstAvailablePeriod: "1959-01",
    ...MUSIC_COMMON,
    ...OWNED_RECORDED_MEDIA,
    ...UNDERLYING_CURRENT_DOLLAR_TABLE,
  },
  {
    slug: "us-owned-recorded-music-pce-real",
    name: "US real owned recorded media and downloads PCE",
    description:
      "Monthly real US household personal consumption expenditures on audio discs, tapes, vinyl, and permanent digital downloads in chained 2017 dollars.",
    seriesCode: "DRTDRX",
    firstAvailablePeriod: "2007-01",
    ...MUSIC_COMMON,
    ...OWNED_RECORDED_MEDIA,
    ...UNDERLYING_REAL_DOLLAR_TABLE,
  },
] as const satisfies readonly BeaMetricDefinition[];

export const BEA_METRICS = [
  ...BEA_MACRO_METRICS,
  ...BEA_MUSIC_METRICS,
] as const satisfies readonly BeaMetricDefinition[];

export type BeaMetricSlug = (typeof BEA_METRICS)[number]["slug"];

export function getBeaMetric(slug: string): BeaMetricDefinition | undefined {
  return BEA_METRICS.find((metric) => metric.slug === slug);
}
