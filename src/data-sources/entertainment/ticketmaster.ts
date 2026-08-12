import "server-only";

import { TicketmasterDataSourceAdapter } from "@/data-sources/entertainment/ticketmaster-adapter";
import { env } from "@/lib/env";

export const ticketmasterAdapter = new TicketmasterDataSourceAdapter({
  getBaseUrl: () => env.TICKETMASTER_BASE_URL,
  getApiKey: () => env.TICKETMASTER_API_KEY,
});
