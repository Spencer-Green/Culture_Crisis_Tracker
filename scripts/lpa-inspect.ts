import "dotenv/config";

import { disconnectPrisma } from "@/lib/prisma";
import { inspectLPAPerformance } from "@/services/theatre/lpa-ingestion";

async function main() {
  const inspection = await inspectLPAPerformance();
  const representative = inspection.records.filter(
    (record) => record.year === inspection.latestYear,
  );
  console.log("Live Performance Australia inspection");
  console.log(`Access classification: ${inspection.accessClassification}`);
  console.log(`Archive: ${inspection.archiveUrl}`);
  console.log(
    `Latest report: ${inspection.report.title} (${inspection.report.reportYear})`,
  );
  console.log(
    `Published: ${inspection.report.publishedAt?.toISOString() ?? "unknown"}`,
  );
  console.log(`Report URL: ${inspection.report.reportUrl}`);
  console.log(`Static bundle: ${inspection.bundleUrl}`);
  console.log(`Requests: ${inspection.requestCount}`);
  console.log(
    `Categories: ${inspection.categories.map((item) => item.label).join(", ")}`,
  );
  console.log(`History: ${inspection.earliestYear}-${inspection.latestYear}`);
  console.log(`Missing years: ${inspection.missingYears.join(", ") || "none"}`);
  console.log(`Units: ${JSON.stringify(inspection.units)}`);
  console.log("Representative latest observations:");
  for (const record of representative) {
    console.log(
      `- ${record.categoryLabel}: revenue A$${record.revenueAud?.toLocaleString() ?? "null"}; attendance ${record.attendance?.toLocaleString() ?? "null"}; average ticket ${record.averageTicketPriceAud ?? "null"}`,
    );
  }
  console.log("Comparability notes:");
  for (const note of inspection.comparabilityNotes) console.log(`- ${note}`);
}

main()
  .catch((error) => {
    console.error(
      error instanceof Error ? error.message : "LPA inspection failed.",
    );
    process.exitCode = 1;
  })
  .finally(disconnectPrisma);
