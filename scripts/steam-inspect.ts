import "dotenv/config";

import { steamAdapter } from "../src/data-sources/entertainment/steam";
import { fetchText, HttpRequestError } from "../src/lib/http";
import { sanitiseIngestionError } from "../src/services/ingestion/service-core";

async function main() {
  const { apiKey } = steamAdapter.requireRequestConfiguration();
  console.log("Steam / Valve endpoint inspection");
  console.log("Persistence: disabled");
  const observation = await steamAdapter.createClient().fetchSnapshot(570);
  console.log("Representative app: 570");
  console.log(
    `Store: ${observation.name ?? "unavailable"} · type=${observation.type ?? "unknown"}`,
  );
  console.log(
    `Current players: ${observation.currentPlayers ?? "unavailable"}`,
  );
  console.log(
    `Reviews: ${observation.totalReviews ?? "unavailable"} · positive=${observation.positivePercent?.toFixed(2) ?? "unavailable"}% · ${observation.reviewScoreLabel ?? "unavailable"}`,
  );
  console.log(
    `Price: ${observation.freeToPlay ? "free to play" : observation.currentPrice === null ? "unavailable" : `${observation.currentPrice} minor units ${observation.currency ?? ""}`}`,
  );
  console.log(
    `Developers: ${observation.developers.join(", ") || "unavailable"}`,
  );
  console.log(
    `Publishers: ${observation.publishers.join(", ") || "unavailable"}`,
  );
  console.log(`Release date: ${observation.releaseDate ?? "unavailable"}`);
  console.log(
    "Player endpoint: ISteamUserStats/GetNumberOfCurrentPlayers/v1 (public)",
  );
  console.log(
    "Review endpoint: store.steampowered.com/appreviews/{appid} (public, Valve-owned)",
  );
  console.log(
    "Store endpoint: store.steampowered.com/api/appdetails (public, Valve-owned)",
  );

  const appListUrl = new URL(
    "https://partner.steam-api.com/IStoreService/GetAppList/v1/",
  );
  appListUrl.searchParams.set("key", apiKey);
  appListUrl.searchParams.set("max_results", "5");
  appListUrl.searchParams.set("include_games", "true");
  try {
    await fetchText(appListUrl, {
      accept: "application/json",
      acceptedContentTypes: ["application/json"],
      timeoutMs: 10_000,
      maxResponseBytes: 500_000,
    });
    console.log("Modern IStoreService app list: available to configured key.");
  } catch (error) {
    console.log(
      `Modern IStoreService app list: unavailable to configured key${error instanceof HttpRequestError && error.status ? ` (HTTP ${error.status})` : ""}; not used for ingestion.`,
    );
  }
  console.log(
    "Ingestion scope: authoritative IGDB Steam app IDs only; no catalog enumeration or fuzzy matching.",
  );
}

main().catch((error) => {
  console.error(sanitiseIngestionError(error));
  process.exitCode = 1;
});
