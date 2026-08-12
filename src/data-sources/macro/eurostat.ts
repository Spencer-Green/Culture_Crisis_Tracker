import "server-only";

import { EurostatDataSourceAdapter } from "@/data-sources/macro/eurostat-adapter";
import { env } from "@/lib/env";

export const eurostatAdapter = new EurostatDataSourceAdapter({
  getBaseUrl: () => env.EUROSTAT_BASE_URL,
});
