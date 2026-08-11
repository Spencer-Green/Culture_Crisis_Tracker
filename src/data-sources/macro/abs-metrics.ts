import type { AvailableMetric } from "@/data-sources/types";

export const ABS_DATAFLOW = {
  agency: "ABS",
  id: "HSI_M",
  version: "1.6.0",
  label: "Monthly Household Spending Indicator",
  dimensionOrder: [
    "MEASURE",
    "CATEGORY",
    "PRICE_ADJUSTMENT",
    "TSEST",
    "STATE",
    "FREQ",
  ],
  firstAvailablePeriod: "2012-07",
} as const;

type DimensionCode = {
  code: string;
  label: string;
};

export type AbsMetricDefinition = AvailableMetric & {
  countryCode: "AU";
  sectorSlug: "consumer-spending";
  dataflow: typeof ABS_DATAFLOW;
  dimensions: {
    measure: DimensionCode;
    category: DimensionCode;
    priceAdjustment: DimensionCode;
    adjustmentType: DimensionCode;
    geography: DimensionCode;
    frequency: DimensionCode;
  };
  unitMetadata: {
    code: string;
    label: string;
    multiplierCode: string;
    multiplierLabel: string;
  };
};

const COMMON_DIMENSIONS = {
  priceAdjustment: { code: "CUR", label: "Current Price" },
  adjustmentType: { code: "20", label: "Seasonally Adjusted" },
  geography: { code: "AUS", label: "Australia" },
  frequency: { code: "M", label: "Monthly" },
} as const;

const ABSOLUTE_UNIT = {
  code: "AUD",
  label: "Australian Dollars",
  multiplierCode: "6",
  multiplierLabel: "Millions",
} as const;

const PERCENT_UNIT = {
  code: "PCT",
  label: "Percent",
  multiplierCode: "0",
  multiplierLabel: "Units",
} as const;

export const ABS_METRICS = [
  {
    slug: "au-household-spending-total-current-price-sa",
    name: "Australian total household spending",
    description:
      "Monthly seasonally adjusted Australian household spending at current prices.",
    unit: "AUD millions",
    frequency: "monthly",
    countryCode: "AU",
    sectorSlug: "consumer-spending",
    dataflow: ABS_DATAFLOW,
    dimensions: {
      measure: { code: "7", label: "Household spending" },
      category: { code: "TOT", label: "Total" },
      ...COMMON_DIMENSIONS,
    },
    unitMetadata: ABSOLUTE_UNIT,
  },
  {
    slug: "au-recreation-culture-spending-current-price-sa",
    name: "Australian recreation and culture spending",
    description:
      "Monthly seasonally adjusted Australian recreation and culture spending at current prices.",
    unit: "AUD millions",
    frequency: "monthly",
    countryCode: "AU",
    sectorSlug: "consumer-spending",
    dataflow: ABS_DATAFLOW,
    dimensions: {
      measure: { code: "7", label: "Household spending" },
      category: { code: "50", label: "Recreation and culture" },
      ...COMMON_DIMENSIONS,
    },
    unitMetadata: ABSOLUTE_UNIT,
  },
  {
    slug: "au-recreation-culture-spending-mom-pct-sa",
    name: "Australian recreation and culture monthly spending change",
    description:
      "Monthly percentage change in seasonally adjusted Australian recreation and culture spending at current prices.",
    unit: "percent",
    frequency: "monthly",
    countryCode: "AU",
    sectorSlug: "consumer-spending",
    dataflow: ABS_DATAFLOW,
    dimensions: {
      measure: {
        code: "8",
        label: "Household spending - Percentage change from previous period",
      },
      category: { code: "50", label: "Recreation and culture" },
      ...COMMON_DIMENSIONS,
    },
    unitMetadata: PERCENT_UNIT,
  },
  {
    slug: "au-discretionary-spending-mom-pct-sa",
    name: "Australian discretionary spending monthly change",
    description:
      "Monthly percentage change in the ABS-defined seasonally adjusted discretionary household spending category at current prices.",
    unit: "percent",
    frequency: "monthly",
    countryCode: "AU",
    sectorSlug: "consumer-spending",
    dataflow: ABS_DATAFLOW,
    dimensions: {
      measure: {
        code: "8",
        label: "Household spending - Percentage change from previous period",
      },
      category: { code: "3", label: "Discretionary" },
      ...COMMON_DIMENSIONS,
    },
    unitMetadata: PERCENT_UNIT,
  },
] as const satisfies readonly AbsMetricDefinition[];

export type AbsMetricSlug = (typeof ABS_METRICS)[number]["slug"];

export function getAbsMetric(slug: string): AbsMetricDefinition | undefined {
  return ABS_METRICS.find((metric) => metric.slug === slug);
}

export function getAbsDataKey(metric: AbsMetricDefinition): string {
  const dimensions = metric.dimensions;
  return [
    dimensions.measure.code,
    dimensions.category.code,
    dimensions.priceAdjustment.code,
    dimensions.adjustmentType.code,
    dimensions.geography.code,
    dimensions.frequency.code,
  ].join(".");
}
