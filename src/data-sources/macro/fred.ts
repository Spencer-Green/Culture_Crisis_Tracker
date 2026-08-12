import "server-only";

import { FredDataSourceAdapter } from "@/data-sources/macro/fred-adapter";
import { env } from "@/lib/env";

export const fredAdapter = new FredDataSourceAdapter({
  getBaseUrl: () => env.FRED_BASE_URL,
  getApiKey: () => env.FRED_API_KEY,
});
