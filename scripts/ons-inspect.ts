import "dotenv/config";

import { inspectOnsSeries } from "../src/data-sources/macro/ons-inspection";
import { parseServerEnv } from "../src/lib/env-schema";

const env = parseServerEnv(process.env);

async function main() {
  if (!env.ONS_BASE_URL) {
    throw new Error("ONS_BASE_URL is required for ONS inspection.");
  }

  const inspected = await inspectOnsSeries(env.ONS_BASE_URL);
  console.log("ONS Consumer Trends time series (CT)");

  for (const item of inspected) {
    console.log(`\nCDID: ${item.summary.cdid}`);
    console.log(`Title: ${item.summary.title}`);
    console.log(`Dataset: ${item.summary.datasetId}`);
    console.log(`Edition: ${item.series.edition ?? "Not supplied"}`);
    console.log(`URI: ${item.summary.uri}`);
    console.log(`Units: ${item.summary.unit}`);
    console.log(
      `Available frequencies: quarterly (${item.summary.quarterlyObservationCount}), annual (${item.summary.annualObservationCount})`,
    );
    console.log(
      `Latest release: ${item.summary.releaseDate ?? "Not supplied"}`,
    );
    console.log(`Next release: ${item.summary.nextRelease ?? "Not supplied"}`);
    console.log(
      `Latest available quarter: ${item.summary.latestQuarter ?? "Not supplied"}`,
    );
    console.log(
      `Earliest available quarter: ${item.summary.earliestQuarter ?? "Not supplied"}`,
    );
    console.log(
      `Quarterly observation count: ${item.summary.quarterlyObservationCount}`,
    );
  }
}

main().catch(() => {
  console.error(
    "ONS inspection failed. Check connectivity and the configured public v1 base URL.",
  );
  process.exitCode = 1;
});
