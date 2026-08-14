import "dotenv/config";

import { inspectBeaMetrics } from "../src/data-sources/macro/bea-inspection";
import { BEA_MUSIC_METRICS } from "../src/data-sources/macro/bea-metrics";
import { parseServerEnv } from "../src/lib/env-schema";

async function main() {
  const env = parseServerEnv(process.env);
  if (!env.BEA_BASE_URL || !env.BEA_API_KEY) {
    throw new Error("BEA_BASE_URL and BEA_API_KEY are required.");
  }
  const metrics = await inspectBeaMetrics(env.BEA_BASE_URL, env.BEA_API_KEY, {
    metrics: BEA_MUSIC_METRICS,
  });
  for (const metric of metrics) {
    console.log(`${metric.lineDescription} (${metric.seriesCode})`);
    console.log(`  Dataset: ${metric.dataset}`);
    console.log(`  Table: ${metric.tableName} — ${metric.tableTitle}`);
    console.log(`  Line: ${metric.lineNumber} — ${metric.lineDescription}`);
    console.log(`  Frequency: ${metric.frequency}`);
    console.log(`  Unit: ${metric.unit}`);
    console.log(`  Adjustment: ${metric.adjustment}`);
    console.log(
      `  Available: ${metric.firstAvailablePeriod} (${metric.firstValue}) to ${metric.latestAvailablePeriod} (${metric.latestValue})`,
    );
  }
}

main().catch(() => {
  console.error(
    "BEA music inspection failed. Review configuration and API status.",
  );
  process.exitCode = 1;
});
