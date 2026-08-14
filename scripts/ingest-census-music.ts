import "dotenv/config";

import { disconnectPrisma } from "../src/lib/prisma";
import { ingestCensusMusic } from "../src/services/music/census-aies-ingestion";
import { sanitiseIngestionError } from "../src/services/ingestion/service-core";

async function main() {
  const result = await ingestCensusMusic();
  console.log("Source: U.S. Census Bureau AIES");
  console.log("NAICS: 512250 — Record production and distribution");
  console.log(`Years: ${result.years.join(", ")}`);
  console.log(`Files: ${result.files.length}`);
  console.log(`Rows read: ${result.recordsRead}`);
  console.log(`Matching annual rows: ${result.matchingRows}`);
  console.log(`Created: ${result.recordsCreated}`);
  console.log(`Updated: ${result.recordsUpdated}`);
  console.log(`Suppressed/null metric fields: ${result.suppressedFields}`);
  console.log(`Duration: ${result.durationMs}ms`);
}

main()
  .catch((error) => {
    console.error(sanitiseIngestionError(error));
    process.exitCode = 1;
  })
  .finally(disconnectPrisma);
