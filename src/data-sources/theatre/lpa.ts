import "server-only";

import { LPAAdapter } from "@/data-sources/theatre/lpa-adapter";
import { env } from "@/lib/env";

export const lpaAdapter = new LPAAdapter(() => env.LPA_BASE_URL);
