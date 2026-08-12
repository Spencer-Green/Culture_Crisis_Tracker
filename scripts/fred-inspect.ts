import "dotenv/config";

import { inspectFredSeries } from "../src/data-sources/macro/fred-inspection";
import { parseServerEnv } from "../src/lib/env-schema";

async function main() {
  const env = parseServerEnv(process.env);
  if (!env.FRED_BASE_URL || !env.FRED_API_KEY) {
    throw new Error("FRED_BASE_URL and FRED_API_KEY are required.");
  }
  const series = await inspectFredSeries(env.FRED_BASE_URL, env.FRED_API_KEY);
  for (const item of series) {
    console.log(`${item.seriesId} — ${item.title}`);
    console.log(`  Source: ${item.source}`);
    console.log(`  Release: ${item.release}`);
    console.log(`  Units: ${item.units}`);
    console.log(`  Seasonal adjustment: ${item.seasonalAdjustment}`);
    console.log(`  Frequency: ${item.frequency}`);
    console.log(
      `  Observations: ${item.observationStart} to ${item.observationEnd}`,
    );
    console.log(`  Last updated: ${item.lastUpdated}`);
    console.log(`  Notes: ${item.notesSummary}`);
  }
}

main().catch(() => {
  console.error("FRED inspection failed. Review configuration and API status.");
  process.exitCode = 1;
});
