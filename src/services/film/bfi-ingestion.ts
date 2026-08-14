import "server-only";

import { createHash } from "node:crypto";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { Prisma } from "@/generated/prisma/client";
import { getSourceDefinition } from "@/data-sources/catalog";
import {
  buildBFIWeeklyIndexUrl,
  downloadBFIFile,
  fetchBFIIndexDownloads,
} from "@/data-sources/film/bfi-api";
import { bfiAdapter } from "@/data-sources/film/bfi";
import {
  canonicaliseBFIWeekends,
  parseBFIStructuralWorkbooks,
  parseBFIWeekendWorkbook,
} from "@/data-sources/film/bfi-parser";
import {
  BFI_YEARBOOK_PAGE,
  type BFIDownload,
  type BFIFilmMarketYearRecord,
  type BFIWeekendRecord,
} from "@/data-sources/film/bfi-types";
import { env } from "@/lib/env";
import { getPrisma } from "@/lib/prisma";
import {
  IngestionExecutionError,
  IngestionPolicyError,
  sanitiseIngestionError,
} from "@/services/ingestion/service-core";

const CACHE_DIR = join(tmpdir(), "culture-crisis-tracker-bfi");

async function cachedDownload(download: BFIDownload): Promise<Uint8Array> {
  await mkdir(CACHE_DIR, { recursive: true });
  const name = `${createHash("sha256").update(download.url).digest("hex")}.${download.format}`;
  const path = join(CACHE_DIR, name);
  try {
    return new Uint8Array(await readFile(path));
  } catch {
    const result = await downloadBFIFile(download.url);
    await writeFile(path, result.bytes);
    return result.bytes;
  }
}

function isWeekly(download: BFIDownload) {
  return (
    /weekend box office report/i.test(download.name) ||
    /weekend-box-office-report/i.test(download.fileName)
  );
}

async function discoverWeekly(
  baseUrl: string,
  sinceYear: number,
  throughYear: number,
) {
  const downloads: BFIDownload[] = [];
  const yearlyCoverage: { year: number; reports: number; formats: string[] }[] =
    [];
  for (let year = sinceYear; year <= throughYear; year += 1) {
    const indexUrl = buildBFIWeeklyIndexUrl(baseUrl, year);
    const discovered = await fetchBFIIndexDownloads(indexUrl);
    const reports = discovered.downloads.filter(isWeekly);
    downloads.push(...reports);
    yearlyCoverage.push({
      year,
      reports: reports.length,
      formats: [...new Set(reports.map((report) => report.format))].sort(),
    });
  }
  return {
    downloads: [
      ...new Map(
        downloads.map((download) => [download.url, download]),
      ).values(),
    ],
    yearlyCoverage,
  };
}

function structuralDownload(
  downloads: readonly BFIDownload[],
  pattern: RegExp,
) {
  return downloads.find((download) => pattern.test(download.name)) ?? null;
}

async function discoverStructural(): Promise<{
  boxOffice: BFIDownload;
  production: BFIDownload;
}> {
  const downloads = (await fetchBFIIndexDownloads(BFI_YEARBOOK_PAGE)).downloads;
  const boxOffice = structuralDownload(
    downloads,
    /^The box office 2023\s*[-–]\s*data tables$/i,
  );
  const production = structuralDownload(
    downloads,
    /^Screen sector production\s*[-–]\s*data tables$/i,
  );
  if (!boxOffice || !production)
    throw new IngestionExecutionError(
      "BFI Yearbook structured box-office or production tables were not found.",
    );
  return { boxOffice, production };
}

export type BFIInspection = {
  weeklyCoverage: { year: number; reports: number; formats: string[] }[];
  weeklyReports: number;
  earliestReport: BFIDownload | null;
  latestReport: BFIDownload | null;
  latestWeekend: BFIWeekendRecord | null;
  structuralYears: BFIFilmMarketYearRecord[];
  structuralFiles: { boxOffice: BFIDownload; production: BFIDownload };
};

export async function inspectBFI(sinceYear = 2019): Promise<BFIInspection> {
  const baseUrl = env.BFI_BASE_URL;
  if (!baseUrl) throw new IngestionPolicyError("BFI is not configured.");
  const throughYear = new Date().getUTCFullYear();
  const weekly = await discoverWeekly(baseUrl, sinceYear, throughYear);
  const ordered = [...weekly.downloads].sort((left, right) =>
    left.fileName.localeCompare(right.fileName),
  );
  const latestReport = ordered.at(-1) ?? null;
  const latestWeekend = latestReport
    ? parseBFIWeekendWorkbook(await cachedDownload(latestReport), latestReport)
    : null;
  const structuralFiles = await discoverStructural();
  const structuralYears = parseBFIStructuralWorkbooks({
    boxOfficeBytes: await cachedDownload(structuralFiles.boxOffice),
    productionBytes: await cachedDownload(structuralFiles.production),
    boxOfficeUrl: structuralFiles.boxOffice.url,
    productionUrl: structuralFiles.production.url,
  });
  return {
    weeklyCoverage: weekly.yearlyCoverage,
    weeklyReports: weekly.downloads.length,
    earliestReport: ordered[0] ?? null,
    latestReport,
    latestWeekend,
    structuralYears,
    structuralFiles,
  };
}

export async function ingestBFI(sinceYear: number) {
  const prisma = getPrisma();
  const definition = getSourceDefinition("bfi");
  const source = await prisma.dataSource.findUnique({
    where: { slug: "bfi" },
    select: { id: true, enabled: true },
  });
  if (!source)
    throw new IngestionPolicyError(
      'Source "bfi" is not present. Run the seed first.',
    );
  if (definition.implementationStatus !== "implemented")
    throw new IngestionPolicyError('Source "bfi" is not implemented.');
  if (!bfiAdapter.isConfigured() || !env.BFI_BASE_URL)
    throw new IngestionPolicyError('Source "bfi" is not configured.');
  if (!source.enabled)
    throw new IngestionPolicyError('Source "bfi" is disabled.');

  const startedAt = new Date();
  const run = await prisma.ingestionRun.create({
    data: {
      sourceId: source.id,
      status: "running",
      startedAt,
      metadata: { sinceYear, coverage: "reported-weekend-gross" },
    },
    select: { id: true },
  });
  let recordsRead = 0;
  try {
    await prisma.dataSource.update({
      where: { id: source.id },
      data: { lastAttemptedSyncAt: startedAt },
    });
    const throughYear = startedAt.getUTCFullYear();
    const discovery = await discoverWeekly(
      env.BFI_BASE_URL,
      sinceYear,
      throughYear,
    );
    const parsed: BFIWeekendRecord[] = [];
    const failures: string[] = [];
    for (const download of discovery.downloads) {
      try {
        parsed.push(
          parseBFIWeekendWorkbook(await cachedDownload(download), download),
        );
      } catch {
        failures.push(download.fileName);
      }
    }
    const records = canonicaliseBFIWeekends(parsed);
    const structuralFiles = await discoverStructural();
    const structural = parseBFIStructuralWorkbooks({
      boxOfficeBytes: await cachedDownload(structuralFiles.boxOffice),
      productionBytes: await cachedDownload(structuralFiles.production),
      boxOfficeUrl: structuralFiles.boxOffice.url,
      productionUrl: structuralFiles.production.url,
    });
    recordsRead = records.length + structural.length;
    const existingWeeks = new Set(
      (
        await prisma.bFIWeekendBoxOffice.findMany({
          where: {
            sourceId: source.id,
            weekendEnd: { in: records.map((record) => record.weekendEnd) },
          },
          select: { weekendEnd: true },
        })
      ).map((row) => row.weekendEnd.toISOString().slice(0, 10)),
    );
    const existingYears = new Set(
      (
        await prisma.bFIFilmMarketYear.findMany({
          where: {
            sourceId: source.id,
            year: { in: structural.map((record) => record.year) },
          },
          select: { year: true },
        })
      ).map((row) => row.year),
    );
    const retrievedAt = new Date();
    await prisma.$transaction(async (transaction) => {
      for (const record of records) {
        const data = {
          weekendStart: record.weekendStart,
          sourceDateLabel: record.sourceDateLabel,
          reportedGrossGbp: record.reportedGrossGbp,
          top15GrossGbp: record.top15GrossGbp,
          releaseCount: record.releaseCount,
          topFilm: record.topFilm,
          topFilmGrossGbp: record.topFilmGrossGbp,
          top3GrossGbp: record.top3GrossGbp,
          top5GrossGbp: record.top5GrossGbp,
          top10GrossGbp: record.top10GrossGbp,
          sourceFileUrl: record.sourceFileUrl,
          sourceFileName: record.sourceFileName,
          sourceFormat: record.sourceFormat,
          sourcePublishedAt: record.sourcePublishedAt,
          retrievedAt,
          lastSeenAt: retrievedAt,
          metadata: {
            provider: "British Film Institute",
            scope: "BFI top 15 plus other reported UK and new releases",
            grossSemantics:
              "nominal GBP, Friday-Sunday, source-reported coverage",
            top15TotalIsSourcePublished: record.top15TotalSourcePublished,
          } as Prisma.InputJsonValue,
        };
        await transaction.bFIWeekendBoxOffice.upsert({
          where: {
            sourceId_weekendEnd: {
              sourceId: source.id,
              weekendEnd: record.weekendEnd,
            },
          },
          update: data,
          create: {
            ...data,
            sourceId: source.id,
            weekendEnd: record.weekendEnd,
            firstSeenAt: retrievedAt,
          },
        });
      }
      for (const record of structural) {
        const data = {
          cinemaAdmissionsMillions: record.cinemaAdmissionsMillions,
          ukBoxOfficeGrossGbpM: record.ukBoxOfficeGrossGbpM,
          releaseCount: record.releaseCount,
          filmProductionSpendGbpM: record.filmProductionSpendGbpM,
          filmProductionCount: record.filmProductionCount,
          hetvProductionSpendGbpM: record.hetvProductionSpendGbpM,
          hetvProductionCount: record.hetvProductionCount,
          sourceBoxOfficeUrl: record.sourceBoxOfficeUrl,
          sourceProductionUrl: record.sourceProductionUrl,
          sourceYearbook: record.sourceYearbook,
          retrievedAt,
          lastSeenAt: retrievedAt,
          metadata: {
            boxOfficeScope: "UK",
            releaseCountScope: "UK and Republic of Ireland",
            productionAllocation: "year principal photography commenced",
            filmAndHetvStoredSeparately: true,
          } as Prisma.InputJsonValue,
        };
        await transaction.bFIFilmMarketYear.upsert({
          where: { sourceId_year: { sourceId: source.id, year: record.year } },
          update: data,
          create: {
            ...data,
            sourceId: source.id,
            year: record.year,
            firstSeenAt: retrievedAt,
          },
        });
      }
    });
    const created = records.filter(
      (record) =>
        !existingWeeks.has(record.weekendEnd.toISOString().slice(0, 10)),
    ).length;
    const structuralCreated = structural.filter(
      (record) => !existingYears.has(record.year),
    ).length;
    const completedAt = new Date();
    await prisma.$transaction([
      prisma.ingestionRun.update({
        where: { id: run.id },
        data: {
          status: "succeeded",
          completedAt,
          recordsRead,
          recordsCreated: created + structuralCreated,
          recordsUpdated:
            records.length - created + structural.length - structuralCreated,
          metadata: {
            sinceYear,
            weekly: records.length,
            structural: structural.length,
            skippedFiles: failures,
            yearlyCoverage: discovery.yearlyCoverage,
            earliestWeekend:
              records[0]?.weekendEnd.toISOString().slice(0, 10) ?? null,
            latestWeekend:
              records.at(-1)?.weekendEnd.toISOString().slice(0, 10) ?? null,
          },
        },
      }),
      prisma.dataSource.update({
        where: { id: source.id },
        data: { lastSuccessfulSyncAt: completedAt },
      }),
    ]);
    return {
      runId: run.id,
      sinceYear,
      filesDiscovered: discovery.downloads.length,
      filesParsed: records.length,
      filesSkipped: failures,
      weeklyCreated: created,
      weeklyUpdated: records.length - created,
      structuralCreated,
      structuralUpdated: structural.length - structuralCreated,
      earliestWeekend:
        records[0]?.weekendEnd.toISOString().slice(0, 10) ?? null,
      latestWeekend:
        records.at(-1)?.weekendEnd.toISOString().slice(0, 10) ?? null,
      durationMs: completedAt.getTime() - startedAt.getTime(),
    };
  } catch (error) {
    const message = sanitiseIngestionError(error);
    await prisma.ingestionRun
      .update({
        where: { id: run.id },
        data: {
          status: "failed",
          completedAt: new Date(),
          recordsRead,
          errorMessage: message,
        },
      })
      .catch(() => undefined);
    throw new IngestionExecutionError(message);
  }
}
