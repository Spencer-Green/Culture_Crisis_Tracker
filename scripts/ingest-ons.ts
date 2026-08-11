import "dotenv/config";

import {
  parseOnsCliArguments,
  resolveOnsCliRange,
} from "../src/data-sources/macro/ons-cli";
import {
  getCommonOnsAvailability,
  inspectOnsSeries,
} from "../src/data-sources/macro/ons-inspection";
import { validateOnsQuarterRange } from "../src/data-sources/macro/ons-period";
import { parseServerEnv } from "../src/lib/env-schema";
import { disconnectPrisma } from "../src/lib/prisma";
import { ingestSource } from "../src/services/ingestion";
import { sanitiseIngestionError } from "../src/services/ingestion/service-core";

async function main() {
  const options = parseOnsCliArguments(process.argv.slice(2));
  const env = parseServerEnv(process.env);
  if (!env.ONS_BASE_URL) {
    throw new Error("ONS_BASE_URL is required for ONS ingestion.");
  }

  const range =
    options.startQuarter && options.endQuarter
      ? validateOnsQuarterRange(options.startQuarter, options.endQuarter)
      : resolveOnsCliRange(
          options,
          getCommonOnsAvailability(await inspectOnsSeries(env.ONS_BASE_URL)),
        );

  console.log("Source: ONS Consumer Trends time series (CT)");
  console.log(`Quarter range: ${range.startQuarter} to ${range.endQuarter}`);

  const result = await ingestSource({
    sourceSlug: "ons",
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
  .finally(async () => {
    await disconnectPrisma();
  });
