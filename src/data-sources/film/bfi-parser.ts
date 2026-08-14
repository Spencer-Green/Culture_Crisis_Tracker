import * as XLSX from "xlsx";
import { strFromU8, strToU8, unzipSync, zipSync } from "fflate";

import type {
  BFIDownload,
  BFIFilmMarketYearRecord,
  BFIWeekendRecord,
} from "@/data-sources/film/bfi-types";

export class BFIParseError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "BFIParseError";
  }
}

type Cell = string | number | boolean | Date | null | undefined;
type Rows = Cell[][];

function repairOdsErrorCells(bytes: Uint8Array): Uint8Array {
  try {
    const files = unzipSync(bytes);
    const content = files["content.xml"];
    if (!content) return bytes;
    const xml = strFromU8(content).replaceAll(
      'office:value-type="error"',
      'office:value-type="string"',
    );
    files["content.xml"] = strToU8(xml);
    return zipSync(files);
  } catch {
    return bytes;
  }
}

function rowsFromWorkbook(bytes: Uint8Array): Record<string, Rows> {
  let workbook: XLSX.WorkBook;
  const originalConsoleError = console.error;
  try {
    console.error = (...args: unknown[]) => {
      if (
        typeof args[0] === "string" &&
        args[0].startsWith("ODS number format may be incorrect:")
      )
        return;
      originalConsoleError(...args);
    };
    try {
      workbook = XLSX.read(bytes, { cellDates: true });
    } catch (error) {
      if (
        error instanceof Error &&
        error.message === "Unsupported value type error"
      )
        workbook = XLSX.read(repairOdsErrorCells(bytes), { cellDates: true });
      else throw error;
    }
  } catch {
    throw new BFIParseError("BFI spreadsheet could not be read.");
  } finally {
    console.error = originalConsoleError;
  }
  return Object.fromEntries(
    workbook.SheetNames.map((name) => [
      name,
      XLSX.utils.sheet_to_json<Cell[]>(workbook.Sheets[name], {
        header: 1,
        raw: false,
        defval: null,
        blankrows: false,
      }),
    ]),
  );
}

function text(value: Cell): string {
  return String(value ?? "")
    .replace(/\u00a0/g, " ")
    .trim();
}

function number(value: Cell): number | null {
  const cleaned = text(value).replace(/[£,%\s,]/g, "");
  if (!cleaned || cleaned === "-" || cleaned === "..") return null;
  const parsed = Number(cleaned);
  return Number.isFinite(parsed) ? parsed : null;
}

function utcDate(day: string, month: string, year: string): Date {
  const date = new Date(Date.UTC(Number(year), Number(month) - 1, Number(day)));
  if (
    date.getUTCFullYear() !== Number(year) ||
    date.getUTCMonth() !== Number(month) - 1 ||
    date.getUTCDate() !== Number(day)
  )
    throw new BFIParseError("BFI weekend title contained an invalid date.");
  return date;
}

const MONTHS = [
  "january",
  "february",
  "march",
  "april",
  "may",
  "june",
  "july",
  "august",
  "september",
  "october",
  "november",
  "december",
] as const;

function parseWeekendDates(title: string) {
  const numeric = title.match(
    /(\d{1,2})\/(\d{1,2})\/(\d{4})\s*-\s*(\d{1,2})\/(\d{1,2})\/(\d{4})/,
  );
  if (numeric)
    return {
      start: utcDate(numeric[1], numeric[2], numeric[3]),
      end: utcDate(numeric[4], numeric[5], numeric[6]),
      label: `${numeric[1].padStart(2, "0")}/${numeric[2].padStart(2, "0")}/${numeric[3]} - ${numeric[4].padStart(2, "0")}/${numeric[5].padStart(2, "0")}/${numeric[6]}`,
    };
  const named = title.match(
    /Weekend\s+(\d{1,2})(?:st|nd|rd|th)?(?:\s+([A-Za-z]+))?\s*-\s*(\d{1,2})(?:st|nd|rd|th)?\s+([A-Za-z]+)\s+(\d{4})/i,
  );
  if (!named) throw new BFIParseError("BFI weekend period was not found.");
  const endMonth =
    MONTHS.indexOf(named[4].toLowerCase() as (typeof MONTHS)[number]) + 1;
  const startMonthName = named[2]?.toLowerCase() ?? named[4].toLowerCase();
  const startMonth =
    MONTHS.indexOf(startMonthName as (typeof MONTHS)[number]) + 1;
  if (!startMonth || !endMonth)
    throw new BFIParseError("BFI weekend title contained an invalid month.");
  const start = utcDate(named[1], String(startMonth), named[5]);
  const end = utcDate(named[3], String(endMonth), named[5]);
  return {
    start,
    end,
    label: `${String(start.getUTCDate()).padStart(2, "0")}/${String(startMonth).padStart(2, "0")}/${named[5]} - ${String(end.getUTCDate()).padStart(2, "0")}/${String(endMonth).padStart(2, "0")}/${named[5]}`,
  };
}

function sum(values: readonly number[]): number | null {
  return values.length
    ? values.reduce((total, value) => total + value, 0)
    : null;
}

export function parseBFIWeekendWorkbook(
  bytes: Uint8Array,
  source: BFIDownload,
): BFIWeekendRecord {
  const sheets = rowsFromWorkbook(bytes);
  const rows = Object.values(sheets).find((candidate) =>
    candidate.some((row) =>
      row.some((cell) => /^BFI.*Weekend.*box office/i.test(text(cell))),
    ),
  );
  if (!rows) throw new BFIParseError("BFI weekend worksheet was not found.");
  const title = text(
    rows.flat().find((cell) => /^BFI.*Weekend.*box office/i.test(text(cell))),
  );
  const period = parseWeekendDates(title);
  const weekendStart = period.start;
  const weekendEnd = period.end;
  const headerIndex = rows.findIndex(
    (row) => text(row[0]) === "Rank" && text(row[1]) === "Film",
  );
  if (headerIndex < 0)
    throw new BFIParseError("BFI film table header was not found.");

  const films: { rank: number; title: string; gross: number }[] = [];
  let top15GrossGbp: number | null = null;
  for (const row of rows.slice(headerIndex + 1)) {
    const label = text(row[1]);
    if (label.startsWith("Comments on this week")) break;
    if (label === "Total") {
      top15GrossGbp = number(row[3]);
      continue;
    }
    const rank = number(row[0]);
    const gross = number(row[3]);
    if (rank !== null && gross !== null && label)
      films.push({ rank, title: label, gross });
  }
  const ranked = [...films].sort((left, right) => left.rank - right.rank);
  const top15TotalSourcePublished = top15GrossGbp !== null;
  top15GrossGbp ??= sum(
    ranked.filter((film) => film.rank <= 15).map((film) => film.gross),
  );
  if (top15GrossGbp === null)
    throw new BFIParseError("BFI top-15 total was not found.");
  const reportedGrossGbp = sum(films.map((film) => film.gross));
  if (reportedGrossGbp === null)
    throw new BFIParseError("BFI report contained no numeric film grosses.");
  return {
    weekendStart,
    weekendEnd,
    sourceDateLabel: period.label,
    reportedGrossGbp,
    top15GrossGbp,
    top15TotalSourcePublished,
    releaseCount: films.length,
    topFilm: ranked[0]?.title ?? null,
    topFilmGrossGbp: ranked[0]?.gross ?? null,
    top3GrossGbp: sum(ranked.slice(0, 3).map((film) => film.gross)),
    top5GrossGbp: sum(ranked.slice(0, 5).map((film) => film.gross)),
    top10GrossGbp: sum(ranked.slice(0, 10).map((film) => film.gross)),
    sourceFileUrl: source.url,
    sourceFileName: source.fileName,
    sourceFormat: source.format,
    sourcePublishedAt: source.publishedAt,
  };
}

export function canonicaliseBFIWeekends(
  records: readonly BFIWeekendRecord[],
): BFIWeekendRecord[] {
  const ordered = [...records].sort((left, right) => {
    const period = left.weekendEnd.getTime() - right.weekendEnd.getTime();
    if (period !== 0) return period;
    return (
      (left.sourcePublishedAt?.getTime() ?? 0) -
      (right.sourcePublishedAt?.getTime() ?? 0)
    );
  });
  return [
    ...new Map(
      ordered.map((record) => [
        record.weekendEnd.toISOString().slice(0, 10),
        record,
      ]),
    ).values(),
  ];
}

function sheet(sheets: Record<string, Rows>, name: string): Rows {
  const rows = sheets[name];
  if (!rows)
    throw new BFIParseError(`BFI structural worksheet ${name} was not found.`);
  return rows;
}

function rowsByYear(rows: Rows, valueColumn = 1): Map<number, number> {
  const result = new Map<number, number>();
  for (const row of rows) {
    const year = number(row[0]);
    const value = number(row[valueColumn]);
    if (year && value !== null && year >= 1900 && year <= 2200)
      result.set(year, value);
  }
  return result;
}

function horizontalSeries(rows: Rows, label: string): Map<number, number> {
  const header = rows.find((row) => row.some((cell) => number(cell) === 2019));
  const values = rows.find((row) => text(row[0]) === label);
  if (!header || !values) return new Map();
  const result = new Map<number, number>();
  header.forEach((cell, index) => {
    const year = number(cell);
    const value = number(values[index]);
    if (year && value !== null) result.set(year, value);
  });
  return result;
}

export function parseBFIStructuralWorkbooks(input: {
  boxOfficeBytes: Uint8Array;
  productionBytes: Uint8Array;
  boxOfficeUrl: string;
  productionUrl: string;
}): BFIFilmMarketYearRecord[] {
  const boxOffice = rowsFromWorkbook(input.boxOfficeBytes);
  const production = rowsFromWorkbook(input.productionBytes);
  const admissions = rowsByYear(sheet(boxOffice, "F1"));
  const gross = rowsByYear(sheet(boxOffice, "T4"));
  const releases = rowsByYear(sheet(boxOffice, "F4"), 2);
  const productionSheet = sheet(production, "F1");
  const filmSpend = horizontalSeries(
    productionSheet,
    "UK spend film (£ million)",
  );
  const filmCount = horizontalSeries(
    productionSheet,
    "Number of film productions",
  );
  const hetvSpend = horizontalSeries(
    productionSheet,
    "UK spend HETV (£ million)",
  );
  const hetvCount = horizontalSeries(
    productionSheet,
    "Number of HETV productions",
  );
  const years = new Set([
    ...admissions.keys(),
    ...gross.keys(),
    ...filmSpend.keys(),
    ...filmCount.keys(),
  ]);
  return [...years]
    .sort((left, right) => left - right)
    .map((year) => ({
      year,
      cinemaAdmissionsMillions: admissions.get(year) ?? null,
      ukBoxOfficeGrossGbpM: gross.get(year) ?? null,
      releaseCount: releases.get(year) ?? null,
      filmProductionSpendGbpM: filmSpend.get(year) ?? null,
      filmProductionCount: filmCount.get(year) ?? null,
      hetvProductionSpendGbpM: hetvSpend.get(year) ?? null,
      hetvProductionCount: hetvCount.get(year) ?? null,
      sourceBoxOfficeUrl: input.boxOfficeUrl,
      sourceProductionUrl: input.productionUrl,
      sourceYearbook: "BFI Statistical Yearbook 2024 (2023 data tables)",
    }));
}
