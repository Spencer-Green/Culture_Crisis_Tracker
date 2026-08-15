import "dotenv/config";

import {
  parseBeaCliArguments,
  resolveBeaCliRange,
} from "../src/data-sources/macro/bea-cli";
import {
  getFullBeaAvailability,
  inspectBeaMetrics,
} from "../src/data-sources/macro/bea-inspection";
import { BEA_MUSIC_METRICS } from "../src/data-sources/macro/bea-metrics";
import { validateBeaMonthRange } from "../src/data-sources/macro/bea-period";
import { parseServerEnv } from "../src/lib/env-schema";
import { disconnectPrisma } from "../src/lib/prisma";
import { ingestSource } from "../src/services/ingestion";
import { sanitiseIngestionError } from "../src/services/ingestion/service-core";

async function main() {
  const arguments_ = process.argv.slice(2);
  const routine = arguments_.includes("--routine");
  const options = parseBeaCliArguments(
    arguments_.filter((argument) => argument !== "--routine"),
  );
  const allowedSlugs = new Set(BEA_MUSIC_METRICS.map((metric) => metric.slug));
  const metricSlugs = options.metricSlugs ?? [...allowedSlugs];
  for (const slug of metricSlugs) {
    if (!allowedSlugs.has(slug as (typeof BEA_MUSIC_METRICS)[number]["slug"])) {
      throw new Error(`BEA music metric "${slug}" is not supported.`);
    }
  }

  const env = parseServerEnv(process.env);
  if (!env.BEA_BASE_URL || !env.BEA_API_KEY) {
    throw new Error("BEA_BASE_URL and BEA_API_KEY are required.");
  }
  const inspections = await inspectBeaMetrics(
    env.BEA_BASE_URL,
    env.BEA_API_KEY,
    {
      metrics: BEA_MUSIC_METRICS.filter((metric) =>
        metricSlugs.includes(metric.slug),
      ),
    },
  );
  const availability = getFullBeaAvailability(inspections);
  const range =
    options.startPeriod && options.endPeriod
      ? validateBeaMonthRange(options.startPeriod, options.endPeriod)
      : !routine && !options.startPeriod && !options.endPeriod
        ? validateBeaMonthRange(
            availability.earliestPeriod,
            availability.latestPeriod,
          )
        : resolveBeaCliRange(options, availability);

  console.log(
    "Source: BEA detailed monthly personal consumption expenditures for recorded music",
  );
  console.log(`Range: ${range.startPeriod} to ${range.endPeriod}`);
  const result = await ingestSource({
    sourceSlug: "bea",
    startDate: range.startDate,
    endDate: range.endDate,
    startPeriod: range.startPeriod,
    endPeriod: range.endPeriod,
    metricSlugs,
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
