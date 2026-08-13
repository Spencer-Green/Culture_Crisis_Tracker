import "server-only";

import { SteamDataSourceAdapter } from "@/data-sources/entertainment/steam-adapter";
import { env } from "@/lib/env";

export const steamAdapter = new SteamDataSourceAdapter({
  getBaseUrl: () => env.STEAM_BASE_URL,
  getApiKey: () => env.STEAM_WEB_API_KEY,
});
