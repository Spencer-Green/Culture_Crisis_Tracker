import type { AvailableMetric } from "@/data-sources/types";

export const EUROSTAT_DATASET = {
  code: "nama_10_cp18",
  title: "Household final consumption expenditure by purpose (COICOP 2018)",
  frequencyCode: "A",
  frequencyLabel: "Annual",
  geographyCode: "EU27_2020",
  geographyLabel: "European Union - 27 countries (from 2020)",
  firstCompatibleYear: "1995",
  latestValidatedYear: "2024",
} as const;

export type EurostatMetricDefinition = AvailableMetric & {
  countryCode: "EU";
  sectorSlug: "consumer-spending";
  datasetCode: typeof EUROSTAT_DATASET.code;
  geographyCode: typeof EUROSTAT_DATASET.geographyCode;
  geographyLabel: typeof EUROSTAT_DATASET.geographyLabel;
  coicopCode: "TOTAL" | "CP09";
  coicopLabel: "Total" | "Recreation, sport and culture";
  unitCode: "CP_MEUR" | "CLV20_MEUR";
  unitLabel:
    | "Current prices, million euro"
    | "Chain linked volumes (2020), million euro";
  priceBasis: "current-prices" | "chain-linked-2020-volumes";
  classification: "COICOP 2018";
};

const COMMON = {
  countryCode: "EU",
  sectorSlug: "consumer-spending",
  datasetCode: EUROSTAT_DATASET.code,
  geographyCode: EUROSTAT_DATASET.geographyCode,
  geographyLabel: EUROSTAT_DATASET.geographyLabel,
  frequency: "annual",
  classification: "COICOP 2018",
} as const;

const NOMINAL = {
  unit: "EUR millions current prices",
  unitCode: "CP_MEUR",
  unitLabel: "Current prices, million euro",
  priceBasis: "current-prices",
} as const;

const REAL = {
  unit: "EUR millions chain-linked volume (2020)",
  unitCode: "CLV20_MEUR",
  unitLabel: "Chain linked volumes (2020), million euro",
  priceBasis: "chain-linked-2020-volumes",
} as const;

export const EUROSTAT_METRICS = [
  {
    slug: "eu-household-spending-total-current-price",
    name: "EU household final consumption expenditure, current prices",
    description:
      "Annual EU27_2020 household final consumption expenditure at current prices under COICOP 2018.",
    coicopCode: "TOTAL",
    coicopLabel: "Total",
    ...COMMON,
    ...NOMINAL,
  },
  {
    slug: "eu-household-spending-total-real",
    name: "EU household final consumption expenditure, chain-linked volume",
    description:
      "Annual EU27_2020 household final consumption expenditure in chain-linked 2020 volumes under COICOP 2018.",
    coicopCode: "TOTAL",
    coicopLabel: "Total",
    ...COMMON,
    ...REAL,
  },
  {
    slug: "eu-recreation-culture-spending-current-price",
    name: "EU recreation, sport and culture expenditure, current prices",
    description:
      "Annual EU27_2020 household expenditure on COICOP 2018 division 09 Recreation, sport and culture at current prices.",
    coicopCode: "CP09",
    coicopLabel: "Recreation, sport and culture",
    ...COMMON,
    ...NOMINAL,
  },
  {
    slug: "eu-recreation-culture-spending-real",
    name: "EU recreation, sport and culture expenditure, chain-linked volume",
    description:
      "Annual EU27_2020 household expenditure on COICOP 2018 division 09 Recreation, sport and culture in chain-linked 2020 volumes.",
    coicopCode: "CP09",
    coicopLabel: "Recreation, sport and culture",
    ...COMMON,
    ...REAL,
  },
] as const satisfies readonly EurostatMetricDefinition[];

export type EurostatMetricSlug = (typeof EUROSTAT_METRICS)[number]["slug"];

export function getEurostatMetric(
  slug: string,
): EurostatMetricDefinition | undefined {
  return EUROSTAT_METRICS.find((metric) => metric.slug === slug);
}
