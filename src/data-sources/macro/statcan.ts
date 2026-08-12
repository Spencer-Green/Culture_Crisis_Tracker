import "server-only";

import { StatCanDataSourceAdapter } from "@/data-sources/macro/statcan-adapter";
import { env } from "@/lib/env";

export const statcanAdapter = new StatCanDataSourceAdapter({
  getBaseUrl: () => env.STATCAN_BASE_URL,
});
