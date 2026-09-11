import Link from "next/link";
import type { ReactNode } from "react";
import { MobileNavigation, SidebarNavigation } from "@/components/navigation";
import { RefreshEvidence } from "@/components/monitoring/refresh";
export function AppShell({ children }: { children: ReactNode }) {
  return (
    <div className="min-h-screen">
      <a
        href="#main-content"
        className="sr-only focus:not-sr-only focus:fixed focus:z-50 focus:bg-zinc-900 focus:p-3"
      >
        Skip to content
      </a>
      <SidebarNavigation />
      <div className="lg:pl-56">
        <header className="border-b border-zinc-800 px-4 py-3 sm:px-6">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <p className="text-sm text-zinc-400">
              Cultural-economy situation monitoring
            </p>
            <div className="flex items-center gap-3">
              <RefreshEvidence />
              <Link href="/monitor" className="text-xs text-blue-300">
                Collection status
              </Link>
            </div>
          </div>
        </header>
        <MobileNavigation />
        <main id="main-content" className="mx-auto max-w-[1440px] p-4 sm:p-6">
          {children}
        </main>
      </div>
    </div>
  );
}
