import type { ReactNode } from "react";

import { MobileNavigation, SidebarNavigation } from "@/components/navigation";
import { getOverviewState } from "@/services/overview";

export async function AppShell({ children }: { children: ReactNode }) {
  const overview = await getOverviewState();
  const ingestionAvailable = overview.databaseStatus === "available";
  const hasSuccessfulIngestion = overview.successfulSourceCount > 0;
  const statusLabel = ingestionAvailable
    ? hasSuccessfulIngestion
      ? "Live data"
      : "No ingestion"
    : "Status unavailable";
  const statusTone =
    ingestionAvailable && hasSuccessfulIngestion
      ? "border-emerald-900/50 bg-emerald-950/30 text-emerald-300"
      : "border-amber-900/50 bg-amber-950/30 text-amber-300";
  const dotTone =
    ingestionAvailable && hasSuccessfulIngestion
      ? "bg-emerald-400"
      : "bg-amber-400";

  return (
    <div className="min-h-screen">
      <SidebarNavigation
        databaseStatus={overview.databaseStatus}
        activeSourceCount={overview.successfulSourceCount}
      />
      <div className="lg:pl-64">
        <header className="sticky top-0 z-20 border-b border-zinc-800/80 bg-zinc-950/80 backdrop-blur-xl">
          <div className="flex h-16 items-center justify-between gap-4 px-4 sm:px-6 lg:px-8">
            <div>
              <p className="text-sm font-medium text-zinc-100">
                Western cultural economy
              </p>
              <p className="text-xs text-zinc-500">Monitoring foundation</p>
            </div>
            <div
              className={`flex items-center gap-2 rounded-full border px-3 py-1.5 text-xs ${statusTone}`}
            >
              <span
                className={`size-1.5 rounded-full ${dotTone}`}
                aria-hidden="true"
              />
              {statusLabel}
            </div>
          </div>
          <MobileNavigation />
        </header>
        <main className="mx-auto max-w-[1600px] p-4 sm:p-6 lg:p-8">
          {children}
        </main>
      </div>
    </div>
  );
}
