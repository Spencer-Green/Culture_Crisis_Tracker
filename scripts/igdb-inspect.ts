import "dotenv/config";

import { igdbAdapter } from "../src/data-sources/entertainment/igdb";
import { parseIgdbGame } from "../src/data-sources/entertainment/igdb-api";
import { sanitiseIngestionError } from "../src/services/ingestion/service-core";

function named(values: unknown[]): string {
  return values
    .slice(0, 20)
    .map((value) => {
      if (!value || typeof value !== "object" || Array.isArray(value))
        return "invalid";
      const record = value as Record<string, unknown>;
      return `${String(record.name ?? record.type ?? "unknown")} [${String(record.id ?? "?")}]`;
    })
    .join(", ");
}

async function main() {
  const client = igdbAdapter.createClient();
  console.log("IGDB v4 inspection");
  console.log("Persistence: disabled");
  const gameTypes = await client.query(
    "game_types",
    "fields id,type; sort id asc; limit 50;",
  );
  const externalSources = await client.query(
    "external_game_sources",
    "fields id,name; sort id asc; limit 50;",
  );
  const genres = await client.query(
    "genres",
    "fields id,name; sort name asc; limit 100;",
  );
  const platforms = await client.query(
    "platforms",
    "fields id,name; sort name asc; limit 100;",
  );
  console.log(`Game types: ${named(gameTypes)}`);
  console.log(`External sources: ${named(externalSources)}`);
  console.log(`Genres (${genres.length}): ${named(genres)}`);
  console.log(`Platforms sample (${platforms.length}): ${named(platforms)}`);

  const now = new Date();
  const startDate = new Date(now);
  startDate.setUTCDate(startDate.getUTCDate() - 30);
  const endDateExclusive = new Date(now);
  endDateExclusive.setUTCDate(endDateExclusive.getUTCDate() + 181);
  const payload = await client.query(
    "games",
    `fields id,name,slug,first_release_date,game_type.id,game_type.type,game_status.id,game_status.status,parent_game.id,version_parent.id,created_at,updated_at,genres.id,genres.name,themes.id,themes.name,platforms.id,platforms.name,involved_companies.developer,involved_companies.publisher,involved_companies.company.id,involved_companies.company.name,external_games.uid,external_games.name,external_games.url,external_games.external_game_source.id,external_games.external_game_source.name,release_dates.id,release_dates.date,release_dates.date_format,release_dates.release_region,release_dates.status,release_dates.platform.id,release_dates.platform.name; where first_release_date >= ${Math.floor(startDate.getTime() / 1_000)} & first_release_date < ${Math.floor(endDateExclusive.getTime() / 1_000)} & game_type = (0,4,8,9) & version_parent = null & involved_companies != null & (game_status = null | game_status != (6,7)); sort first_release_date asc; limit 10;`,
  );
  const games = payload.map(parseIgdbGame).filter((game) => game !== null);
  console.log(
    `Representative release window: ${startDate.toISOString().slice(0, 10)} to ${endDateExclusive.toISOString().slice(0, 10)} (exclusive)`,
  );
  console.log(`Representative games: ${games.length}`);
  for (const game of games) {
    console.log(
      `- ${game.igdbId} · ${game.name} · ${game.gameType.name} · ${game.gameStatus?.name ?? "status unspecified"}`,
    );
    console.log(
      `  First release: ${game.firstReleaseDate?.toISOString().slice(0, 10) ?? "unknown"}`,
    );
    console.log(
      `  Platforms: ${game.platforms.map((item) => `${item.name} [${item.igdbId}]`).join(", ") || "none"}`,
    );
    console.log(
      `  Genres: ${game.genres.map((item) => item.name).join(", ") || "none"}`,
    );
    console.log(
      `  Themes: ${game.themes.map((item) => item.name).join(", ") || "none"}`,
    );
    console.log(
      `  Developers: ${
        game.companies
          .filter((item) => item.developer)
          .map((item) => `${item.name} [${item.igdbId}]`)
          .join(", ") || "none"
      }`,
    );
    console.log(
      `  Publishers: ${
        game.companies
          .filter((item) => item.publisher)
          .map((item) => `${item.name} [${item.igdbId}]`)
          .join(", ") || "none"
      }`,
    );
    console.log(`  Steam app ID: ${game.steamAppId ?? "unmapped"}`);
    console.log(
      `  Releases: ${game.releases.length}; regions=${[...new Set(game.releases.map((item) => item.regionId).filter((item) => item !== null))].join(",") || "unspecified"}`,
    );
  }
  console.log(
    "Inclusion: company-attributed Main Game, Standalone Expansion, Remake, Remaster; cancelled, rumored, and version-parent editions excluded.",
  );
  console.log(
    "Steam mapping: IGDB external game source 1; no title fuzzy matching.",
  );
}

main().catch((error) => {
  console.error(sanitiseIngestionError(error));
  process.exitCode = 1;
});
