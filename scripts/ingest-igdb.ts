import "dotenv/config";

import { parseIgdbCliArguments } from "../src/data-sources/entertainment/gaming-cli";
import { disconnectPrisma } from "../src/lib/prisma";
import { ingestIgdb } from "../src/services/gaming/igdb-ingestion";
import { sanitiseIngestionError } from "../src/services/ingestion/service-core";

async function main() {
  const options = parseIgdbCliArguments(process.argv.slice(2));
  console.log("Source: IGDB");
  console.log(`Release window: ${options.startPeriod} to ${options.endPeriod}`);
  const result = await ingestIgdb(options);
  console.log(`Monthly partitions: ${result.partitions}`);
  console.log(`API calls: ${result.apiCalls}`);
  console.log(`Records read: ${result.recordsRead}`);
  console.log(
    `Malformed/out-of-policy records excluded after response validation: ${result.recordsExcluded}`,
  );
  console.log(`Unique games: ${result.uniqueGames}`);
  console.log(`Created: ${result.recordsCreated}`);
  console.log(`Updated: ${result.recordsUpdated}`);
  console.log(`Steam mapped: ${result.steamMappedGames}`);
  console.log(`Developers: ${result.developers}`);
  console.log(`Publishers: ${result.publishers}`);
  console.log(`Genres: ${result.genres}`);
  console.log(`Platforms: ${result.platforms}`);
  console.log(`Game types: ${JSON.stringify(result.gameTypes)}`);
  console.log(`Duration: ${result.durationMs}ms`);
}

main()
  .catch((error) => {
    console.error(sanitiseIngestionError(error));
    process.exitCode = 1;
  })
  .finally(async () => disconnectPrisma());
