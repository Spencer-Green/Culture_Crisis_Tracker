import "dotenv/config";

import { disconnectPrisma } from "@/lib/prisma";
import { ingestLPA } from "@/services/theatre/lpa-ingestion";

function parseSince() {
  const argument = process.argv
    .slice(2)
    .find((value) => value.startsWith("--since="));
  if (!argument) return undefined;
  const value = Number(argument.slice("--since=".length));
  if (!Number.isInteger(value))
    throw new Error("--since must be a calendar year.");
  return value;
}

async function main() {
  const result = await ingestLPA(parseSince());
  console.log("Live Performance Australia ingestion");
  console.log(`Report: ${result.reportTitle}`);
  console.log(`Source: ${result.reportUrl}`);
  console.log(`Requests: ${result.requestCount}`);
  console.log(`Range: ${result.years[0]}-${result.years.at(-1)}`);
  console.log(`Records read: ${result.recordsRead}`);
  console.log(`Created: ${result.recordsCreated}`);
  console.log(`Updated: ${result.recordsUpdated}`);
  console.log(`Missing years: ${result.missingYears.join(", ") || "none"}`);
  console.log(`Missing required values: ${result.missingValues}`);
  console.log(`Duration: ${result.durationMs}ms`);
}

main()
  .catch((error) => {
    console.error(
      error instanceof Error ? error.message : "LPA ingestion failed.",
    );
    process.exitCode = 1;
  })
  .finally(disconnectPrisma);
