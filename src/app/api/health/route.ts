import { NextResponse } from "next/server";

import { buildHealthResponse } from "@/app/api/health/health-core";
import { getSourceRegistry } from "@/data-sources/registry";
import { getSchedulerFreshness } from "@/services/scheduler/freshness";

export const dynamic = "force-dynamic";

export async function GET() {
  const [registry, scheduler] = await Promise.all([
    getSourceRegistry(),
    getSchedulerFreshness(),
  ]);

  return NextResponse.json(
    buildHealthResponse(registry, new Date(), scheduler),
  );
}
