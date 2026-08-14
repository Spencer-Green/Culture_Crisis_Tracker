import "dotenv/config";

import { inspectBFI } from "../src/services/film/bfi-ingestion";
import { sanitiseIngestionError } from "../src/services/ingestion/service-core";

async function main() {
  const inspection = await inspectBFI(2019);
  console.log("Source: British Film Institute");
  console.log("Weekly dataset: Weekend box office figures");
  for (const coverage of inspection.weeklyCoverage)
    console.log(
      `${coverage.year}: ${coverage.reports} reports (${coverage.formats.join(", ") || "none"})`,
    );
  console.log(`Reports discovered: ${inspection.weeklyReports}`);
  console.log(
    `Earliest file: ${inspection.earliestReport?.fileName ?? "Unavailable"}`,
  );
  console.log(
    `Latest file: ${inspection.latestReport?.fileName ?? "Unavailable"}`,
  );
  if (inspection.latestWeekend) {
    console.log(`Latest weekend: ${inspection.latestWeekend.sourceDateLabel}`);
    console.log(
      `Reported gross: £${inspection.latestWeekend.reportedGrossGbp.toLocaleString("en-GB")}`,
    );
    console.log(
      `Top-15 gross: £${inspection.latestWeekend.top15GrossGbp.toLocaleString("en-GB")}`,
    );
    console.log(`Reported releases: ${inspection.latestWeekend.releaseCount}`);
    console.log(
      `#1 film: ${inspection.latestWeekend.topFilm ?? "Unavailable"}`,
    );
  }
  console.log(
    `Structural box-office file: ${inspection.structuralFiles.boxOffice.fileName}`,
  );
  console.log(
    `Structural production file: ${inspection.structuralFiles.production.fileName}`,
  );
  console.log(
    `Structural years: ${inspection.structuralYears[0]?.year ?? "Unavailable"} → ${inspection.structuralYears.at(-1)?.year ?? "Unavailable"}`,
  );
}

main().catch((error) => {
  console.error(sanitiseIngestionError(error));
  process.exitCode = 1;
});
