import "dotenv/config";

import { parseMVTCli } from "../src/data-sources/music/mvt-cli";
import { disconnectPrisma } from "../src/lib/prisma";
import { ingestMVT } from "../src/services/music/mvt-ingestion";
import { sanitiseIngestionError } from "../src/services/ingestion/service-core";

async function main() {
  const options = parseMVTCli(process.argv.slice(2));
  const result = await ingestMVT(options.year);
  console.log("Source: Music Venue Trust");
  console.log(`Years: ${result.years.join(", ")}`);
  console.log(`Records read: ${result.recordsRead}`);
  console.log(`Created: ${result.recordsCreated}`);
  console.log(`Updated: ${result.recordsUpdated}`);
  console.log(`Duration: ${result.durationMs}ms`);
}

main()
  .catch((error) => {
    console.error(sanitiseIngestionError(error));
    process.exitCode = 1;
  })
  .finally(disconnectPrisma);
