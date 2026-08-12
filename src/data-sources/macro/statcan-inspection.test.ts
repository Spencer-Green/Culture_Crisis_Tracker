import { describe, expect, it, vi } from "vitest";

import { inspectStatCanTable } from "@/data-sources/macro/statcan-inspection";
import {
  STATCAN_CULTURAL_DETAIL_SERIES,
  STATCAN_METRICS,
  STATCAN_TABLE,
} from "@/data-sources/macro/statcan-metrics";

function envelope(object: Record<string, unknown>) {
  return [{ status: "SUCCESS", object }];
}

describe("Statistics Canada inspection", () => {
  it("validates cube metadata, headline mappings, release, and live ranges", async () => {
    const fetchImplementation = vi.fn<typeof fetch>(async (input, init) => {
      const url = new URL(String(input));
      if (url.pathname.endsWith("getCubeMetadata")) {
        return Response.json(
          envelope({
            productId: 36100124,
            cubeTitleEn: STATCAN_TABLE.title,
            frequencyCode: 9,
            releaseTime: "2026-05-29T08:30",
            dimension: [
              {
                dimensionPositionId: 1,
                dimensionNameEn: "Geography",
                member: [
                  {
                    memberId: 1,
                    parentMemberId: null,
                    memberNameEn: "Canada",
                    terminated: 0,
                    memberUomCode: null,
                  },
                ],
              },
              {
                dimensionPositionId: 2,
                dimensionNameEn: "Prices",
                member: [
                  {
                    memberId: 1,
                    parentMemberId: null,
                    memberNameEn: "Current prices",
                    terminated: 0,
                    memberUomCode: null,
                  },
                  {
                    memberId: 2,
                    parentMemberId: null,
                    memberNameEn: "2017 constant prices",
                    terminated: 0,
                    memberUomCode: null,
                  },
                ],
              },
              {
                dimensionPositionId: 3,
                dimensionNameEn: "Seasonal adjustment",
                member: [
                  {
                    memberId: 1,
                    parentMemberId: null,
                    memberNameEn: "Seasonally adjusted at quarterly rates",
                    terminated: 0,
                    memberUomCode: null,
                  },
                ],
              },
              {
                dimensionPositionId: 4,
                dimensionNameEn: "Estimates",
                member: [
                  "Household final consumption expenditure",
                  "Recreation and culture",
                  ...STATCAN_CULTURAL_DETAIL_SERIES.map(([label]) => label),
                ].map((memberNameEn, index) => ({
                  memberId: index + 1,
                  parentMemberId: null,
                  memberNameEn,
                  terminated: 0,
                  memberUomCode: 81,
                })),
              },
            ],
          }),
        );
      }
      const body = init?.body ? JSON.parse(String(init.body)) : null;
      if (url.pathname.endsWith("getSeriesInfoFromCubePidCoord")) {
        const coordinate = body[0].coordinate;
        const metric = STATCAN_METRICS.find(
          (candidate) => candidate.coordinate === coordinate,
        )!;
        return Response.json(
          envelope({
            productId: 36100124,
            coordinate,
            vectorId: metric.vectorId,
            frequencyCode: 9,
            scalarFactorCode: 6,
            decimals: 0,
            terminated: 0,
            SeriesTitleEn: [
              "Canada",
              metric.priceLabel,
              metric.seasonalAdjustment,
              metric.categoryLabel,
            ].join(";"),
            memberUomCode: 81,
          }),
        );
      }
      const vectorId = Number(
        url.searchParams.get("vectorIds")?.replaceAll('"', ""),
      );
      const metric = STATCAN_METRICS.find(
        (candidate) => candidate.vectorId === vectorId,
      )!;
      return Response.json(
        envelope({
          productId: 36100124,
          coordinate: metric.coordinate,
          vectorId,
          vectorDataPoint: [
            { refPer: "1981-01-01", value: 1 },
            { refPer: "2026-01-01", value: 2 },
          ],
        }),
      );
    });

    const inspection = await inspectStatCanTable(
      "https://www150.statcan.gc.ca/t1/wds",
      { fetchImplementation },
    );

    expect(inspection).toMatchObject({
      productId: 36100124,
      tableNumber: "36-10-0124-01",
      title: STATCAN_TABLE.title,
      frequency: "Quarterly",
      geography: "Canada",
      releaseTime: "2026-05-29T08:30",
      firstQuarter: "1981-Q1",
      latestQuarter: "2026-Q1",
      scalar: { code: 6, label: "millions" },
      unit: { code: 81, label: "Dollars" },
    });
    expect(inspection.metrics).toHaveLength(4);
    expect(inspection.culturalDetails).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ label: "Cinemas", vectorId: 62700530 }),
        expect.objectContaining({
          label: "Other cultural services",
          vectorId: 62700532,
        }),
      ]),
    );
  });
});
