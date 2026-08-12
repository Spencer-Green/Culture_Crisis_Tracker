import type { AvailableMetric } from "@/data-sources/types";

export const STATCAN_TABLE = {
  productId: 36100124,
  tableNumber: "36-10-0124-01",
  title: "Detailed household final consumption expenditure, Canada, quarterly",
  geography: "Canada",
  frequencyCode: 9,
  frequencyLabel: "Quarterly",
  seasonalAdjustment: "Seasonally adjusted at quarterly rates",
  unitCode: 81,
  unitLabel: "Dollars",
  scalarFactorCode: 6,
  scalarFactorLabel: "millions",
  firstAvailableQuarter: "1981-Q1",
  latestValidatedQuarter: "2026-Q1",
} as const;

export type StatCanMetricDefinition = AvailableMetric & {
  countryCode: "CA";
  sectorSlug: "consumer-spending";
  vectorId: number;
  coordinate: string;
  categoryMemberId: 1 | 70;
  categoryLabel:
    "Household final consumption expenditure" | "Recreation and culture";
  priceMemberId: 1 | 2;
  priceLabel: "Current prices" | "2017 constant prices";
  priceBasis: "current-prices" | "constant-2017-prices";
  seasonalAdjustment: typeof STATCAN_TABLE.seasonalAdjustment;
  sourceUnit: typeof STATCAN_TABLE.unitLabel;
  scalarFactorCode: typeof STATCAN_TABLE.scalarFactorCode;
  scalarFactorLabel: typeof STATCAN_TABLE.scalarFactorLabel;
};

const COMMON = {
  countryCode: "CA",
  sectorSlug: "consumer-spending",
  frequency: "quarterly",
  seasonalAdjustment: STATCAN_TABLE.seasonalAdjustment,
  sourceUnit: STATCAN_TABLE.unitLabel,
  scalarFactorCode: STATCAN_TABLE.scalarFactorCode,
  scalarFactorLabel: STATCAN_TABLE.scalarFactorLabel,
} as const;

const CURRENT_PRICE = {
  priceMemberId: 1,
  priceLabel: "Current prices",
  priceBasis: "current-prices",
  unit: "CAD millions current prices, quarterly rate",
} as const;

const REAL = {
  priceMemberId: 2,
  priceLabel: "2017 constant prices",
  priceBasis: "constant-2017-prices",
  unit: "2017 constant CAD millions, quarterly rate",
} as const;

export const STATCAN_METRICS = [
  {
    slug: "ca-household-spending-total-current-price",
    name: "Canadian household final consumption expenditure, current prices",
    description:
      "Quarterly Canadian household final consumption expenditure at current prices, seasonally adjusted at quarterly rates.",
    vectorId: 62700456,
    coordinate: "1.1.1.1.0.0.0.0.0.0",
    categoryMemberId: 1,
    categoryLabel: "Household final consumption expenditure",
    ...COMMON,
    ...CURRENT_PRICE,
  },
  {
    slug: "ca-household-spending-total-real",
    name: "Canadian household final consumption expenditure, 2017 constant prices",
    description:
      "Quarterly Canadian household final consumption expenditure at 2017 constant prices, seasonally adjusted at quarterly rates.",
    vectorId: 62700682,
    coordinate: "1.2.1.1.0.0.0.0.0.0",
    categoryMemberId: 1,
    categoryLabel: "Household final consumption expenditure",
    ...COMMON,
    ...REAL,
  },
  {
    slug: "ca-recreation-culture-spending-current-price",
    name: "Canadian recreation and culture spending, current prices",
    description:
      "Quarterly Canadian recreation and culture expenditure at current prices, seasonally adjusted at quarterly rates.",
    vectorId: 62700517,
    coordinate: "1.1.1.70.0.0.0.0.0.0",
    categoryMemberId: 70,
    categoryLabel: "Recreation and culture",
    ...COMMON,
    ...CURRENT_PRICE,
  },
  {
    slug: "ca-recreation-culture-spending-real",
    name: "Canadian recreation and culture spending, 2017 constant prices",
    description:
      "Quarterly Canadian recreation and culture expenditure at 2017 constant prices, seasonally adjusted at quarterly rates.",
    vectorId: 62700751,
    coordinate: "1.2.1.70.0.0.0.0.0.0",
    categoryMemberId: 70,
    categoryLabel: "Recreation and culture",
    ...COMMON,
    ...REAL,
  },
] as const satisfies readonly StatCanMetricDefinition[];

export const STATCAN_CULTURAL_DETAIL_SERIES = [
  ["Audio-visual and photographic equipment", 71, 62700518],
  ["Recording media", 73, 62700520],
  [
    "Musical instruments and major durables for indoor recreation",
    75,
    62700522,
  ],
  ["Games, toys and hobbies", 76, 62700523],
  ["Recreational and sporting services", 81, 62700528],
  ["Cinemas", 83, 62700530],
  ["Other cultural services", 85, 62700532],
  ["Books", 87, 62700534],
  ["Newspapers and periodicals", 88, 62700535],
] as const;

export function getStatCanMetric(
  slug: string,
): StatCanMetricDefinition | undefined {
  return STATCAN_METRICS.find((metric) => metric.slug === slug);
}
