import { NextResponse } from "next/server";

import { getSourceRegistry } from "@/data-sources/registry";

export const dynamic = "force-dynamic";

export async function GET() {
  const registry = await getSourceRegistry();

  return NextResponse.json({
    data: registry.sources,
    runtime: {
      databaseStatus: registry.databaseStatus,
    },
  });
}
