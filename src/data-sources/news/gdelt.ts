import "server-only";

import { GdeltDataSourceAdapter } from "@/data-sources/news/gdelt-adapter";
import { env } from "@/lib/env";

export const gdeltAdapter = new GdeltDataSourceAdapter({
  getBaseUrl: () => env.GDELT_BASE_URL,
});
