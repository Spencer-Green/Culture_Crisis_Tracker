import "server-only";

import { BFIAdapter } from "@/data-sources/film/bfi-adapter";
import { env } from "@/lib/env";

export const bfiAdapter = new BFIAdapter(() => env.BFI_BASE_URL);
