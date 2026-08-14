import "dotenv/config";

import { disconnectPrisma } from "../src/lib/prisma";
import { sanitiseIngestionError } from "../src/services/ingestion/service-core";
import { ingestBEAACPSAMusic } from "../src/services/music/bea-acpsa-ingestion";

async function main() {
  const result = await ingestBEAACPSAMusic();
  console.log("Source: BEA ACPSA — Sound Recording");
  console.log(`Archive: ${result.archiveUrl}`);
  console.log(`Workbooks read: ${result.workbooksRead}`);
  console.log(`Rows read: ${result.rowsRead}`);
  console.log(`Range: ${result.years[0]}–${result.years.at(-1)}`);
  console.log(`Created: ${result.recordsCreated}`);
  console.log(`Updated: ${result.recordsUpdated}`);
  console.log(`Missing years: ${result.missingYears.join(", ") || "none"}`);
  console.log(`Missing metric observations: ${result.missingObservations}`);
  console.log(`Duration: ${result.durationMs}ms`);
}

main()
  .catch((error) => {
    console.error(sanitiseIngestionError(error));
    process.exitCode = 1;
  })
  .finally(disconnectPrisma);
