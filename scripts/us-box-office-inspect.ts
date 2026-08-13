import "dotenv/config";

import {
  downloadUSBoxOfficeArchive,
  fetchUSBoxOfficeMetadata,
} from "../src/data-sources/film/us-box-office-api";
import { parseUSBoxOfficeArchive } from "../src/data-sources/film/us-box-office-parser";
import {
  US_BOX_OFFICE_DATASET_SLUG,
  US_BOX_OFFICE_DATASET_TITLE,
  US_BOX_OFFICE_PROVENANCE,
} from "../src/data-sources/film/us-box-office-types";
import { parseServerEnv } from "../src/lib/env-schema";
import { sanitiseIngestionError } from "../src/services/ingestion/service-core";

async function main() {
  const env = parseServerEnv(process.env);
  const baseUrl = env.US_BOX_OFFICE_BASE_URL;
  const [metadata, archive] = await Promise.all([
    fetchUSBoxOfficeMetadata(baseUrl),
    downloadUSBoxOfficeArchive(baseUrl),
  ]);
  const parsed = parseUSBoxOfficeArchive(archive.bytes, { startYear: 1977 });
  const earliest = parsed.records[0];
  const latest = parsed.records.at(-1);
  console.log("US box-office dataset inspection");
  console.log("Persistence: disabled");
  console.log(`Dataset: ${US_BOX_OFFICE_DATASET_TITLE}`);
  console.log(`Slug: ${US_BOX_OFFICE_DATASET_SLUG}`);
  console.log("Access: public Kaggle API; authentication not required");
  console.log(`Underlying provenance: ${US_BOX_OFFICE_PROVENANCE}`);
  console.log(
    `Files: weekend_summary_1977.csv … ${parsed.fileNames.at(-1)} (${parsed.fileNames.length} annual CSV files)`,
  );
  console.log(`Columns: ${parsed.columns.join(", ")}`);
  console.log(
    "Date format: abbreviated month/day ranges; year supplied by annual file or label",
  );
  console.log(`Kaggle updated: ${metadata.lastUpdated.toISOString()}`);
  console.log(
    `Earliest populated weekend: ${earliest?.weekendEnd.toISOString().slice(0, 10)}`,
  );
  console.log(
    `Latest populated weekend: ${latest?.weekendEnd.toISOString().slice(0, 10)}`,
  );
  console.log(`Rows scanned: ${parsed.rawRows}`);
  console.log(
    `Alternate holiday summaries excluded: ${parsed.duplicateVariantsRemoved}`,
  );
  console.log(`Null-gross rows excluded: ${parsed.nullGrossRowsSkipped}`);
  console.log(`Future rows excluded: ${parsed.futureRowsSkipped}`);
  console.log(`Missing values: ${JSON.stringify(parsed.missingByField)}`);
  console.log("Representative latest records:");
  for (const record of parsed.records.slice(-3).reverse())
    console.log(
      `- ${record.sourceDateLabel}: $${record.totalGrossUsd.toLocaleString("en-US")} · ${record.topFilm ?? "top film unavailable"} · ${record.releaseCount ?? "release count unavailable"} releases`,
    );
}

main().catch((error) => {
  console.error(sanitiseIngestionError(error));
  process.exitCode = 1;
});
