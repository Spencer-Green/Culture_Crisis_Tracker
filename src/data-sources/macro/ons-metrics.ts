import type { AvailableMetric } from "@/data-sources/types";

export const ONS_DATASET = {
  id: "CT",
  label: "Consumer trends time series",
  frequency: "quarterly",
} as const;

export type OnsPriceBasis = "current-prices" | "cvm";

export type OnsMetricDefinition = AvailableMetric & {
  cdid: string;
  expectedTitle: string;
  countryCode: "GB";
  sectorSlug: "consumer-spending";
  datasetId: typeof ONS_DATASET.id;
  priceBasis: OnsPriceBasis;
  seasonallyAdjusted: true;
  domesticConcept: boolean;
  coicopDivision: "00" | "09";
};

export const ONS_METRICS = [
  {
    slug: "uk-household-spending-total-current-price-sa",
    name: "UK total household spending, current prices",
    description:
      "Quarterly seasonally adjusted UK household final consumption expenditure using the domestic concept at current prices.",
    unit: "GBP millions current prices",
    frequency: "quarterly",
    cdid: "ZAKV",
    expectedTitle:
      "0 Household final consumption expenditure: Domestic concept CP SA £m",
    countryCode: "GB",
    sectorSlug: "consumer-spending",
    datasetId: "CT",
    priceBasis: "current-prices",
    seasonallyAdjusted: true,
    domesticConcept: true,
    coicopDivision: "00",
  },
  {
    slug: "uk-household-spending-total-cvm-sa",
    name: "UK total household spending, chained volume measure",
    description:
      "Quarterly seasonally adjusted UK household final consumption expenditure using the domestic concept as a chained volume measure.",
    unit: "GBP millions CVM",
    frequency: "quarterly",
    cdid: "ZAKW",
    expectedTitle:
      "0 Household final consumption expenditure :Domestic concept CVM NAYear SA £m",
    countryCode: "GB",
    sectorSlug: "consumer-spending",
    datasetId: "CT",
    priceBasis: "cvm",
    seasonallyAdjusted: true,
    domesticConcept: true,
    coicopDivision: "00",
  },
  {
    slug: "uk-recreation-culture-spending-current-price-sa",
    name: "UK recreation and culture spending, current prices",
    description:
      "Quarterly seasonally adjusted UK household spending on COICOP division 09 recreation and culture at current prices.",
    unit: "GBP millions current prices",
    frequency: "quarterly",
    cdid: "ZAWZ",
    expectedTitle: "09 Recreation and culture CP SA £m",
    countryCode: "GB",
    sectorSlug: "consumer-spending",
    datasetId: "CT",
    priceBasis: "current-prices",
    seasonallyAdjusted: true,
    domesticConcept: false,
    coicopDivision: "09",
  },
  {
    slug: "uk-recreation-culture-spending-cvm-sa",
    name: "UK recreation and culture spending, chained volume measure",
    description:
      "Quarterly seasonally adjusted UK household spending on COICOP division 09 recreation and culture as a chained volume measure.",
    unit: "GBP millions CVM",
    frequency: "quarterly",
    cdid: "ZAXA",
    expectedTitle: "09 Recreation and culture CVM NAYear SA £m",
    countryCode: "GB",
    sectorSlug: "consumer-spending",
    datasetId: "CT",
    priceBasis: "cvm",
    seasonallyAdjusted: true,
    domesticConcept: false,
    coicopDivision: "09",
  },
] as const satisfies readonly OnsMetricDefinition[];

export type OnsMetricSlug = (typeof ONS_METRICS)[number]["slug"];

export function getOnsMetric(slug: string): OnsMetricDefinition | undefined {
  return ONS_METRICS.find((metric) => metric.slug === slug);
}
