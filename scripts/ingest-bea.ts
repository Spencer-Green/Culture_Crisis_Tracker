import "dotenv/config";

import {
  parseBeaCliArguments,
  resolveBeaCliRange,
} from "../src/data-sources/macro/bea-cli";
import {
  getCommonBeaAvailability,
  inspectBeaMetrics,
} from "../src/data-sources/macro/bea-inspection";
import { validateBeaMonthRange } from "../src/data-sources/macro/bea-period";
import { parseServerEnv } from "../src/lib/env-schema";
import { disconnectPrisma } from "../src/lib/prisma";
import { ingestSource } from "../src/services/ingestion";
import { sanitiseIngestionError } from "../src/services/ingestion/service-core";

async function main() {
  const options = parseBeaCliArguments(process.argv.slice(2));
  const env = parseServerEnv(process.env);
  if (!env.BEA_BASE_URL || !env.BEA_API_KEY) {
    throw new Error("BEA_BASE_URL and BEA_API_KEY are required.");
  }
  const range =
    options.startPeriod && options.endPeriod
      ? validateBeaMonthRange(options.startPeriod, options.endPeriod)
      : resolveBeaCliRange(
          options,
          getCommonBeaAvailability(
            await inspectBeaMetrics(env.BEA_BASE_URL, env.BEA_API_KEY),
          ),
        );

  console.log("Source: BEA NIPA monthly personal consumption expenditures");
  console.log(`Range: ${range.startPeriod} to ${range.endPeriod}`);
  const result = await ingestSource({
    sourceSlug: "bea",
    startDate: range.startDate,
    endDate: range.endDate,
    startPeriod: range.startPeriod,
    endPeriod: range.endPeriod,
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
