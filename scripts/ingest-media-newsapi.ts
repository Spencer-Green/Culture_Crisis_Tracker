import "dotenv/config";

import {
  parseNewsApiCli,
  mediaWindow,
} from "../src/data-sources/news/media-cli";
import { disconnectPrisma } from "../src/lib/prisma";
import { sanitiseIngestionError } from "../src/services/ingestion/service-core";
import { ingestTheNewsApi } from "../src/services/media/media-ingestion";

async function main() {
  const options = parseNewsApiCli(process.argv.slice(2));
  const window = mediaWindow(options.hours);
  const result = await ingestTheNewsApi({ ...options, ...window });
  console.log(`Source: TheNewsAPI`);
  console.log(`Window: ${options.hours} hours`);
  console.log(`Requests used: ${result.requestsUsed}`);
  console.log(`Query families: ${result.queryFamilies.join(", ")}`);
  console.log(`Articles returned: ${result.articlesReturned}`);
  console.log(`Canonical duplicates: ${result.canonicalDuplicates}`);
  console.log(`Created: ${result.created}`);
  console.log(`Updated: ${result.updated}`);
  console.log(`Cross-source matches: ${result.crossSourceMatches}`);
  console.log(`Sectors: ${JSON.stringify(result.sectorDistribution)}`);
  console.log(`Themes: ${JSON.stringify(result.eventTypeDistribution)}`);
  console.log(`Polarity: ${JSON.stringify(result.polarityDistribution)}`);
  console.log(`AI impacts: ${JSON.stringify(result.aiImpactDistribution)}`);
  console.log(`Importance: ${JSON.stringify(result.importanceDistribution)}`);
  console.log(`Duration: ${result.durationMs}ms`);
}

main()
  .catch((error) => {
    console.error(sanitiseIngestionError(error));
    process.exitCode = 1;
  })
  .finally(disconnectPrisma);
