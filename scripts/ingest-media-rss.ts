import "dotenv/config";

import { parseRssCli, mediaWindow } from "../src/data-sources/news/media-cli";
import { disconnectPrisma } from "../src/lib/prisma";
import { sanitiseIngestionError } from "../src/services/ingestion/service-core";
import { ingestRss } from "../src/services/media/media-ingestion";

async function main() {
  const options = parseRssCli(process.argv.slice(2));
  const { startDate } = mediaWindow(options.hours);
  const result = await ingestRss({ ...options, startDate });
  console.log(`Source: Curated RSS`);
  console.log(`Window: ${options.hours} hours`);
  console.log(`Feeds attempted: ${result.feedsAttempted}`);
  console.log(`Feeds succeeded: ${result.feedsSucceeded}`);
  console.log(
    `Feed failures: ${result.feedFailures.map((item) => item.slug).join(", ") || "none"}`,
  );
  console.log(`Entries read: ${result.entriesRead}`);
  console.log(`Entries accepted: ${result.entriesAccepted}`);
  console.log(`Entries skipped: ${result.entriesSkipped}`);
  console.log(`Canonical duplicates: ${result.canonicalDuplicates}`);
  console.log(`Created: ${result.created}`);
  console.log(`Updated: ${result.updated}`);
  console.log(`Cross-source matches: ${result.crossSourceMatches}`);
  console.log(`Sectors: ${JSON.stringify(result.sectorDistribution)}`);
  console.log(`Themes: ${JSON.stringify(result.eventTypeDistribution)}`);
  console.log(`AI impacts: ${JSON.stringify(result.aiImpactDistribution)}`);
  console.log(`Latest publication: ${result.latestPublicationDate ?? "none"}`);
  console.log(`Duration: ${result.durationMs}ms`);
}

main()
  .catch((error) => {
    console.error(sanitiseIngestionError(error));
    process.exitCode = 1;
  })
  .finally(disconnectPrisma);
