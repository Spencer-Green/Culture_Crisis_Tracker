import "server-only";

import { CensusAiesAdapter } from "@/data-sources/music/census-aies-adapter";
import { env } from "@/lib/env";

export const censusAdapter = new CensusAiesAdapter(() => env.CENSUS_BASE_URL);
