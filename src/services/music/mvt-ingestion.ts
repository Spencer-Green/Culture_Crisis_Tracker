import "server-only";

import { getSourceDefinition } from "@/data-sources/catalog";
import { inspectMVTReport } from "@/data-sources/music/mvt-api";
import { mvtAdapter } from "@/data-sources/music/mvt";
import { getMVTReports } from "@/data-sources/music/mvt-reports";
import type { MVTGrassrootsYearRecord } from "@/data-sources/music/mvt-types";
import { getPrisma } from "@/lib/prisma";
import {
  IngestionPolicyError,
  sanitiseIngestionError,
} from "@/services/ingestion/service-core";
import { classifyMVTUpserts } from "@/services/music/mvt-ingestion-core";

function availableFields(report: MVTGrassrootsYearRecord) {
  return Object.entries(report)
    .filter(
      ([key, value]) =>
        ![
          "year",
          "sourceReportUrl",
          "sourceReleaseUrl",
          "sourcePublishedAt",
          "notes",
          "unprofitabilityDefinition",
        ].includes(key) && value !== null,
    )
    .map(([key]) => key);
}

export async function inspectMVT(year?: number) {
  const reports = getMVTReports(year);
  if (reports.length === 0)
    throw new IngestionPolicyError(
      "No matching MVT annual report is registered.",
    );
  const inspections = [];
  for (const report of reports) {
    inspections.push(
      await inspectMVTReport(
        {
          year: report.year,
          url: report.sourceReportUrl,
          fields: availableFields(report),
        },
        { timeoutMs: 20_000 },
      ),
    );
  }
  return { reports, inspections };
}

export async function ingestMVT(year?: number) {
  const prisma = getPrisma();
  const definition = getSourceDefinition("mvt");
  const source = await prisma.dataSource.findUnique({
    where: { slug: "mvt" },
    select: { id: true, enabled: true },
  });
  if (!source)
    throw new IngestionPolicyError(
      'Source "mvt" is not present. Run the seed first.',
    );
  if (definition.implementationStatus !== "implemented")
    throw new IngestionPolicyError('Source "mvt" is not implemented.');
  if (!mvtAdapter.isConfigured())
    throw new IngestionPolicyError('Source "mvt" is not configured.');
  if (!source.enabled)
    throw new IngestionPolicyError('Source "mvt" is disabled.');
  const reports = getMVTReports(year);
  if (reports.length === 0)
    throw new IngestionPolicyError(
      "No matching MVT annual report is registered.",
    );

  const startedAt = new Date();
  const run = await prisma.ingestionRun.create({
    data: {
      sourceId: source.id,
      status: "running",
      startedAt,
      metadata: {
        year: year ?? null,
        extraction: "versioned official-report mapping; no live PDF bypass",
      },
    },
    select: { id: true },
  });
  try {
    await prisma.dataSource.update({
      where: { id: source.id },
      data: { lastAttemptedSyncAt: startedAt },
    });
    const existing = new Set(
      (
        await prisma.mVTGrassrootsMusicYear.findMany({
          where: {
            sourceId: source.id,
            year: { in: reports.map((report) => report.year) },
          },
          select: { year: true },
        })
      ).map((record) => record.year),
    );
    const retrievedAt = new Date();
    await prisma.$transaction(async (transaction) => {
      for (const report of reports) {
        const values = {
          venueCount: report.venueCount,
          permanentClosures: report.permanentClosures,
          venuesNoLongerOperating: report.venuesNoLongerOperating,
          venuesUnprofitablePct: report.venuesUnprofitablePct,
          averageProfitMarginPct: report.averageProfitMarginPct,
          eventCount: report.eventCount,
          ticketedLiveMusicEvents: report.ticketedLiveMusicEvents,
          audienceVisits: report.audienceVisits,
          totalSectorRevenueGbp: report.totalSectorRevenueGbp,
          liveMusicIncomeGbp: report.liveMusicIncomeGbp,
          employment: report.employment,
          jobsLost: report.jobsLost,
          townsWithoutRegularTouring: report.townsWithoutRegularTouring,
          sourceReportUrl: report.sourceReportUrl,
          sourceReleaseUrl: report.sourceReleaseUrl,
          sourcePublishedAt: report.sourcePublishedAt,
          retrievedAt,
          lastSeenAt: retrievedAt,
          metadata: {
            provider: "Music Venue Trust",
            scope:
              "UK grassroots music venues represented by the Music Venues Alliance",
            extraction: "versioned manual mapping from official annual report",
            unprofitabilityDefinition: report.unprofitabilityDefinition,
            notes: report.notes,
          },
        };
        await transaction.mVTGrassrootsMusicYear.upsert({
          where: { sourceId_year: { sourceId: source.id, year: report.year } },
          update: values,
          create: {
            sourceId: source.id,
            year: report.year,
            firstSeenAt: retrievedAt,
            ...values,
          },
        });
      }
    });
    const completedAt = new Date();
    const { created, updated } = classifyMVTUpserts(reports, existing);
    await prisma.$transaction([
      prisma.ingestionRun.update({
        where: { id: run.id },
        data: {
          status: "succeeded",
          completedAt,
          recordsRead: reports.length,
          recordsCreated: created,
          recordsUpdated: updated,
          metadata: {
            year: year ?? null,
            reportYears: reports.map((report) => report.year),
            extraction: "versioned official-report mapping; no live PDF bypass",
          },
        },
      }),
      prisma.dataSource.update({
        where: { id: source.id },
        data: { lastSuccessfulSyncAt: completedAt },
      }),
    ]);
    return {
      years: reports.map((report) => report.year),
      recordsRead: reports.length,
      recordsCreated: created,
      recordsUpdated: updated,
      durationMs: completedAt.getTime() - startedAt.getTime(),
    };
  } catch (error) {
    const completedAt = new Date();
    await prisma.ingestionRun.update({
      where: { id: run.id },
      data: {
        status: "failed",
        completedAt,
        errorMessage: sanitiseIngestionError(error),
      },
    });
    throw error;
  }
}
