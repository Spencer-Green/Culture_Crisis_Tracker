import "dotenv/config";

import { fetchBroadwayBusinessDataset } from "../src/data-sources/theatre/broadway-business-api";
import { env } from "../src/lib/env";

async function main() {
  if (!env.BROADWAY_BUSINESS_BASE_URL)
    throw new Error("BROADWAY_BUSINESS_BASE_URL is not configured.");
  const dataset = await fetchBroadwayBusinessDataset(
    env.BROADWAY_BUSINESS_BASE_URL,
  );
  const first = dataset.records[0];
  const latest = dataset.latestPageWeek;
  console.log("Access classification: AUTHORIZED_STRUCTURED");
  console.log(
    "Retrieval: public embedded JSON + public aggregate JSON endpoint",
  );
  console.log(`Requests: ${dataset.requestCount}`);
  console.log(`Aggregate weeks: ${dataset.records.length}`);
  console.log(
    `Coverage: ${first.weekEnding.toISOString().slice(0, 10)} → ${latest.weekEnding.toISOString().slice(0, 10)}`,
  );
  console.log("Weekly fields: gross, attendance, capacity");
  console.log(
    "Current-page fields: shows, average ticket, performances, previews, show rows",
  );
  console.log(`Latest week: ${latest.weekEnding.toISOString().slice(0, 10)}`);
  console.log(`Latest gross: $${latest.grossUsd.toLocaleString("en-US")}`);
  console.log(
    `Latest attendance: ${latest.attendance.toLocaleString("en-US")}`,
  );
  console.log(`Latest shows: ${latest.showCount ?? "unavailable"}`);
  console.log(`Latest capacity: ${latest.capacityPct ?? "unavailable"}%`);
  console.log(
    `Rate limit: ${dataset.rateLimit.remaining ?? "unknown"}/${dataset.rateLimit.limit ?? "unknown"} remaining`,
  );
  console.log("Underlying statistics: The Broadway League");
  console.log(
    "Status: provisional/private research; reassess licensing before public deployment",
  );
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : "Inspection failed.");
  process.exitCode = 1;
});
