import "server-only";

import { IgdbDataSourceAdapter } from "@/data-sources/entertainment/igdb-adapter";
import { env } from "@/lib/env";

export const igdbAdapter = new IgdbDataSourceAdapter({
  getBaseUrl: () => env.IGDB_BASE_URL,
  getClientId: () => env.IGDB_CLIENT_ID,
  getClientSecret: () => env.IGDB_CLIENT_SECRET,
});
