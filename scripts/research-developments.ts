import "dotenv/config";
import { disconnectPrisma } from "@/lib/prisma";
import { getResearchInspection } from "@/services/research/research-staging-read";
import { toResearchDevelopment } from "@/services/developments/research-development";

async function main() {
  if (process.argv.length > 2)
    throw new Error("research:developments accepts no arguments");
  const inspection = await getResearchInspection({ limit: 50 });
  console.log(
    JSON.stringify(inspection.candidates.map(toResearchDevelopment), null, 2),
  );
}
main()
  .catch(() => {
    console.error("Unable to project research developments.");
    process.exitCode = 1;
  })
  .finally(disconnectPrisma);
