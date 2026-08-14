import "dotenv/config";

import { inspectCensusMusic } from "../src/services/music/census-aies-ingestion";
import { sanitiseIngestionError } from "../src/services/ingestion/service-core";

function money(value: string | null) {
  return value === null
    ? "suppressed/unavailable"
    : `$${Number(value).toLocaleString("en-US")}`;
}

async function main() {
  const result = await inspectCensusMusic();
  console.log("Source: U.S. Census Bureau Annual Integrated Economic Survey");
  console.log("Access: official public ZIP/pipe-delimited downloads; no key");
  console.log("NAICS: 512250 — Record production and distribution");
  console.log(
    "Fields: RCPT_TOT_VAL (revenue), PAY_ANN_VAL (annual payroll), EMP_MAR12_NUM (employment), EXPS_TOT_DVAL (operating expenses)",
  );
  console.log(
    "Status/quality fields: matching *_F disclosure flags and *_CV coefficients of variation",
  );
  for (const file of result.files) {
    console.log(`\n${file.table} (${file.year})`);
    console.log(`Rows read: ${file.rowsRead}`);
    console.log(`National matching rows: ${file.matchingRows}`);
    console.log(`URL: ${file.url}`);
  }
  for (const record of result.records) {
    console.log(`\nRepresentative ${record.year} record`);
    console.log(`Industry: ${record.industryLabel}`);
    console.log(`Scope: ${record.employerScope}`);
    console.log(`Revenue: ${money(record.revenueUsd)}`);
    console.log(`Annual payroll: ${money(record.payrollUsd)}`);
    console.log(
      `Employment (March 12): ${record.employment ?? "suppressed/unavailable"}`,
    );
    console.log(`Operating expenses: ${money(record.operatingExpensesUsd)}`);
    console.log(
      "Source monetary unit: USD thousands (normalized to USD on import)",
    );
    console.log(
      `Flags: revenue=${record.revenueFlag ?? "none"}, payroll=${record.payrollFlag ?? "none"}, employment=${record.employmentFlag ?? "none"}, expenses=${record.operatingExpensesFlag ?? "none"}`,
    );
    console.log(
      `CVs: revenue=${record.revenueCvPct ?? "unavailable"}%, payroll=${record.payrollCvPct ?? "unavailable"}%, employment=${record.employmentCvPct ?? "unavailable"}%, expenses=${record.operatingExpensesCvPct ?? "unavailable"}%`,
    );
  }
  console.log("\nComparable AIES annual range: 2023 only");
  console.log(
    "Predecessor SAS history is not stitched because AIES is a new integrated survey and expense scope differs.",
  );
}

main().catch((error) => {
  console.error(sanitiseIngestionError(error));
  process.exitCode = 1;
});
