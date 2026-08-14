import "dotenv/config";

import { inspectBEAACPSAMusic } from "../src/services/music/bea-acpsa-ingestion";
import { sanitiseIngestionError } from "../src/services/ingestion/service-core";

function money(value: string | null) {
  return value === null
    ? "unavailable"
    : `$${Number(value).toLocaleString("en-US")}`;
}

async function main() {
  const result = await inspectBEAACPSAMusic();
  const first = result.records[0];
  const latest = result.records.at(-1)!;
  console.log("Source: U.S. Bureau of Economic Analysis");
  console.log("Account: Arts and Cultural Production Satellite Account");
  console.log(`Archive: ${result.archiveUrl}`);
  console.log(`Annual workbooks: ${result.annualWorkbookCount}`);
  console.log(`Worksheets: ${result.worksheets.join(", ")}`);
  console.log("Exact category: Sound Recording");
  console.log(`Historical range: ${first.year}–${latest.year}`);
  console.log(`Missing years: ${result.missingYears.join(", ") || "none"}`);
  console.log("Valuation: current-dollar nominal");
  console.log(
    "Units: output/value added/compensation = millions of dollars; employment = thousands of employees",
  );
  console.log(
    `Ignored separate real/commodity workbooks: ${result.ignoredStructuredFiles.join(", ")}`,
  );
  console.log(`Rows inspected: ${result.rowsRead}`);
  console.log("\nRepresentative latest record");
  console.log(`Workbook: ${latest.sourceWorkbook}`);
  console.log(`Tables: ${latest.sourceTables.join(", ")}`);
  console.log(`ACPSA output: ${money(latest.acpsaOutputUsd)}`);
  console.log(`ACPSA value added: ${money(latest.acpsaValueAddedUsd)}`);
  console.log(`ACPSA employment: ${latest.acpsaEmployment ?? "unavailable"}`);
  console.log(
    `ACPSA employee compensation: ${money(latest.acpsaEmployeeCompensationUsd)}`,
  );
  console.log(`\nRole: ${result.sourceStatus.role}`);
  console.log(
    `Latest official observation: ${result.sourceStatus.latestOfficialYear}`,
  );
  console.log(result.sourceStatus.discontinuationNote);
}

main().catch((error) => {
  console.error(sanitiseIngestionError(error));
  process.exitCode = 1;
});
