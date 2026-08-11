import "dotenv/config";

import {
  fetchAbsStructureMetadata,
  validateAbsMetricMappings,
} from "../src/data-sources/macro/abs-metadata";
import {
  ABS_DATAFLOW,
  ABS_METRICS,
  getAbsDataKey,
} from "../src/data-sources/macro/abs-metrics";
import { parseServerEnv } from "../src/lib/env-schema";

const env = parseServerEnv(process.env);

function printCodes(
  title: string,
  codelistId: string,
  metadata: Awaited<ReturnType<typeof fetchAbsStructureMetadata>>,
  filter?: ReadonlySet<string>,
) {
  const codes = (metadata.codelists[codelistId] ?? []).filter(
    (item) => !filter || filter.has(item.code),
  );
  console.log(`\n${title} (${codelistId})`);
  for (const item of codes) {
    console.log(`  ${item.code.padEnd(5)} ${item.label}`);
  }
}

async function main() {
  if (!env.ABS_BASE_URL) {
    throw new Error("ABS_BASE_URL is required for metadata inspection.");
  }

  const metadata = await fetchAbsStructureMetadata(env.ABS_BASE_URL);
  const issues = validateAbsMetricMappings(metadata);

  console.log("ABS Monthly Household Spending Indicator");
  console.log(`  Dataflow: ${metadata.dataflow.id}`);
  console.log(`  Label: ${metadata.dataflow.label}`);
  console.log(`  Agency: ${metadata.dataflow.agency}`);
  console.log(`  Version: ${metadata.dataflow.version}`);
  if (metadata.dataflow.description) {
    console.log(`  Description: ${metadata.dataflow.description}`);
  }
  const dataflowFlags = metadata.dataflow.annotations
    .filter((annotation) => annotation.type)
    .map(
      (annotation) =>
        `${annotation.type}=${annotation.text ?? annotation.title ?? "true"}`,
    );
  if (dataflowFlags.length > 0) {
    console.log(`  Annotations: ${dataflowFlags.join(", ")}`);
  }
  console.log(
    `  Available periods: ${metadata.availability.startPeriod ?? "unknown"} to ${metadata.availability.endPeriod ?? "unknown"}`,
  );

  console.log("\nDimension order");
  for (const dimension of metadata.dimensions) {
    console.log(
      `  ${dimension.position}: ${dimension.id}${dimension.codelistId ? ` (${dimension.codelistId})` : ""}`,
    );
  }

  console.log("\nCodelists");
  for (const [id, codes] of Object.entries(metadata.codelists)) {
    console.log(`  ${id}: ${codes.length} codes`);
  }

  printCodes("Measures", "CL_HSI_MEASURE", metadata);
  printCodes("Expenditure categories", "CL_HSI_CATEGORY", metadata);
  printCodes("Price adjustment", "CL_PRICE_ADJUSTMENT", metadata);
  printCodes("Adjustment type", "CL_TSEST", metadata);
  printCodes("Geography", "CL_STATE", metadata);
  printCodes("Frequency", "CL_FREQ", metadata);
  printCodes(
    "Units used by implemented metrics",
    "CL_UNIT_MEASURE",
    metadata,
    new Set(["AUD", "PCT"]),
  );
  printCodes(
    "Multipliers used by implemented metrics",
    "CL_UNIT_MULT",
    metadata,
    new Set(["0", "6"]),
  );

  console.log("\nImplemented metric mappings");
  for (const metric of ABS_METRICS) {
    console.log(`  ${metric.slug}`);
    console.log(`    ${metric.name}`);
    console.log(
      `    ${ABS_DATAFLOW.agency},${ABS_DATAFLOW.id},${ABS_DATAFLOW.version}/${getAbsDataKey(metric)}`,
    );
    console.log(
      `    Unit: ${metric.unitMetadata.code} (${metric.unitMetadata.label}), multiplier ${metric.unitMetadata.multiplierCode} (${metric.unitMetadata.multiplierLabel})`,
    );
  }

  if (issues.length > 0) {
    console.error("\nMapping validation failed:");
    for (const issue of issues) {
      console.error(`  - ${issue}`);
    }
    process.exitCode = 1;
    return;
  }

  console.log("\nAll implemented mappings match current ABS metadata.");
}

main().catch(() => {
  console.error(
    "ABS metadata inspection failed. Check connectivity and the configured public base URL.",
  );
  process.exitCode = 1;
});
