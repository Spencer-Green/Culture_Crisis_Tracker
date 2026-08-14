import { strToU8, zipSync } from "fflate";
import { describe, expect, it } from "vitest";

import {
  buildCensusRecordIndustryRecord,
  CensusAiesParseError,
  parseCensusAiesArchive,
} from "@/data-sources/music/census-aies-parser";

const BASIC_HEADER =
  "#GEOTYPE|ST|GEO_ID|GEO_LABEL|GEO_ID_F|SECTOR|INDLEVEL|NAICS|NAICS_LABEL|NAICS_F|TYPOP|TYPOP_LABEL|TAXSTAT|TAXSTAT_LABEL|YEAR|RCPT_TOT_VAL|RCPT_TOT_VAL_F|PAY_ANN_VAL|PAY_ANN_VAL_F|PAY_QTR1_VAL|PAY_QTR1_VAL_F|EMP_MAR12_NUM|EMP_MAR12_NUM_F|RCPT_TOT_CV|RCPT_TOT_CV_F|PAY_ANN_CV|PAY_ANN_CV_F|PAY_QTR1_CV|PAY_QTR1_CV_F|EMP_MAR12_CV|EMP_MAR12_CV_F";
const EXPENSE_HEADER =
  "#GEOTYPE|ST|GEO_ID|GEO_LABEL|GEO_ID_F|SECTOR|NAICS|NAICS_LABEL|NAICS_F|TYPOP|TYPOP_LABEL|TAXSTAT|TAXSTAT_LABEL|YEAR|RCPT_TOT_VAL|RCPT_TOT_VAL_F|EXPS_TOT_DVAL|EXPS_TOT_DVAL_F|RCPT_TOT_CV|RCPT_TOT_CV_F|EXPS_TOT_CV|EXPS_TOT_CV_F|INDLEVEL|SUBSECTOR|INDGROUP";
const BASIC_ROW =
  "01|00|0100000US|United States||51|6|512250|Record production and distribution||00|All establishments|00|All establishments|2023|13698582||2202030||635105||13163||2.1||1.6||1.2||3|";
const EXPENSE_ROW =
  "01|00|0100000US|United States||51|512250|Record production and distribution||00|All establishments|00|All establishments|2023|13698582||12151050||2.1||1.4||6|512|5122";

function archive(name: string, text: string) {
  return zipSync({ [name]: strToU8(text) });
}

describe("Census AIES parsing", () => {
  it("filters exact national NAICS 512250 and joins official employer tables", () => {
    const basic = parseCensusAiesArchive(
      archive(
        "AIES00BASIC.dat",
        `${BASIC_HEADER}\n${BASIC_ROW}\n${BASIC_ROW.replace("512250", "512240").replace("Record production and distribution", "Sound recording studios")}\n`,
      ),
      "AIES00BASIC",
    );
    const expense = parseCensusAiesArchive(
      archive("AIES00EXP01.dat", `${EXPENSE_HEADER}\n${EXPENSE_ROW}\n`),
      "AIES00EXP01",
    );
    const record = buildCensusRecordIndustryRecord({
      basicRows: basic.rows,
      expenseRows: expense.rows,
      basicRowsRead: basic.rowsRead,
      expenseRowsRead: expense.rowsRead,
      basicUrl:
        "https://www2.census.gov/programs-surveys/aies/data/2023/AIES00BASIC.zip",
      expenseUrl:
        "https://www2.census.gov/programs-surveys/aies/data/2023/AIES00EXP01.zip",
      vintage: "2023",
    });
    expect(record).toMatchObject({
      year: 2023,
      naicsCode: "512250",
      industryLabel: "Record production and distribution",
      revenueUsd: "13698582000",
      payrollUsd: "2202030000",
      employment: 13_163,
      operatingExpensesUsd: "12151050000",
      revenueFlag: null,
      sourceRowsRead: 3,
    });
    expect(record.revenueCvPct).toBe(2.1);
    expect(record.operatingExpensesCvPct).toBe(1.4);
  });

  it("preserves suppression flags and treats withheld values as null", () => {
    const basicFields = BASIC_ROW.split("|");
    basicFields[15] = "";
    basicFields[16] = "D";
    basicFields[17] = "";
    basicFields[18] = "D";
    basicFields[21] = "";
    basicFields[22] = "S";
    const expenseFields = EXPENSE_ROW.split("|");
    expenseFields[14] = "";
    expenseFields[15] = "D";
    expenseFields[16] = "";
    expenseFields[17] = "D";
    const basic = parseCensusAiesArchive(
      archive("AIES00BASIC.dat", `${BASIC_HEADER}\n${basicFields.join("|")}\n`),
      "AIES00BASIC",
    );
    const expense = parseCensusAiesArchive(
      archive(
        "AIES00EXP01.dat",
        `${EXPENSE_HEADER}\n${expenseFields.join("|")}\n`,
      ),
      "AIES00EXP01",
    );
    const record = buildCensusRecordIndustryRecord({
      basicRows: basic.rows,
      expenseRows: expense.rows,
      basicRowsRead: 1,
      expenseRowsRead: 1,
      basicUrl: "https://www2.census.gov/basic.zip",
      expenseUrl: "https://www2.census.gov/expense.zip",
      vintage: "2023",
    });
    expect(record.revenueUsd).toBeNull();
    expect(record.revenueFlag).toBe("D");
    expect(record.payrollUsd).toBeNull();
    expect(record.employment).toBeNull();
    expect(record.employmentFlag).toBe("S");
    expect(record.operatingExpensesUsd).toBeNull();
  });

  it("rejects missing exact mappings rather than accepting related industries", () => {
    const parsed = parseCensusAiesArchive(
      archive(
        "AIES00BASIC.dat",
        `${BASIC_HEADER}\n${BASIC_ROW.replace("512250", "512240")}\n`,
      ),
      "AIES00BASIC",
    );
    expect(() =>
      buildCensusRecordIndustryRecord({
        basicRows: parsed.rows,
        expenseRows: [],
        basicRowsRead: 1,
        expenseRowsRead: 0,
        basicUrl: "https://www2.census.gov/basic.zip",
        expenseUrl: "https://www2.census.gov/expense.zip",
        vintage: "2023",
      }),
    ).toThrow(CensusAiesParseError);
  });
});
