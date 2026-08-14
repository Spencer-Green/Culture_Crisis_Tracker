import { zipSync } from "fflate";
import { describe, expect, it, vi } from "vitest";
import * as XLSX from "xlsx";

import {
  inspectBEAACPSA,
  validateBEAACPSAArchiveUrl,
} from "@/data-sources/music/bea-acpsa-api";

function workbookBytes() {
  const workbook = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(
    workbook,
    XLSX.utils.aoa_to_sheet([
      ["Table 2. Output and Value Added by Industry, 2023"],
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
      ["Sound Recording", 31, 10, 21, 1, 30, 9, 21],
    ]),
    "Table2_Industry_Output_VA",
  );
  XLSX.utils.book_append_sheet(
    workbook,
    XLSX.utils.aoa_to_sheet([
      ["Table 4. Employment, 2023"],
      [
        "Industry",
        "Total employment (thousands of employees)",
        "Compensation (millions of dollars)",
        "ACPSA industry ratio",
        "ACPSA employment (thousands of employees)",
        "ACPSA compensation (millions of dollars)",
      ],
      ["Sound Recording", 19, 3, 1, 19, 3],
    ]),
    "Table4_Employment",
  );
  return new Uint8Array(
    XLSX.write(workbook, { type: "array", bookType: "xlsx" }),
  );
}

describe("BEA ACPSA download", () => {
  it("allows only the exact official national archive", () => {
    expect(
      validateBEAACPSAArchiveUrl(
        "https://apps.bea.gov/regional/zip/acpsanational.zip",
      ),
    ).toBe("https://apps.bea.gov/regional/zip/acpsanational.zip");
    expect(() =>
      validateBEAACPSAArchiveUrl("https://example.com/acpsa.zip"),
    ).toThrow(/official national ZIP/);
  });

  it("downloads and parses the bounded official archive", async () => {
    const fetchImplementation = vi.fn().mockResolvedValue(
      new Response(zipSync({ "ACPSA_2023.xlsx": workbookBytes() }), {
        status: 200,
        headers: { "content-type": "application/x-zip-compressed" },
      }),
    );
    const result = await inspectBEAACPSA({ fetchImplementation });
    expect(fetchImplementation).toHaveBeenCalledTimes(1);
    expect(result.records[0]).toMatchObject({
      year: 2023,
      categoryLabel: "Sound Recording",
    });
    expect(result.sourceStatus.regularlyProduced).toBe(false);
  });
});
