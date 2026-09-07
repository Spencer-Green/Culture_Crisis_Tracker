import "dotenv/config";

import { disconnectPrisma } from "@/lib/prisma";
import { parseResearchInspectOptions } from "@/services/research/research-cli-core";
import {
  formatResearchInspection,
  getResearchInspection,
} from "@/services/research/research-staging-read";

async function main() {
  const filters = parseResearchInspectOptions(process.argv.slice(2));
  const inspection = await getResearchInspection(filters);
  console.log(formatResearchInspection(inspection));
}

main()
  .catch((error) => {
    console.error(error instanceof Error ? error.message : String(error));
    process.exitCode = 1;
  })
  .finally(disconnectPrisma);
