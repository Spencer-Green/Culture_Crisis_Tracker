import Link from "next/link";
import type { ReactNode } from "react";
export default function AnalysisLayout({ children }: { children: ReactNode }) {
  return (
    <div className="space-y-5">
      <Link href="/gaming" className="text-sm text-blue-300">
        ← Gaming situation
      </Link>
      <p className="text-xs text-zinc-400">
        Detailed historical analysis. Each source retains its own reporting
        period and coverage.
      </p>
      {children}
    </div>
  );
}
