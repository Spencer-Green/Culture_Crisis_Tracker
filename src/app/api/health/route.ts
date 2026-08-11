import { NextResponse } from "next/server";

import { buildHealthResponse } from "@/app/api/health/health-core";
import { getSourceRegistry } from "@/data-sources/registry";

export const dynamic = "force-dynamic";

export async function GET() {
  const registry = await getSourceRegistry();

  return NextResponse.json(buildHealthResponse(registry));
}
