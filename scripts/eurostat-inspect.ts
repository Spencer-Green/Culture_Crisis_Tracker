import "dotenv/config";

import { inspectEurostatDataset } from "../src/data-sources/macro/eurostat-inspection";
import { parseServerEnv } from "../src/lib/env-schema";

async function main() {
  const env = parseServerEnv(process.env);
  if (!env.EUROSTAT_BASE_URL) {
    throw new Error("EUROSTAT_BASE_URL is required.");
  }
  const inspection = await inspectEurostatDataset(env.EUROSTAT_BASE_URL);
  console.log(`${inspection.datasetCode} — ${inspection.datasetTitle}`);
  console.log(`  Dimension order: ${inspection.dimensionOrder.join(" → ")}`);
  console.log(
    `  Dimensions: ${inspection.dimensions.map((item) => `${item.id} (${item.label}, ${item.size})`).join("; ")}`,
  );
  console.log(
    `  Frequency: ${inspection.frequency.code} — ${inspection.frequency.label}`,
  );
  console.log(
    `  Available target years: ${inspection.firstAvailableYear} to ${inspection.latestAvailableYear}`,
  );
  console.log(
    `  EU aggregates: ${inspection.euAggregateCodes.map((item) => `${item.code} (${item.label})`).join("; ")}`,
  );
  console.log(
    `  Member-state coverage (${inspection.memberStates.length}): ${inspection.memberStates.map((item) => item.code).join(", ")}`,
  );
  console.log(
    `  Geography codes returned: ${inspection.geographyCodes.length}`,
  );
  console.log(
    `  Target purposes: ${inspection.purposeCodes
      .filter((item) => item.code === "TOTAL" || item.code === "CP09")
      .map((item) => `${item.code} (${item.label})`)
      .join("; ")}`,
  );
  console.log(
    `  Price/volume units: ${inspection.unitCodes
      .filter((item) => item.code === "CP_MEUR" || item.code === "CLV20_MEUR")
      .map((item) => `${item.code} (${item.label})`)
      .join("; ")}`,
  );
  for (const metric of inspection.metrics) {
    console.log(`  ${metric.slug}`);
    console.log(
      `    ${metric.coicopCode} — ${metric.coicopLabel}; ${metric.unitCode} — ${metric.unitLabel}`,
    );
    console.log(`    Years: ${metric.firstYear} to ${metric.latestYear}`);
  }
}

main().catch(() => {
  console.error(
    "Eurostat inspection failed. Review configuration and API status.",
  );
  process.exitCode = 1;
});
