import "server-only";

import { getSourceDefinition } from "@/data-sources/catalog";
import { inspectLPA } from "@/data-sources/theatre/lpa-api";
import { lpaAdapter } from "@/data-sources/theatre/lpa";
import { env } from "@/lib/env";
import { getPrisma } from "@/lib/prisma";
import {
  IngestionPolicyError,
  sanitiseIngestionError,
} from "@/services/ingestion/service-core";
import {
  classifyLPAUpserts,
  lpaRecordIdentity,
} from "@/services/theatre/lpa-ingestion-core";

export async function inspectLPAPerformance() {
  return inspectLPA(env.LPA_BASE_URL);
}

export async function ingestLPA(since?: number) {
  if (since !== undefined && (!Number.isInteger(since) || since < 2004))
    throw new IngestionPolicyError("LPA --since must be a year from 2004.");
  const prisma = getPrisma();
  const definition = getSourceDefinition("lpa");
  const source = await prisma.dataSource.findUnique({
    where: { slug: "lpa" },
    select: { id: true, enabled: true },
  });
  if (!source)
    throw new IngestionPolicyError(
      'Source "lpa" is not present. Run the seed first.',
    );
  if (definition.implementationStatus !== "implemented")
    throw new IngestionPolicyError('Source "lpa" is not implemented.');
  if (!lpaAdapter.isConfigured())
    throw new IngestionPolicyError('Source "lpa" is not configured.');
  if (!source.enabled)
    throw new IngestionPolicyError('Source "lpa" is disabled.');

  const startedAt = new Date();
  const run = await prisma.ingestionRun.create({
    data: {
      sourceId: source.id,
      status: "running",
      startedAt,
      metadata: { scope: "australian-theatre-market", since: since ?? null },
    },
    select: { id: true },
  });
  try {
    await prisma.dataSource.update({
      where: { id: source.id },
      data: { lastAttemptedSyncAt: startedAt },
    });
    const inspection = await inspectLPAPerformance();
    const records = inspection.records.filter(
      (record) => since === undefined || record.year >= since,
    );
    const existing = await prisma.lPAPerformanceMarketYear.findMany({
      where: {
        sourceId: source.id,
        year: { in: [...new Set(records.map((record) => record.year))] },
      },
      select: { year: true, category: true, geographyScope: true },
    });
    const existingIdentities = new Set(existing.map(lpaRecordIdentity));
    const retrievedAt = new Date();
    await prisma.$transaction(async (transaction) => {
      for (const record of records) {
        const values = {
          categoryLabel: record.categoryLabel,
          revenueAud: record.revenueAud,
          attendance: record.attendance,
          averageTicketPriceAud: record.averageTicketPriceAud,
          sourceReportTitle: record.sourceReportTitle,
          sourceReportUrl: record.sourceReportUrl,
          sourceBundleUrl: record.sourceBundleUrl,
          sourcePublishedAt: record.sourcePublishedAt,
          retrievedAt,
          lastSeenAt: retrievedAt,
          metadata: {
            accessClassification: inspection.accessClassification,
            sourceUnits: inspection.units,
            comparabilityNotes: inspection.comparabilityNotes,
            reportYear: inspection.report.reportYear,
            annualFrequency: true,
            nominalRevenue: true,
            paidAttendanceAvailable: false,
            eventCountAvailable: false,
          },
        };
        await transaction.lPAPerformanceMarketYear.upsert({
          where: {
            sourceId_year_category_geographyScope: {
              sourceId: source.id,
              year: record.year,
              category: record.category,
              geographyScope: record.geographyScope,
            },
          },
          update: values,
          create: {
            sourceId: source.id,
            year: record.year,
            category: record.category,
            geographyScope: record.geographyScope,
            firstSeenAt: retrievedAt,
            ...values,
          },
        });
      }
    });
    const completedAt = new Date();
    const { created, updated } = classifyLPAUpserts(
      records,
      existingIdentities,
    );
    const missingValues = records.reduce(
      (sum, record) =>
        sum +
        [record.revenueAud, record.attendance].filter((value) => value === null)
          .length,
      0,
    );
    await prisma.$transaction([
      prisma.ingestionRun.update({
        where: { id: run.id },
        data: {
          status: "succeeded",
          completedAt,
          recordsRead: records.length,
          recordsCreated: created,
          recordsUpdated: updated,
          metadata: {
            scope: "australian-theatre-market",
            reportYear: inspection.report.reportYear,
            years: [...new Set(records.map((record) => record.year))],
            categories: inspection.categories,
            missingYears: inspection.missingYears,
            missingValues,
            requestCount: inspection.requestCount,
          },
        },
      }),
      prisma.dataSource.update({
        where: { id: source.id },
        data: { lastSuccessfulSyncAt: completedAt },
      }),
    ]);
    return {
      reportYear: inspection.report.reportYear,
      reportTitle: inspection.report.title,
      reportUrl: inspection.report.reportUrl,
      requestCount: inspection.requestCount,
      years: [...new Set(records.map((record) => record.year))],
      recordsRead: records.length,
      recordsCreated: created,
      recordsUpdated: updated,
      missingYears: inspection.missingYears,
      missingValues,
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
