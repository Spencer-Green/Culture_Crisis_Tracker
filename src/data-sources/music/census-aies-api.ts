import {
  buildCensusRecordIndustryRecord,
  parseCensusAiesArchive,
} from "@/data-sources/music/census-aies-parser";
import {
  CENSUS_AIES_TABLES,
  CENSUS_AIES_VINTAGES,
  type CensusAiesInspection,
  type CensusAiesTable,
} from "@/data-sources/music/census-aies-types";
import type { FetchImplementation } from "@/lib/http";

export class CensusAiesResponseError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "CensusAiesResponseError";
  }
}

function officialBase(value: string) {
  const url = new URL(value);
  if (
    url.protocol !== "https:" ||
    url.hostname !== "www2.census.gov" ||
    !url.pathname.startsWith("/programs-surveys/aies/data")
  )
    throw new CensusAiesResponseError(
      "Census AIES ingestion requires the official HTTPS download host.",
    );
  url.search = "";
  url.hash = "";
  return url;
}

export function buildCensusAiesDownloadUrl(
  baseUrl: string,
  year: number,
  table: CensusAiesTable,
) {
  const url = officialBase(baseUrl);
  url.pathname = `${url.pathname.replace(/\/$/, "")}/${year}/${table}.zip`;
  return url.toString();
}

export async function downloadCensusAiesArchive(
  url: string,
  options: {
    fetchImplementation?: FetchImplementation;
    timeoutMs?: number;
  } = {},
) {
  const safeUrl = officialBase(url).toString();
  const controller = new AbortController();
  const timeout = setTimeout(
    () => controller.abort(),
    options.timeoutMs ?? 20_000,
  );
  try {
    const response = await (options.fetchImplementation ?? fetch)(safeUrl, {
      headers: {
        Accept: "application/zip, application/octet-stream",
        "User-Agent": "CultureCrisisTracker/0.1.0",
      },
      redirect: "follow",
      signal: controller.signal,
    });
    if (!response.ok)
      throw new CensusAiesResponseError(
        `Census AIES download returned HTTP ${response.status}.`,
      );
    const bytes = new Uint8Array(await response.arrayBuffer());
    if (bytes.byteLength === 0 || bytes.byteLength > 5_000_000)
      throw new CensusAiesResponseError(
        "Census AIES returned an invalid archive size.",
      );
    return bytes;
  } catch (error) {
    if (error instanceof CensusAiesResponseError) throw error;
    if (error instanceof Error && error.name === "AbortError")
      throw new CensusAiesResponseError("Census AIES download timed out.");
    throw new CensusAiesResponseError("Census AIES download failed.");
  } finally {
    clearTimeout(timeout);
  }
}

export async function inspectCensusAies(
  baseUrl: string,
  options: {
    fetchImplementation?: FetchImplementation;
    timeoutMs?: number;
  } = {},
): Promise<CensusAiesInspection> {
  const files: CensusAiesInspection["files"] = [];
  const records: CensusAiesInspection["records"] = [];
  for (const vintage of CENSUS_AIES_VINTAGES) {
    const parsed = new Map<
      CensusAiesTable,
      ReturnType<typeof parseCensusAiesArchive>
    >();
    const urls = new Map<CensusAiesTable, string>();
    for (const table of CENSUS_AIES_TABLES) {
      const url = buildCensusAiesDownloadUrl(baseUrl, vintage.year, table);
      const bytes = await downloadCensusAiesArchive(url, options);
      const result = parseCensusAiesArchive(bytes, table);
      parsed.set(table, result);
      urls.set(table, url);
      files.push({
        year: vintage.year,
        table,
        url,
        rowsRead: result.rowsRead,
        matchingRows: result.rows.filter(
          (row) => row.NAICS === "512250" && row.GEO_ID === "0100000US",
        ).length,
      });
    }
    const basic = parsed.get("AIES00BASIC")!;
    const expense = parsed.get("AIES00EXP01")!;
    records.push(
      buildCensusRecordIndustryRecord({
        basicRows: basic.rows,
        expenseRows: expense.rows,
        basicRowsRead: basic.rowsRead,
        expenseRowsRead: expense.rowsRead,
        basicUrl: urls.get("AIES00BASIC")!,
        expenseUrl: urls.get("AIES00EXP01")!,
        vintage: vintage.vintage,
      }),
    );
  }
  return { files, records };
}
