import "dotenv/config";

import { disconnectPrisma } from "../src/lib/prisma";
import { ingestScreenAustralia } from "../src/services/film/screen-australia-ingestion";
import { sanitiseIngestionError } from "../src/services/ingestion/service-core";

async function main() {
  const result = await ingestScreenAustralia();
  console.log("Source: Screen Australia public box-office widget");
  console.log(`Requests: ${result.requestCount}`);
  console.log(`Rows read/skipped: ${result.rowsRead}/${result.rowsSkipped}`);
  console.log(`Created/updated: ${result.created}/${result.updated}`);
  for (const [view, count] of Object.entries(result.viewCounts))
    console.log(`${view}: ${count} rows · ${result.reportDates[view]}`);
  for (const warning of result.warnings) console.log(`Warning: ${warning}`);
  console.log(`Duration: ${result.durationMs}ms`);
}

main()
  .catch((error) => {
    console.error(sanitiseIngestionError(error));
    process.exitCode = 1;
  })
  .finally(disconnectPrisma);
