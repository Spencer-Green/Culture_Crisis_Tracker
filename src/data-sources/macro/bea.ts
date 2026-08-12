import "server-only";

import { BeaDataSourceAdapter } from "@/data-sources/macro/bea-adapter";
import { env } from "@/lib/env";

export const beaAdapter = new BeaDataSourceAdapter({
  getBaseUrl: () => env.BEA_BASE_URL,
  getApiKey: () => env.BEA_API_KEY,
});
