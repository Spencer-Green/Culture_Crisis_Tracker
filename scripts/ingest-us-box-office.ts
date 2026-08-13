import "dotenv/config";

import { parseUSBoxOfficeCli } from "../src/data-sources/film/us-box-office-cli";
import { disconnectPrisma } from "../src/lib/prisma";
import { ingestUSBoxOffice } from "../src/services/film/us-box-office-ingestion";
import { sanitiseIngestionError } from "../src/services/ingestion/service-core";

async function main() {
  const options = parseUSBoxOfficeCli(process.argv.slice(2));
  const result = await ingestUSBoxOffice(options.startYear);
  console.log("Source: US Box Office — Provisional");
  console.log("Provider: Kaggle community dataset");
  console.log("Underlying provenance: Box Office Mojo-derived");
  console.log(`Range: ${result.earliestWeekend} → ${result.latestWeekend}`);
  console.log(`Rows read: ${result.rowsRead}`);
  console.log(`Canonical weekends: ${result.canonicalWeekends}`);
  console.log(`Created: ${result.created}`);
  console.log(`Updated: ${result.updated}`);
  console.log(
    `Alternate summaries removed: ${result.duplicateVariantsRemoved}`,
  );
  console.log(
    `Null/future rows skipped: ${result.nullGrossRowsSkipped + result.futureRowsSkipped}`,
  );
  console.log(`Duration: ${result.durationMs}ms`);
}

main()
  .catch((error) => {
    console.error(sanitiseIngestionError(error));
    process.exitCode = 1;
  })
  .finally(disconnectPrisma);
