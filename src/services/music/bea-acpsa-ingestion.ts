import "server-only";

import { getSourceDefinition } from "@/data-sources/catalog";
import { inspectBEAACPSA } from "@/data-sources/music/bea-acpsa-api";
import { BEA_ACPSA_SOURCE_STATUS } from "@/data-sources/music/bea-acpsa-types";
import { getPrisma } from "@/lib/prisma";
import {
  IngestionPolicyError,
  sanitiseIngestionError,
} from "@/services/ingestion/service-core";
import { classifyBEAACPSAUpserts } from "@/services/music/bea-acpsa-ingestion-core";

export async function inspectBEAACPSAMusic() {
  return inspectBEAACPSA();
}

export async function ingestBEAACPSAMusic() {
  const prisma = getPrisma();
  const definition = getSourceDefinition("bea");
  const source = await prisma.dataSource.findUnique({
    where: { slug: "bea" },
    select: { id: true, enabled: true },
  });
  if (!source)
    throw new IngestionPolicyError(
      'Source "bea" is not present. Run the seed first.',
    );
  if (definition.implementationStatus !== "implemented")
    throw new IngestionPolicyError('Source "bea" is not implemented.');
  if (!source.enabled)
    throw new IngestionPolicyError('Source "bea" is disabled.');

  const startedAt = new Date();
  const run = await prisma.ingestionRun.create({
    data: {
      sourceId: source.id,
      status: "running",
      startedAt,
      metadata: {
        scope: "acpsa-sound-recording",
        role: BEA_ACPSA_SOURCE_STATUS.role,
      },
    },
    select: { id: true },
  });
  try {
    await prisma.dataSource.update({
      where: { id: source.id },
      data: { lastAttemptedSyncAt: startedAt },
    });
    const inspection = await inspectBEAACPSAMusic();
    const existingYears = new Set(
      (
        await prisma.bEAACPSASoundRecordingYear.findMany({
          where: {
            sourceId: source.id,
            year: { in: inspection.records.map((record) => record.year) },
          },
          select: { year: true },
        })
      ).map((record) => record.year),
    );
    const retrievedAt = new Date();
    await prisma.$transaction(async (transaction) => {
      for (const record of inspection.records) {
        const values = {
          categoryLabel: record.categoryLabel,
          acpsaOutputUsd: record.acpsaOutputUsd,
          acpsaValueAddedUsd: record.acpsaValueAddedUsd,
          acpsaEmployment: record.acpsaEmployment,
          acpsaEmployeeCompensationUsd: record.acpsaEmployeeCompensationUsd,
          sourceArchiveUrl: record.sourceArchiveUrl,
          sourceWorkbook: record.sourceWorkbook,
          sourceTables: record.sourceTables,
          unitMetadata: record.unitMetadata,
          retrievedAt,
          lastSeenAt: retrievedAt,
          metadata: {
            provider: "U.S. Bureau of Economic Analysis",
            account: "Arts and Cultural Production Satellite Account",
            role: BEA_ACPSA_SOURCE_STATUS.role,
            latestOfficialYear: BEA_ACPSA_SOURCE_STATUS.latestOfficialYear,
            regularlyProduced: BEA_ACPSA_SOURCE_STATUS.regularlyProduced,
            discontinuationNote: BEA_ACPSA_SOURCE_STATUS.discontinuationNote,
            categorySemantics:
              "ACPSA industry contribution for Sound Recording",
            excludedTables: inspection.ignoredStructuredFiles,
          },
        };
        await transaction.bEAACPSASoundRecordingYear.upsert({
          where: { sourceId_year: { sourceId: source.id, year: record.year } },
          update: values,
          create: {
            sourceId: source.id,
            year: record.year,
            firstSeenAt: retrievedAt,
            ...values,
          },
        });
      }
    });
    const completedAt = new Date();
    const { created, updated } = classifyBEAACPSAUpserts(
      inspection.records,
      existingYears,
    );
    const missingObservations = inspection.records.reduce(
      (sum, record) =>
        sum +
        [
          record.acpsaOutputUsd,
          record.acpsaValueAddedUsd,
          record.acpsaEmployment,
          record.acpsaEmployeeCompensationUsd,
        ].filter((value) => value === null).length,
      0,
    );
    await prisma.$transaction([
      prisma.ingestionRun.update({
        where: { id: run.id },
        data: {
          status: "succeeded",
          completedAt,
          recordsRead: inspection.rowsRead,
          recordsCreated: created,
          recordsUpdated: updated,
          metadata: {
            scope: "acpsa-sound-recording",
            annualWorkbooks: inspection.annualWorkbookCount,
            years: inspection.records.map((record) => record.year),
            missingYears: inspection.missingYears,
            missingObservations,
            role: BEA_ACPSA_SOURCE_STATUS.role,
          },
        },
      }),
      prisma.dataSource.update({
        where: { id: source.id },
        data: { lastSuccessfulSyncAt: completedAt },
      }),
    ]);
    return {
      archiveUrl: inspection.archiveUrl,
      workbooksRead: inspection.annualWorkbookCount,
      rowsRead: inspection.rowsRead,
      years: inspection.records.map((record) => record.year),
      recordsCreated: created,
      recordsUpdated: updated,
      missingYears: inspection.missingYears,
      missingObservations,
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
