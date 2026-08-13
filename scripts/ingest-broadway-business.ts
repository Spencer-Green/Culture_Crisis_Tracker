import "dotenv/config";

import { disconnectPrisma } from "../src/lib/prisma";
import { sanitiseIngestionError } from "../src/services/ingestion/service-core";
import { ingestBroadwayBusiness } from "../src/services/theatre/broadway-business-ingestion";

function parseSince(args: string[]): Date {
  const value = args.find((arg) => arg.startsWith("--since="))?.slice(8);
  const normalized = value?.match(/^\d{4}$/) ? `${value}-01-01` : value;
  const candidate =
    normalized ??
    new Date(Date.now() - 91 * 86_400_000).toISOString().slice(0, 10);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(candidate))
    throw new Error("--since must be YYYY or YYYY-MM-DD.");
  const date = new Date(`${candidate}T00:00:00.000Z`);
  if (Number.isNaN(date.getTime())) throw new Error("--since is invalid.");
  return date;
}

async function main() {
  const result = await ingestBroadwayBusiness(
    parseSince(process.argv.slice(2)),
  );
  console.log("Source: Broadway Business");
  console.log("Underlying statistics: The Broadway League");
  console.log("Access: authorized public structured endpoint");
  console.log(`Range: ${result.earliestWeek} → ${result.latestWeek}`);
  console.log(`Rows read: ${result.rowsRead}`);
  console.log(`Weeks selected: ${result.weeksSelected}`);
  console.log(`Created: ${result.created}`);
  console.log(`Updated: ${result.updated}`);
  console.log(`Requests: ${result.requestCount}`);
  console.log(`Duration: ${result.durationMs}ms`);
}

main()
  .catch((error) => {
    console.error(sanitiseIngestionError(error));
    process.exitCode = 1;
  })
  .finally(disconnectPrisma);
