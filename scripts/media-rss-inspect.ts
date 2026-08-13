import "dotenv/config";

import { fetchRssFeed } from "../src/data-sources/news/rss-api";
import { enabledRssFeeds } from "../src/data-sources/news/rss-registry";

async function main() {
  const feeds = enabledRssFeeds();
  console.log("Curated RSS/Atom inspection");
  console.log("Persistence: disabled");
  console.log(`Configured feeds: ${feeds.length}`);
  let healthy = 0;
  for (const feed of feeds) {
    try {
      const response = await fetchRssFeed(feed);
      healthy += 1;
      console.log(
        `\n${feed.slug}: reachable · ${response.format} · ${response.articles.length} parsed items`,
      );
      console.log(
        `Newest: ${response.articles[0]?.publishedAt.toISOString() ?? "none"}`,
      );
      for (const article of response.articles.slice(0, 2))
        console.log(`- ${article.title}`);
    } catch (error) {
      console.log(
        `\n${feed.slug}: unavailable or invalid · ${error instanceof Error ? error.message : "unknown error"}`,
      );
    }
  }
  console.log(`\nHealthy feeds: ${healthy}/${feeds.length}`);
}

main().catch(() => {
  console.error("RSS inspection failed.");
  process.exitCode = 1;
});
