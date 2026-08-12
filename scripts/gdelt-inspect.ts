import "dotenv/config";

import { classifyGdeltArticle } from "../src/data-sources/news/gdelt-classifier";
import { gdeltAdapter } from "../src/data-sources/news/gdelt";
import {
  parseGdeltCliArguments,
  resolveGdeltWindow,
} from "../src/data-sources/news/gdelt-cli";
import {
  buildGdeltQuery,
  GDELT_QUERY_FAMILIES,
  getGdeltQueryFamily,
} from "../src/data-sources/news/gdelt-queries";
import { GdeltResponseError } from "../src/data-sources/news/gdelt-api";
import { HttpRequestError } from "../src/lib/http";

function reviewStatus(confidence: "low" | "medium" | "high"): string {
  if (confidence === "high") return "likely relevant";
  if (confidence === "medium") return "ambiguous";
  return "likely false positive";
}

async function main() {
  const options = parseGdeltCliArguments(process.argv.slice(2));
  const endDate = new Date();
  const { startDate } = resolveGdeltWindow(options.days, endDate);
  const families = options.queryFamily
    ? [getGdeltQueryFamily(options.queryFamily)].filter(
        (family) => family !== undefined,
      )
    : GDELT_QUERY_FAMILIES;

  console.log("GDELT DOC 2.0 ArticleList inspection");
  console.log(`Window: ${startDate.toISOString()} to ${endDate.toISOString()}`);
  console.log("Persistence: disabled");

  for (const [index, family] of families.entries()) {
    const query = buildGdeltQuery(family, options.countryCode);
    const response = await gdeltAdapter.fetchArticles({
      query,
      queryFamily: family.id,
      startDate,
      endDate,
      maxRecords: 5,
    });
    console.log(`\n[${family.name}]`);
    console.log(`Purpose: ${family.purpose}`);
    console.log(`Query: ${query}`);
    console.log(`Results returned: ${response.articles.length}`);
    for (const article of response.articles) {
      const candidate = classifyGdeltArticle(article);
      console.log(`- ${article.title}`);
      console.log(
        `  ${reviewStatus(candidate.confidenceLevel)} · ${candidate.eventType} · ${candidate.confidenceLevel}`,
      );
      console.log(
        `  ${article.domain} · ${article.sourceCountry ?? "source country unavailable"} · ${article.language ?? "language unavailable"}`,
      );
      console.log(`  ${article.publishedAt.toISOString()} · ${article.url}`);
      if (article.tone !== null) console.log(`  GDELT tone: ${article.tone}`);
    }
    if (index < families.length - 1) {
      await new Promise((resolve) => setTimeout(resolve, 5_500));
    }
  }
}

main().catch((error) => {
  const detail =
    error instanceof HttpRequestError
      ? `${error.kind}: ${error.message}`
      : error instanceof GdeltResponseError
        ? error.message
        : "Unexpected inspection failure.";
  console.error(`GDELT inspection failed: ${detail}`);
  process.exitCode = 1;
});
