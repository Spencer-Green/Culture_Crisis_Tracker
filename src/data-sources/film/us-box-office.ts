import "server-only";

import { USBoxOfficeAdapter } from "@/data-sources/film/us-box-office-adapter";
import { env } from "@/lib/env";

export const usBoxOfficeAdapter = new USBoxOfficeAdapter(
  () => env.US_BOX_OFFICE_BASE_URL,
);
