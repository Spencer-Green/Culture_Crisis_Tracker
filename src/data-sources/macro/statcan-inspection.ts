import {
  fetchStatCanCubeMetadata,
  fetchStatCanSeriesInfo,
  fetchStatCanVectorData,
  parseStatCanResponseObject,
  parseStatCanSeriesInfo,
  StatCanResponseError,
  validateStatCanSeriesInfo,
  type StatCanRequestOptions,
} from "@/data-sources/macro/statcan-api";
import {
  STATCAN_CULTURAL_DETAIL_SERIES,
  STATCAN_METRICS,
  STATCAN_TABLE,
} from "@/data-sources/macro/statcan-metrics";
import { formatStatCanQuarter } from "@/data-sources/macro/statcan-period";

type CubeMember = {
  memberId: number;
  parentMemberId: number | null;
  memberNameEn: string;
  terminated: number;
  memberUomCode: number | null;
};

type CubeDimension = {
  dimensionPositionId: number;
  dimensionNameEn: string;
  member: CubeMember[];
};

export type StatCanInspection = {
  productId: number;
  tableNumber: string;
  title: string;
  frequency: string;
  geography: string;
  releaseTime: string;
  firstQuarter: string;
  latestQuarter: string;
  dimensions: { position: number; name: string; members: number }[];
  prices: { id: number; label: string; terminated: boolean }[];
  seasonalAdjustments: { id: number; label: string }[];
  scalar: { code: number; label: string };
  unit: { code: number; label: string };
  metrics: {
    slug: string;
    vectorId: number;
    coordinate: string;
    category: string;
    price: string;
    seasonalAdjustment: string;
    seriesTitle: string;
    firstQuarter: string;
    latestQuarter: string;
  }[];
  culturalDetails: {
    label: string;
    memberId: number;
    coordinate: string;
    vectorId: number;
  }[];
};

function cubeObject(payload: unknown): Record<string, unknown> {
  if (!Array.isArray(payload) || payload.length !== 1) {
    throw new StatCanResponseError(
      "Statistics Canada returned invalid cube metadata.",
    );
  }
  const envelope = payload[0] as Record<string, unknown>;
  if (envelope?.status !== "SUCCESS" || !envelope.object) {
    throw new StatCanResponseError(
      "Statistics Canada cube metadata request failed.",
    );
  }
  return envelope.object as Record<string, unknown>;
}

export async function inspectStatCanTable(
  baseUrl: string,
  options: StatCanRequestOptions = {},
): Promise<StatCanInspection> {
  const metadataResult = await fetchStatCanCubeMetadata(
    baseUrl,
    STATCAN_TABLE.productId,
    options,
  );
  const metadata = cubeObject(metadataResult.payload);
  if (
    Number(metadata.productId) !== STATCAN_TABLE.productId ||
    metadata.cubeTitleEn !== STATCAN_TABLE.title ||
    Number(metadata.frequencyCode) !== 9 ||
    !Array.isArray(metadata.dimension)
  ) {
    throw new StatCanResponseError(
      "Statistics Canada cube metadata no longer matches table 36-10-0124-01.",
    );
  }
  const dimensions = metadata.dimension as CubeDimension[];
  const geography = dimensions.find((item) => item.dimensionPositionId === 1);
  const prices = dimensions.find((item) => item.dimensionPositionId === 2);
  const seasonal = dimensions.find((item) => item.dimensionPositionId === 3);
  const estimates = dimensions.find((item) => item.dimensionPositionId === 4);
  if (!geography || !prices || !seasonal || !estimates) {
    throw new StatCanResponseError(
      "Statistics Canada omitted required cube dimensions.",
    );
  }
  for (const required of [
    "Household final consumption expenditure",
    "Recreation and culture",
    ...STATCAN_CULTURAL_DETAIL_SERIES.map(([label]) => label),
  ]) {
    if (!estimates.member.some((member) => member.memberNameEn === required)) {
      throw new StatCanResponseError(
        `Statistics Canada omitted category ${required}.`,
      );
    }
  }

  const metrics = [];
  for (const metric of STATCAN_METRICS) {
    const result = await fetchStatCanSeriesInfo(
      baseUrl,
      STATCAN_TABLE.productId,
      metric.coordinate,
      options,
    );
    const series = parseStatCanSeriesInfo(result.payload);
    validateStatCanSeriesInfo(series, metric);
    const data = await fetchStatCanVectorData(
      baseUrl,
      metric,
      new Date("1961-01-01T00:00:00.000Z"),
      new Date("9999-12-31T23:59:59.999Z"),
      options,
    );
    const dataObject = parseStatCanResponseObject(data.payload);
    const points = Array.isArray(dataObject.vectorDataPoint)
      ? (dataObject.vectorDataPoint as Record<string, unknown>[]).filter(
          (point) =>
            typeof point.refPer === "string" && typeof point.value === "number",
        )
      : [];
    if (points.length === 0) {
      throw new StatCanResponseError(
        `Statistics Canada returned no observations for ${metric.slug}.`,
      );
    }
    metrics.push({
      slug: metric.slug,
      vectorId: series.vectorId,
      coordinate: series.coordinate,
      category: metric.categoryLabel,
      price: metric.priceLabel,
      seasonalAdjustment: metric.seasonalAdjustment,
      seriesTitle: series.seriesTitle,
      firstQuarter: formatStatCanQuarter(
        new Date(`${points[0].refPer}T00:00:00.000Z`),
      ),
      latestQuarter: formatStatCanQuarter(
        new Date(`${points.at(-1)!.refPer}T00:00:00.000Z`),
      ),
    });
  }

  return {
    productId: STATCAN_TABLE.productId,
    tableNumber: STATCAN_TABLE.tableNumber,
    title: String(metadata.cubeTitleEn),
    frequency: STATCAN_TABLE.frequencyLabel,
    geography: geography.member[0]?.memberNameEn ?? "Unknown",
    releaseTime: String(metadata.releaseTime),
    firstQuarter: metrics
      .map((metric) => metric.firstQuarter)
      .sort()
      .at(-1)!,
    latestQuarter: metrics
      .map((metric) => metric.latestQuarter)
      .sort()
      .at(0)!,
    dimensions: dimensions.map((dimension) => ({
      position: dimension.dimensionPositionId,
      name: dimension.dimensionNameEn,
      members: dimension.member.length,
    })),
    prices: prices.member.map((member) => ({
      id: member.memberId,
      label: member.memberNameEn,
      terminated: member.terminated === 1,
    })),
    seasonalAdjustments: seasonal.member.map((member) => ({
      id: member.memberId,
      label: member.memberNameEn,
    })),
    scalar: { code: 6, label: "millions" },
    unit: { code: 81, label: "Dollars" },
    metrics,
    culturalDetails: STATCAN_CULTURAL_DETAIL_SERIES.map(
      ([label, memberId, vectorId]) => ({
        label,
        memberId,
        coordinate: `1.1.1.${memberId}.0.0.0.0.0.0`,
        vectorId,
      }),
    ),
  };
}
