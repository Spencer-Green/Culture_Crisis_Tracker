import "dotenv/config";

import { parseBFICli } from "../src/data-sources/film/bfi-cli";
import { disconnectPrisma } from "../src/lib/prisma";
import { ingestBFI } from "../src/services/film/bfi-ingestion";
import { sanitiseIngestionError } from "../src/services/ingestion/service-core";

async function main() {
  const options = parseBFICli(process.argv.slice(2));
  const result = await ingestBFI(options.sinceYear);
  console.log("Source: British Film Institute");
  console.log(`Range: ${result.earliestWeekend} → ${result.latestWeekend}`);
  console.log(
    `Files discovered/parsed: ${result.filesDiscovered}/${result.filesParsed}`,
  );
  console.log(
    `Weekly created/updated: ${result.weeklyCreated}/${result.weeklyUpdated}`,
  );
  console.log(
    `Structural created/updated: ${result.structuralCreated}/${result.structuralUpdated}`,
  );
  console.log(`Skipped files: ${result.filesSkipped.length}`);
  console.log(`Duration: ${result.durationMs}ms`);
}

main()
  .catch((error) => {
    console.error(sanitiseIngestionError(error));
    process.exitCode = 1;
  })
  .finally(disconnectPrisma);
