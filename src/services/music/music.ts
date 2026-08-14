import "server-only";

import { cache } from "react";

import { Prisma } from "@/generated/prisma/client";
import { BEA_MUSIC_METRICS } from "@/data-sources/macro/bea-metrics";
import type { MVTUnprofitabilityDefinition } from "@/data-sources/music/mvt-types";
import { getPrisma } from "@/lib/prisma";
import { buildMVTAnalytics } from "@/services/music/mvt-analytics";
import { buildBeaMusicAnalytics } from "@/services/music/bea-music-analytics";
import { buildCensusRecordIndustryAnalytics } from "@/services/music/census-aies-analytics";
import { buildBEAACPSAAnalytics } from "@/services/music/bea-acpsa-analytics";

const DATABASE_UNAVAILABLE_CODES = new Set([
  "P1000",
  "P1001",
  "P1002",
  "P1003",
  "P1008",
  "P1010",
  "P1011",
  "P1017",
]);

function isDatabaseUnavailable(error: unknown) {
  return (
    error instanceof Prisma.PrismaClientInitializationError ||
    (error instanceof Prisma.PrismaClientKnownRequestError &&
      DATABASE_UNAVAILABLE_CODES.has(error.code))
  );
}

export const getMusicSectorData = cache(async () => {
  try {
    const [records, definitions, censusRecords, acpsaRecords] =
      await Promise.all([
        getPrisma().mVTGrassrootsMusicYear.findMany({
          orderBy: { year: "asc" },
          select: {
            year: true,
            venueCount: true,
            permanentClosures: true,
            venuesNoLongerOperating: true,
            venuesUnprofitablePct: true,
            averageProfitMarginPct: true,
            eventCount: true,
            ticketedLiveMusicEvents: true,
            audienceVisits: true,
            totalSectorRevenueGbp: true,
            liveMusicIncomeGbp: true,
            employment: true,
            jobsLost: true,
            townsWithoutRegularTouring: true,
            retrievedAt: true,
            sourcePublishedAt: true,
            metadata: true,
          },
        }),
        getPrisma().metricDefinition.findMany({
          where: {
            slug: { in: BEA_MUSIC_METRICS.map((metric) => metric.slug) },
            source: { slug: "bea" },
          },
          select: {
            slug: true,
            name: true,
            unit: true,
            frequency: true,
            countryCode: true,
            source: { select: { slug: true } },
            observations: {
              orderBy: { periodStart: "asc" },
              select: {
                periodStart: true,
                periodEnd: true,
                value: true,
                retrievedAt: true,
              },
            },
          },
        }),
        getPrisma().censusRecordIndustryYear.findMany({
          where: { naicsCode: "512250", source: { slug: "census" } },
          orderBy: { year: "asc" },
          select: {
            year: true,
            naicsCode: true,
            industryLabel: true,
            revenueUsd: true,
            payrollUsd: true,
            employment: true,
            operatingExpensesUsd: true,
            sourceVintage: true,
            retrievedAt: true,
          },
        }),
        getPrisma().bEAACPSASoundRecordingYear.findMany({
          where: { source: { slug: "bea" } },
          orderBy: { year: "asc" },
          select: {
            year: true,
            categoryLabel: true,
            acpsaOutputUsd: true,
            acpsaValueAddedUsd: true,
            acpsaEmployment: true,
            acpsaEmployeeCompensationUsd: true,
          },
        }),
      ]);
    const analytics = buildMVTAnalytics(
      records.map((record) => {
        const metadata = record.metadata as Record<string, unknown>;
        return {
          ...record,
          venuesUnprofitablePct:
            record.venuesUnprofitablePct?.toNumber() ?? null,
          averageProfitMarginPct:
            record.averageProfitMarginPct?.toNumber() ?? null,
          totalSectorRevenueGbp:
            record.totalSectorRevenueGbp?.toNumber() ?? null,
          liveMusicIncomeGbp: record.liveMusicIncomeGbp?.toNumber() ?? null,
          unprofitabilityDefinition:
            (metadata.unprofitabilityDefinition as MVTUnprofitabilityDefinition | null) ??
            null,
        };
      }),
    );
    return {
      databaseStatus: "available" as const,
      analytics,
      beaDemand: buildBeaMusicAnalytics(
        definitions.flatMap((definition) =>
          definition.observations.map((observation) => ({
            sourceSlug: definition.source.slug,
            countryCode: definition.countryCode,
            metricSlug: definition.slug,
            metricName: definition.name,
            unit: definition.unit,
            frequency: definition.frequency,
            periodStart: observation.periodStart.toISOString(),
            periodEnd: observation.periodEnd.toISOString(),
            value: observation.value.toString(),
            retrievedAt: observation.retrievedAt.toISOString(),
          })),
        ),
      ),
      censusIndustry: buildCensusRecordIndustryAnalytics(
        censusRecords.map((record) => ({
          ...record,
          revenueUsd: record.revenueUsd?.toNumber() ?? null,
          payrollUsd: record.payrollUsd?.toNumber() ?? null,
          operatingExpensesUsd: record.operatingExpensesUsd?.toNumber() ?? null,
        })),
      ),
      acpsaStructure: buildBEAACPSAAnalytics(
        acpsaRecords.map((record) => ({
          ...record,
          acpsaOutputUsd: record.acpsaOutputUsd?.toNumber() ?? null,
          acpsaValueAddedUsd: record.acpsaValueAddedUsd?.toNumber() ?? null,
          acpsaEmployeeCompensationUsd:
            record.acpsaEmployeeCompensationUsd?.toNumber() ?? null,
        })),
      ),
      retrievedAt: records.at(-1)?.retrievedAt ?? null,
      publishedAt: records.at(-1)?.sourcePublishedAt ?? null,
    };
  } catch (error) {
    if (isDatabaseUnavailable(error))
      return {
        databaseStatus: "unavailable" as const,
        analytics: null,
        beaDemand: null,
        censusIndustry: null,
        acpsaStructure: null,
        retrievedAt: null,
        publishedAt: null,
      };
    throw error;
  }
});
