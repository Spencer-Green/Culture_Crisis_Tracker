import "dotenv/config";

import { parseTicketmasterCliArguments } from "../src/data-sources/entertainment/ticketmaster-cli";
import { disconnectPrisma } from "../src/lib/prisma";
import { ingestTicketmaster } from "../src/services/industry-events/ticketmaster-ingestion";
import { sanitiseIngestionError } from "../src/services/ingestion/service-core";

function distribution(label: string, values: Record<string, number>) {
  console.log(
    `${label}: ${
      Object.entries(values)
        .map(([name, count]) => `${name}=${count}`)
        .join(", ") || "none"
    }`,
  );
}

async function main() {
  const options = parseTicketmasterCliArguments(process.argv.slice(2));
  console.log("Source: Ticketmaster Discovery API v2");
  console.log(`Forward window: ${options.days} days`);
  console.log(`Country filter: ${options.countryCode ?? "AU, US, GB, CA"}`);
  console.log(
    `Segment filter: ${options.segmentSlug ?? "music, arts-theatre, film"}`,
  );
  const result = await ingestTicketmaster(options);
  console.log(
    `Range: ${result.startDate} to ${result.endDateExclusive} (exclusive)`,
  );
  console.log(`API calls: ${result.apiCalls}`);
  console.log(`Date windows queried: ${result.windowsQueried}`);
  console.log(`Automatic window splits: ${result.windowsSplit}`);
  console.log(`Records returned: ${result.recordsReturned}`);
  console.log(`Outside-window records removed: ${result.outsideWindowRemoved}`);
  console.log(
    `Dense-window probe records discarded before splitting: ${result.splitProbeRecordsDiscarded}`,
  );
  console.log(`Unique events: ${result.uniqueEvents}`);
  console.log(`Duplicates removed: ${result.duplicatesRemoved}`);
  console.log(`Created: ${result.recordsCreated}`);
  console.log(`Updated: ${result.recordsUpdated}`);
  console.log(`Status changes observed: ${result.statusChanges}`);
  console.log(`Unique venues: ${result.uniqueVenues}`);
  console.log(`Events with price ranges: ${result.priceRangeEvents}`);
  distribution("Countries", result.countryDistribution);
  distribution("Segments", result.segmentDistribution);
  distribution("Statuses", result.statusDistribution);
  console.log(
    `Daily quota remaining: ${result.dailyQuotaRemaining ?? "not exposed"}`,
  );
  console.log(`Duration: ${result.durationMs}ms`);
}

main()
  .catch((error) => {
    console.error(sanitiseIngestionError(error));
    process.exitCode = 1;
  })
  .finally(async () => disconnectPrisma());
