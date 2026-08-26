import "dotenv/config";

import { getMediaQueryFamily } from "../src/data-sources/news/media-queries";
import { theNewsApiAdapter } from "../src/data-sources/news/thenewsapi";
import { sanitiseIngestionError } from "../src/services/ingestion/service-core";

const INSPECTION_FAMILIES = [
  "ai-frontier-capabilities",
  "venue-closures",
  "positive-investment",
];

function relevance(title: string, family: string): string {
  const text = title.toLowerCase();
  if (
    family.startsWith("ai-") &&
    /\b(ai|artificial intelligence|frontier model|foundation model)\b/.test(
      text,
    )
  )
    return "likely relevant";
  if (family === "venue-closures" && /\b(close|closure|shut)\b/.test(text))
    return "likely relevant";
  if (family === "positive-investment" && /\b(invest|funding)\b/.test(text))
    return "likely relevant";
  return "ambiguous";
}

async function main() {
  console.log("TheNewsAPI media inspection");
  console.log("Persistence: disabled");
  console.log(`Request budget: ${INSPECTION_FAMILIES.length}`);
  const endDate = new Date();
  const startDate = new Date(endDate.getTime() - 72 * 60 * 60 * 1_000);
  for (const familyId of INSPECTION_FAMILIES) {
    const family = getMediaQueryFamily(familyId);
    if (!family) continue;
    const response = await theNewsApiAdapter.fetchArticles({
      family,
      startDate,
      endDate,
    });
    console.log(`\n${family.name} [${family.id}]`);
    console.log(`Search: ${family.search}`);
    console.log(
      `Found: ${response.found ?? "not exposed"}; returned: ${response.articles.length}`,
    );
    for (const article of response.articles) {
      console.log(`- ${article.title}`);
      console.log(
        `  ${article.publisher} · ${article.publishedAt.toISOString()} · ${relevance(article.title, family.id)}`,
      );
    }
  }
}

main().catch((error) => {
  console.error(sanitiseIngestionError(error));
  process.exitCode = 1;
});
