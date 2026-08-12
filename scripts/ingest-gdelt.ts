import "dotenv/config";

import { parseGdeltCliArguments } from "../src/data-sources/news/gdelt-cli";
import { disconnectPrisma } from "../src/lib/prisma";
import { ingestGdelt } from "../src/services/industry-events/gdelt-ingestion";
import { sanitiseIngestionError } from "../src/services/ingestion/service-core";

function printDistribution(label: string, values: Record<string, number>) {
  console.log(
    `${label}: ${
      Object.entries(values)
        .map(([name, count]) => `${name}=${count}`)
        .join(", ") || "none"
    }`,
  );
}

async function main() {
  const options = parseGdeltCliArguments(process.argv.slice(2));
  console.log("Source: GDELT DOC 2.0");
  console.log(
    `Window: last ${options.days} day${options.days === 1 ? "" : "s"}`,
  );
  const result = await ingestGdelt(options);
  console.log(`Search range: ${result.startDate} to ${result.endDate}`);
  console.log(`Query families: ${result.queryFamilies.join(", ")}`);
  console.log(`Articles returned: ${result.articlesReturned}`);
  console.log(
    `Exact article duplicates removed: ${result.exactDuplicatesRemoved}`,
  );
  console.log(`Overlapping candidates: ${result.overlappingCandidates}`);
  console.log(`Candidates classified: ${result.candidatesClassified}`);
  console.log(
    `Confidence: high=${result.highConfidence}, medium=${result.mediumConfidence}, low=${result.lowConfidence}`,
  );
  console.log(
    `Polarity: negative=${result.negative}, positive=${result.positive}, ambiguous=${result.ambiguous}`,
  );
  printDistribution("Countries", result.countryDistribution);
  printDistribution("Sectors", result.sectorDistribution);
  printDistribution("Event types", result.eventTypeDistribution);
  console.log(`Created: ${result.recordsCreated}`);
  console.log(`Updated: ${result.recordsUpdated}`);
  console.log(`Duration: ${result.durationMs}ms`);
}

main()
  .catch((error) => {
    console.error(sanitiseIngestionError(error));
    process.exitCode = 1;
  })
  .finally(async () => disconnectPrisma());
