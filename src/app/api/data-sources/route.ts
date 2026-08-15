import { NextResponse } from "next/server";

import { getSourceRegistry } from "@/data-sources/registry";
import { getSchedulerFreshness } from "@/services/scheduler/freshness";

export const dynamic = "force-dynamic";

export async function GET() {
  const [registry, scheduler] = await Promise.all([
    getSourceRegistry(),
    getSchedulerFreshness(),
  ]);

  return NextResponse.json({
    data: registry.sources,
    runtime: {
      databaseStatus: registry.databaseStatus,
      scheduler,
    },
  });
}
