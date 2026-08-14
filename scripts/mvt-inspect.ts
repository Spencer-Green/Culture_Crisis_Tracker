import "dotenv/config";

import { parseMVTCli } from "../src/data-sources/music/mvt-cli";
import { inspectMVT } from "../src/services/music/mvt-ingestion";
import { sanitiseIngestionError } from "../src/services/ingestion/service-core";

async function main() {
  const options = parseMVTCli(process.argv.slice(2));
  const result = await inspectMVT(options.year);
  console.log("Source: Music Venue Trust");
  console.log("Access: OFFICIAL_DOWNLOAD");
  console.log("Scope: UK grassroots music venues / Music Venues Alliance");
  for (const inspection of result.inspections) {
    const report = result.reports.find(
      (value) => value.year === inspection.year,
    )!;
    console.log(`\n${inspection.year} annual report`);
    console.log(`Reachable: ${inspection.reachable ? "yes" : "no"}`);
    console.log(`HTTP status: ${inspection.httpStatus}`);
    console.log(`Content type: ${inspection.contentType ?? "unknown"}`);
    console.log(`Fields: ${inspection.fields.join(", ")}`);
    console.log(`Venues: ${report.venueCount ?? "unavailable"}`);
    console.log(
      `Permanent closures: ${report.permanentClosures ?? "unavailable"}`,
    );
    console.log(`Events: ${report.eventCount ?? "unavailable"}`);
    console.log(`Employment: ${report.employment ?? "unavailable"}`);
  }
}

main().catch((error) => {
  console.error(sanitiseIngestionError(error));
  process.exitCode = 1;
});
