import Link from "next/link";

export const NAVIGATION_ITEMS = [
  { label: "Overview", href: "/" },
  { label: "Consumer Spending", href: "/consumer-spending" },
  { label: "Music", href: "/music" },
  { label: "Film", href: "/film" },
  { label: "Theatre", href: "/theatre" },
  { label: "Gaming", href: "/gaming" },
  { label: "AI & Policy", href: "/ai-policy" },
  { label: "Industry Events", href: "/industry-events" },
  { label: "Data Sources", href: "/data-sources" },
  { label: "Settings", href: "/settings" },
] as const;

function Mark({ index }: { index: number }) {
  return (
    <span
      aria-hidden="true"
      className="flex size-7 shrink-0 items-center justify-center rounded-md border border-zinc-800 bg-zinc-900 font-mono text-[10px] text-zinc-500 transition-colors group-hover:border-zinc-700 group-hover:text-zinc-300"
    >
      {String(index + 1).padStart(2, "0")}
    </span>
  );
}

export function SidebarNavigation() {
  return (
    <aside className="fixed inset-y-0 left-0 z-30 hidden w-64 flex-col border-r border-zinc-800/80 bg-zinc-950/90 p-4 backdrop-blur-xl lg:flex">
      <Link
        href="/"
        className="mb-8 flex items-center gap-3 rounded-xl px-2 py-3 transition-opacity hover:opacity-80"
      >
        <span className="flex size-9 items-center justify-center rounded-lg bg-blue-600 text-sm font-semibold shadow-lg shadow-blue-950">
          CC
        </span>
        <span>
          <span className="block text-sm font-semibold tracking-tight">
            Culture Crisis
          </span>
          <span className="block text-xs text-zinc-500">Tracker</span>
        </span>
      </Link>

      <nav aria-label="Primary navigation" className="space-y-1">
        {NAVIGATION_ITEMS.map((item, index) => (
          <Link
            key={item.href}
            href={item.href}
            className="group flex items-center gap-3 rounded-lg px-2 py-2 text-sm text-zinc-400 transition-colors duration-200 hover:bg-zinc-900 hover:text-zinc-100"
          >
            <Mark index={index} />
            {item.label}
          </Link>
        ))}
      </nav>

      <div className="mt-auto rounded-xl border border-zinc-800 bg-zinc-900/60 p-4">
        <p className="text-xs font-medium text-zinc-300">Foundation phase</p>
        <p className="mt-1 text-xs leading-5 text-zinc-500">
          Data ingestion is intentionally disabled.
        </p>
      </div>
    </aside>
  );
}

export function MobileNavigation() {
  return (
    <nav
      aria-label="Mobile navigation"
      className="overflow-x-auto border-b border-zinc-800 bg-zinc-950/80 px-4 py-3 lg:hidden"
    >
      <div className="flex min-w-max gap-2">
        {NAVIGATION_ITEMS.map((item) => (
          <Link
            key={item.href}
            href={item.href}
            className="rounded-full border border-zinc-800 px-3 py-1.5 text-xs text-zinc-400 transition-colors duration-200 hover:border-zinc-700 hover:text-zinc-100"
          >
            {item.label}
          </Link>
        ))}
      </div>
    </nav>
  );
}
