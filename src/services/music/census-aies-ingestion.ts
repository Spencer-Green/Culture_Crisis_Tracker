import "server-only";

import { getSourceDefinition } from "@/data-sources/catalog";
import { inspectCensusAies } from "@/data-sources/music/census-aies-api";
import { censusAdapter } from "@/data-sources/music/census";
import { env } from "@/lib/env";
import { getPrisma } from "@/lib/prisma";
import {
  IngestionPolicyError,
  sanitiseIngestionError,
} from "@/services/ingestion/service-core";
import { classifyCensusAiesUpserts } from "@/services/music/census-aies-ingestion-core";

export async function inspectCensusMusic() {
  if (!env.CENSUS_BASE_URL)
    throw new IngestionPolicyError("CENSUS_BASE_URL is not configured.");
  return inspectCensusAies(env.CENSUS_BASE_URL);
}

export async function ingestCensusMusic() {
  const prisma = getPrisma();
  const definition = getSourceDefinition("census");
  const source = await prisma.dataSource.findUnique({
    where: { slug: "census" },
    select: { id: true, enabled: true },
  });
  if (!source)
    throw new IngestionPolicyError(
      'Source "census" is not present. Run the seed first.',
    );
  if (definition.implementationStatus !== "implemented")
    throw new IngestionPolicyError('Source "census" is not implemented.');
  if (!censusAdapter.isConfigured())
    throw new IngestionPolicyError('Source "census" is not configured.');
  if (!source.enabled)
    throw new IngestionPolicyError('Source "census" is disabled.');

  const startedAt = new Date();
  const run = await prisma.ingestionRun.create({
    data: {
      sourceId: source.id,
      status: "running",
      startedAt,
      metadata: {
        naicsCode: "512250",
        scope: "AIES employer firms; national all-establishment rows",
      },
    },
    select: { id: true },
  });
  try {
    await prisma.dataSource.update({
      where: { id: source.id },
      data: { lastAttemptedSyncAt: startedAt },
    });
    const inspection = await inspectCensusMusic();
    const existing = new Set(
      (
        await prisma.censusRecordIndustryYear.findMany({
          where: {
            sourceId: source.id,
            OR: inspection.records.map((record) => ({
              year: record.year,
              naicsCode: record.naicsCode,
              sourceVintage: record.sourceVintage,
            })),
          },
          select: { year: true, naicsCode: true, sourceVintage: true },
        })
      ).map(
        (record) =>
          `${record.year}:${record.naicsCode}:${record.sourceVintage}`,
      ),
    );
    const retrievedAt = new Date();
    await prisma.$transaction(async (transaction) => {
      for (const record of inspection.records) {
        const values = {
          industryLabel: record.industryLabel,
          revenueUsd: record.revenueUsd,
          payrollUsd: record.payrollUsd,
          employment: record.employment,
          operatingExpensesUsd: record.operatingExpensesUsd,
          revenueFlag: record.revenueFlag,
          payrollFlag: record.payrollFlag,
          employmentFlag: record.employmentFlag,
          operatingExpensesFlag: record.operatingExpensesFlag,
          revenueCvPct: record.revenueCvPct,
          payrollCvPct: record.payrollCvPct,
          employmentCvPct: record.employmentCvPct,
          operatingExpensesCvPct: record.operatingExpensesCvPct,
          sourceTable: record.sourceTable,
          retrievedAt,
          lastSeenAt: retrievedAt,
          metadata: {
            provider: "U.S. Census Bureau",
            survey: "Annual Integrated Economic Survey",
            geography: "United States",
            employerScope: record.employerScope,
            sourceUnits: "USD thousands; employment count",
            sourceUrls: record.sourceUrls,
            suppressionPolicy:
              "Suppressed or unavailable values are null, never zero",
          },
        };
        await transaction.censusRecordIndustryYear.upsert({
          where: {
            sourceId_year_naicsCode_sourceVintage: {
              sourceId: source.id,
              year: record.year,
              naicsCode: record.naicsCode,
              sourceVintage: record.sourceVintage,
            },
          },
          update: values,
          create: {
            sourceId: source.id,
            year: record.year,
            naicsCode: record.naicsCode,
            sourceVintage: record.sourceVintage,
            firstSeenAt: retrievedAt,
            ...values,
          },
        });
      }
    });
    const completedAt = new Date();
    const { created, updated } = classifyCensusAiesUpserts(
      inspection.records,
      existing,
    );
    const recordsRead = inspection.files.reduce(
      (sum, file) => sum + file.rowsRead,
      0,
    );
    await prisma.$transaction([
      prisma.ingestionRun.update({
        where: { id: run.id },
        data: {
          status: "succeeded",
          completedAt,
          recordsRead,
          recordsCreated: created,
          recordsUpdated: updated,
          metadata: {
            naicsCode: "512250",
            matchingRows: inspection.records.length,
            tables: inspection.files.map((file) => file.table),
            years: inspection.records.map((record) => record.year),
          },
        },
      }),
      prisma.dataSource.update({
        where: { id: source.id },
        data: { lastSuccessfulSyncAt: completedAt },
      }),
    ]);
    return {
      files: inspection.files,
      years: inspection.records.map((record) => record.year),
      recordsRead,
      matchingRows: inspection.records.length,
      recordsCreated: created,
      recordsUpdated: updated,
      suppressedFields: inspection.records.reduce(
        (sum, record) =>
          sum +
          [
            record.revenueUsd,
            record.payrollUsd,
            record.employment,
            record.operatingExpensesUsd,
          ].filter((value) => value === null).length,
        0,
      ),
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
