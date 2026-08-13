import "dotenv/config";

import { parseSteamCliArguments } from "../src/data-sources/entertainment/gaming-cli";
import { disconnectPrisma } from "../src/lib/prisma";
import { ingestSteam } from "../src/services/gaming/steam-ingestion";
import { sanitiseIngestionError } from "../src/services/ingestion/service-core";

async function main() {
  const options = parseSteamCliArguments(process.argv.slice(2));
  console.log("Source: Steam / Valve-owned public endpoints");
  console.log(`Batch: offset ${options.offset}, limit ${options.limit}`);
  console.log(`Capture bucket: ${options.capturedAt.toISOString()}`);
  const result = await ingestSteam(options);
  console.log(`Mapped games queried: ${result.mappedGamesQueried}`);
  console.log(`Created: ${result.recordsCreated}`);
  console.log(`Updated: ${result.recordsUpdated}`);
  console.log(`Store available: ${result.storeAvailable}`);
  console.log(`Unavailable or removed: ${result.unavailableApps}`);
  console.log(`Player-count coverage: ${result.playerCountCoverage}`);
  console.log(`Review coverage: ${result.reviewCoverage}`);
  console.log(`Price coverage: ${result.priceCoverage}`);
  console.log(`Free to play: ${result.freeToPlay}`);
  console.log(`Discounted: ${result.discounted}`);
  console.log(`Duration: ${result.durationMs}ms`);
}

main()
  .catch((error) => {
    console.error(sanitiseIngestionError(error));
    process.exitCode = 1;
  })
  .finally(async () => disconnectPrisma());
