import "server-only";

import { TheNewsApiAdapter } from "@/data-sources/news/thenewsapi-adapter";
import { env } from "@/lib/env";

export const theNewsApiAdapter = new TheNewsApiAdapter({
  getBaseUrl: () => env.THENEWSAPI_BASE_URL,
  getApiToken: () => env.THENEWSAPI_API_KEY,
});
