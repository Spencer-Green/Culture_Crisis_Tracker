import "dotenv/config";

import {
  parseFredCliArguments,
  resolveFredCliRange,
} from "../src/data-sources/macro/fred-cli";
import { inspectFredSeries } from "../src/data-sources/macro/fred-inspection";
import { validateFredDateRange } from "../src/data-sources/macro/fred-period";
import { parseServerEnv } from "../src/lib/env-schema";
import { disconnectPrisma } from "../src/lib/prisma";
import { ingestSource } from "../src/services/ingestion";
import { sanitiseIngestionError } from "../src/services/ingestion/service-core";

async function main() {
  const options = parseFredCliArguments(process.argv.slice(2));
  const env = parseServerEnv(process.env);
  if (!env.FRED_BASE_URL || !env.FRED_API_KEY) {
    throw new Error("FRED_BASE_URL and FRED_API_KEY are required.");
  }
  const range =
    options.startDate && options.endDate
      ? validateFredDateRange(options.startDate, options.endDate)
      : resolveFredCliRange(
          options,
          (await inspectFredSeries(env.FRED_BASE_URL, env.FRED_API_KEY)).reduce(
            (latest, item) =>
              item.observationEnd > latest ? item.observationEnd : latest,
            "0000-01-01",
          ),
        );

  console.log(
    "Source: FRED US consumer credit, credit-card stress, and normalization inputs",
  );
  console.log(`Range: ${range.startPeriod} to ${range.endPeriod}`);
  const result = await ingestSource({
    sourceSlug: "fred",
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
