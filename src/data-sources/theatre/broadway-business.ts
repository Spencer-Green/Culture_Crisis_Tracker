import "server-only";

import { BroadwayBusinessAdapter } from "@/data-sources/theatre/broadway-business-adapter";
import { env } from "@/lib/env";

export const broadwayBusinessAdapter = new BroadwayBusinessAdapter(
  () => env.BROADWAY_BUSINESS_BASE_URL,
);
