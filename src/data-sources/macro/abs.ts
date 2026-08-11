import "server-only";

import { AbsDataSourceAdapter } from "@/data-sources/macro/abs-adapter";
import { env } from "@/lib/env";

export const absAdapter = new AbsDataSourceAdapter({
  getBaseUrl: () => env.ABS_BASE_URL,
});
