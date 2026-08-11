import { OnsDataSourceAdapter } from "@/data-sources/macro/ons-adapter";
import { env } from "@/lib/env";

export const onsAdapter = new OnsDataSourceAdapter({
  getBaseUrl: () => env.ONS_BASE_URL,
});
