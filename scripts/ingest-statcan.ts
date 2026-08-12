import "dotenv/config";

import {
  parseStatCanCliArguments,
  resolveStatCanCliRange,
  validateStatCanMetricSlugs,
} from "../src/data-sources/macro/statcan-cli";
import { disconnectPrisma } from "../src/lib/prisma";
import { ingestSource } from "../src/services/ingestion";
import { sanitiseIngestionError } from "../src/services/ingestion/service-core";

async function main() {
  const options = parseStatCanCliArguments(process.argv.slice(2));
  validateStatCanMetricSlugs(options.metricSlugs);
  const range = resolveStatCanCliRange(options);
  console.log("Source: Statistics Canada");
  console.log(`Requested range: ${range.startQuarter} to ${range.endQuarter}`);
  const result = await ingestSource({
    sourceSlug: "statcan",
    startDate: range.startDate,
    endDate: range.endDate,
    startPeriod: range.startQuarter,
    endPeriod: range.endQuarter,
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
