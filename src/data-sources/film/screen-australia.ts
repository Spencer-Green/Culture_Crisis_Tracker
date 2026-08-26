import "server-only";

import { ScreenAustraliaAdapter } from "@/data-sources/film/screen-australia-adapter";
import { env } from "@/lib/env";

export const screenAustraliaAdapter = new ScreenAustraliaAdapter(
  () => env.SCREEN_AUSTRALIA_BASE_URL,
);
