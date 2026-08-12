import "dotenv/config";

import {
  parseEurostatCliArguments,
  resolveEurostatCliRange,
  validateEurostatMetricSlugs,
} from "../src/data-sources/macro/eurostat-cli";
import { disconnectPrisma } from "../src/lib/prisma";
import { ingestSource } from "../src/services/ingestion";
import { sanitiseIngestionError } from "../src/services/ingestion/service-core";

async function main() {
  const options = parseEurostatCliArguments(process.argv.slice(2));
  validateEurostatMetricSlugs(options.metricSlugs);
  const range = resolveEurostatCliRange(options);
  console.log("Source: EU Structural Benchmark (Eurostat)");
  console.log(`Year range: ${range.startYear} to ${range.endYear}`);
  const result = await ingestSource({
    sourceSlug: "eurostat",
    startDate: range.startDate,
    endDate: range.endDate,
    startPeriod: range.startYear,
    endPeriod: range.endYear,
    metricSlugs: options.metricSlugs,
  });
  console.log(`Metrics processed: ${result.metricsProcessed.join(", ")}`);
  console.log(`Records read: ${result.recordsRead}`);
  console.log(`Records created: ${result.recordsCreated}`);
  console.log(`Records updated: ${result.recordsUpdated}`);
  console.log(`Duration: ${result.durationMs}ms`);
}

main()
  .catch((error) => {
    console.error(sanitiseIngestionError(error));
    process.exitCode = 1;
  })
  .finally(async () => disconnectPrisma());
