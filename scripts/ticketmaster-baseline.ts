import "dotenv/config";

import { disconnectPrisma } from "../src/lib/prisma";
import { createTicketmasterLongitudinalBaseline } from "../src/services/industry-events/ticketmaster-longitudinal";

async function main() {
  const result = await createTicketmasterLongitudinalBaseline();
  console.log("Ticketmaster longitudinal baseline");
  console.log(`Supply snapshot rows created: ${result.snapshotsCreated}`);
  console.log(
    `Reliable latest transitions backfilled: ${result.transitionsBackfilled}`,
  );
}

main()
  .catch((error) => {
    console.error(
      error instanceof Error
        ? error.message
        : "Ticketmaster baseline creation failed.",
    );
    process.exitCode = 1;
  })
  .finally(async () => disconnectPrisma());
