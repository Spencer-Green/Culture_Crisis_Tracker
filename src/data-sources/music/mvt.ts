import "server-only";

import { MVTAdapter } from "@/data-sources/music/mvt-adapter";
import { env } from "@/lib/env";

export const mvtAdapter = new MVTAdapter(() => env.MVT_BASE_URL);
