import "dotenv/config";

import { inspectStatCanTable } from "../src/data-sources/macro/statcan-inspection";
import { parseServerEnv } from "../src/lib/env-schema";

async function main() {
  const env = parseServerEnv(process.env);
  if (!env.STATCAN_BASE_URL) throw new Error("STATCAN_BASE_URL is required.");
  const inspection = await inspectStatCanTable(env.STATCAN_BASE_URL);
  console.log(`${inspection.tableNumber} / PID ${inspection.productId}`);
  console.log(`  ${inspection.title}`);
  console.log(
    `  Frequency: ${inspection.frequency}; geography: ${inspection.geography}`,
  );
  console.log(`  Latest release: ${inspection.releaseTime}`);
  console.log(
    `  Available quarters: ${inspection.firstQuarter} to ${inspection.latestQuarter}`,
  );
  console.log(
    `  Dimensions: ${inspection.dimensions.map((item) => `${item.position} ${item.name} (${item.members})`).join("; ")}`,
  );
  console.log(
    `  Prices: ${inspection.prices.map((item) => `${item.id} ${item.label}${item.terminated ? " [terminated]" : ""}`).join("; ")}`,
  );
  console.log(
    `  Seasonal adjustment: ${inspection.seasonalAdjustments.map((item) => `${item.id} ${item.label}`).join("; ")}`,
  );
  console.log(
    `  Unit/scalar: ${inspection.unit.label} (${inspection.unit.code}), ${inspection.scalar.label} (${inspection.scalar.code})`,
  );
  console.log("  Implemented metrics:");
  for (const metric of inspection.metrics) {
    console.log(
      `    ${metric.slug}: V${metric.vectorId}, ${metric.coordinate}`,
    );
    console.log(
      `      ${metric.category}; ${metric.price}; ${metric.seasonalAdjustment}`,
    );
    console.log(
      `      Quarters: ${metric.firstQuarter} to ${metric.latestQuarter}`,
    );
  }
  console.log("  Future cultural detail (current prices, not ingested):");
  for (const detail of inspection.culturalDetails) {
    console.log(
      `    ${detail.label}: member ${detail.memberId}, V${detail.vectorId}, ${detail.coordinate}`,
    );
  }
}

main().catch(() => {
  console.error(
    "Statistics Canada inspection failed. Review WDS configuration and API status.",
  );
  process.exitCode = 1;
});
