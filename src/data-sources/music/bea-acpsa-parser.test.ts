import { strToU8, zipSync } from "fflate";
import { describe, expect, it } from "vitest";
import * as XLSX from "xlsx";

import {
  BEAACPSAParseError,
  parseBEAACPSANationalArchive,
  parseBEAACPSAWorkbook,
} from "@/data-sources/music/bea-acpsa-parser";

function workbookBytes(year: number, options: { missing?: boolean } = {}) {
  const workbook = XLSX.utils.book_new();
  const output = XLSX.utils.aoa_to_sheet([
    [`Table 2. Output and Value Added by Industry, ${year}`],
    ["[Millions of dollars]"],
    [
      "Industry",
      "Industry output",
      "Intermediate Consumption",
      "Value Added",
      "ACPSA Industry Ratio",
      "ACPSA Output",
      "ACPSA Intermediate Consumption",
      "ACPSA Value Added",
    ],
    [
      "Sound Recording",
      30_835,
      9_514,
      21_321,
      0.991,
      options.missing ? "--" : 30_564,
      9_430,
      21_133,
    ],
  ]);
  const employment = XLSX.utils.aoa_to_sheet([
    [`Table 4.  Employment and Compensation of Employees by Industry, ${year}`],
    [
      "Industry",
      "Total employment (thousands of employees)",
      "Compensation (millions of dollars)",
      "ACPSA industry ratio",
      "ACPSA employment (thousands of employees)",
      "ACPSA compensation (millions of dollars)",
    ],
    ["Sound Recording", 19, 3_146, 0.991, 19, 3_119],
  ]);
  XLSX.utils.book_append_sheet(workbook, employment, "Table4_Employment");
  XLSX.utils.book_append_sheet(workbook, output, "Table2_Industry_Output_VA");
  return new Uint8Array(
    XLSX.write(workbook, { type: "array", bookType: "xlsx" }),
  );
}

describe("BEA ACPSA parsing", () => {
  it("discovers worksheets independently of order and maps exact ACPSA fields", () => {
    const record = parseBEAACPSAWorkbook(workbookBytes(2023), {
      year: 2023,
      fileName: "ACPSA_2023.xlsx",
      archiveUrl: "https://apps.bea.gov/regional/zip/acpsanational.zip",
    });
    expect(record).toMatchObject({
      year: 2023,
      categoryLabel: "Sound Recording",
      acpsaOutputUsd: "30564000000",
      acpsaValueAddedUsd: "21133000000",
      acpsaEmployment: 19_000,
      acpsaEmployeeCompensationUsd: "3119000000",
      sourceWorkbook: "ACPSA_2023.xlsx",
    });
    expect(record.unitMetadata.valuation).toBe("current-dollar nominal");
  });

  it("preserves missing official values as null", () => {
    expect(
      parseBEAACPSAWorkbook(workbookBytes(2023, { missing: true }), {
        year: 2023,
        fileName: "ACPSA_2023.xlsx",
        archiveUrl: "https://apps.bea.gov/regional/zip/acpsanational.zip",
      }).acpsaOutputUsd,
    ).toBeNull();
  });

  it("parses annual workbooks while excluding separate real commodity files", () => {
    const result = parseBEAACPSANationalArchive(
      zipSync({
        "ACPSA_1998.xlsx": workbookBytes(1998),
        "ACPSA_2023.xlsx": workbookBytes(2023),
        "Real_Gross_Output_by_ACPSA_Commodity.xlsx": strToU8("not selected"),
      }),
      "https://apps.bea.gov/regional/zip/acpsanational.zip",
    );
    expect(result.records.map((record) => record.year)).toEqual([1998, 2023]);
    expect(result.missingYears).toContain(2019);
    expect(result.ignoredStructuredFiles).toEqual([
      "Real_Gross_Output_by_ACPSA_Commodity.xlsx",
    ]);
  });

  it("rejects a workbook without the exact Sound Recording row", () => {
    const bytes = workbookBytes(2023);
    const workbook = XLSX.read(bytes);
    workbook.Sheets.Table2_Industry_Output_VA.A4.v = "Sound recordings";
    const changed = new Uint8Array(
      XLSX.write(workbook, { type: "array", bookType: "xlsx" }),
    );
    expect(() =>
      parseBEAACPSAWorkbook(changed, {
        year: 2023,
        fileName: "ACPSA_2023.xlsx",
        archiveUrl: "https://apps.bea.gov/regional/zip/acpsanational.zip",
      }),
    ).toThrow(BEAACPSAParseError);
  });
});
