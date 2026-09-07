import "dotenv/config";

import { disconnectPrisma } from "@/lib/prisma";
import { parseResearchReviewOptions } from "@/services/research/research-cli-core";
import { appendResearchCandidateReview } from "@/services/research/research-staging-store";

async function main() {
  const options = parseResearchReviewOptions(process.argv.slice(2));
  const review = await appendResearchCandidateReview(options);
  console.log("RESEARCH REVIEW APPENDED");
  console.log(`Review event: ${review.id}`);
  console.log(
    `Supersedes: ${review.supersedesReviewEventId ?? "no prior review"}`,
  );
  console.log("NO CANONICAL DATA WAS WRITTEN");
}

main()
  .catch((error) => {
    console.error(error instanceof Error ? error.message : String(error));
    process.exitCode = 1;
  })
  .finally(disconnectPrisma);
