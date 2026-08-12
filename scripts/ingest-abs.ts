import "dotenv/config";

import { parseAbsCliArguments } from "../src/data-sources/macro/abs-cli";
import { ABS_MONTHLY_METRICS } from "../src/data-sources/macro/abs-metrics";
import { validateAbsPeriodRange } from "../src/data-sources/macro/abs-period";
import { disconnectPrisma } from "../src/lib/prisma";
import { ingestSource } from "../src/services/ingestion";
import { sanitiseIngestionError } from "../src/services/ingestion/service-core";

async function main() {
  const options = parseAbsCliArguments(process.argv.slice(2));
  const range = validateAbsPeriodRange(options.startPeriod, options.endPeriod);
  const metricSlugs =
    options.metricSlugs ?? ABS_MONTHLY_METRICS.map((metric) => metric.slug);

  console.log("Source: ABS Monthly Household Spending Indicator (HSI_M)");
  console.log(`Period: ${range.startPeriod} to ${range.endPeriod}`);

  const result = await ingestSource({
    sourceSlug: "abs",
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
  .finally(async () => {
    await disconnectPrisma();
  });
