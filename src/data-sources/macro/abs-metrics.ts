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

export const ABS_QUARTERLY_DATAFLOW = {
  agency: "ABS",
  id: "HSI_Q",
  version: "1.2.0",
  label: "Quarterly Household Spending Indicator",
  dimensionOrder: [
    "MEASURE",
    "CATEGORY",
    "PRICE_ADJUSTMENT",
    "TSEST",
    "STATE",
    "FREQ",
  ],
  firstAvailablePeriod: "2014-Q3",
} as const;

export type AbsDataflowDefinition =
  typeof ABS_DATAFLOW | typeof ABS_QUARTERLY_DATAFLOW;

type DimensionCode = {
  code: string;
  label: string;
};

export type AbsMetricDefinition = AvailableMetric & {
  countryCode: "AU";
  sectorSlug: "consumer-spending";
  dataflow: AbsDataflowDefinition;
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

const QUARTERLY_REAL_DIMENSIONS = {
  priceAdjustment: { code: "CVM", label: "Chain Volume Measures" },
  adjustmentType: { code: "20", label: "Seasonally Adjusted" },
  geography: { code: "AUS", label: "Australia" },
  frequency: { code: "Q", label: "Quarterly" },
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
  {
    slug: "au-household-spending-total-real",
    name: "Australian total household spending, chain volume measures",
    description:
      "Quarterly seasonally adjusted Australian household spending using official ABS chain volume measures.",
    unit: "AUD millions, Chain Volume Measures",
    frequency: "quarterly",
    countryCode: "AU",
    sectorSlug: "consumer-spending",
    dataflow: ABS_QUARTERLY_DATAFLOW,
    dimensions: {
      measure: { code: "7", label: "Household spending" },
      category: { code: "TOT", label: "Total" },
      ...QUARTERLY_REAL_DIMENSIONS,
    },
    unitMetadata: ABSOLUTE_UNIT,
  },
  {
    slug: "au-recreation-culture-spending-real",
    name: "Australian recreation and culture spending, chain volume measures",
    description:
      "Quarterly seasonally adjusted Australian recreation and culture spending using official ABS chain volume measures.",
    unit: "AUD millions, Chain Volume Measures",
    frequency: "quarterly",
    countryCode: "AU",
    sectorSlug: "consumer-spending",
    dataflow: ABS_QUARTERLY_DATAFLOW,
    dimensions: {
      measure: { code: "7", label: "Household spending" },
      category: { code: "50", label: "Recreation and culture" },
      ...QUARTERLY_REAL_DIMENSIONS,
    },
    unitMetadata: ABSOLUTE_UNIT,
  },
] as const satisfies readonly AbsMetricDefinition[];

export const ABS_MONTHLY_METRICS = ABS_METRICS.filter(
  (metric) => metric.frequency === "monthly",
);

export const ABS_REAL_METRICS = ABS_METRICS.filter(
  (metric) => metric.dataflow.id === ABS_QUARTERLY_DATAFLOW.id,
);

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
