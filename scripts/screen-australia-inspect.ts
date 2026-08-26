import "dotenv/config";

import { inspectScreenAustralia } from "../src/services/film/screen-australia-ingestion";
import { sanitiseIngestionError } from "../src/services/ingestion/service-core";

async function main() {
  const result = await inspectScreenAustralia();
  console.log("Source: Screen Australia public box-office widget");
  console.log("Access: provisional private/research public HTML");
  console.log(`Requests: ${result.requestCount}`);
  console.log(`Cache-Control: ${result.cacheControl ?? "not supplied"}`);
  console.log(`Rows read/skipped: ${result.rowsRead}/${result.rowsSkipped}`);
  for (const view of result.views) {
    console.log(
      `${view.label}: ${view.rowCount} rows · ${view.reportDate.toISOString().slice(0, 10)}`,
    );
    const representative = result.records.find(
      (record) => record.periodType === view.periodType,
    );
    if (representative)
      console.log(
        `  #${representative.rank} ${representative.title} · AUD ${representative.periodGrossAud?.toLocaleString("en-AU") ?? "unavailable"}`,
      );
  }
  for (const warning of result.warnings) console.log(`Warning: ${warning}`);
}

main().catch((error) => {
  console.error(sanitiseIngestionError(error));
  process.exitCode = 1;
});
