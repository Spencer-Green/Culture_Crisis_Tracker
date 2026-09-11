"use client";
import Link from "next/link";
import { usePathname } from "next/navigation";

export const NAVIGATION_ITEMS = [
  { label: "Situation", href: "/" },
  { label: "Sectors", href: "/sectors" },
  { label: "Developments", href: "/developments" },
  { label: "Research", href: "/research" },
  { label: "Coverage & Methods", href: "/coverage" },
  { label: "Monitor Status", href: "/monitor" },
] as const;
function NavigationLinks() {
  const path = usePathname();
  return NAVIGATION_ITEMS.map((item) => {
    const active =
      item.href === "/"
        ? path === "/"
        : path.startsWith(item.href) ||
          (item.href === "/sectors" &&
            /^\/(music|film|theatre|gaming)(\/|$)/.test(path)) ||
          (item.href === "/coverage" && path === "/consumer-spending");
    return (
      <Link
        key={item.href}
        href={item.href}
        aria-current={active ? "page" : undefined}
        className={`rounded px-3 py-2 text-sm ${active ? "bg-zinc-800 text-zinc-100" : "text-zinc-400 hover:bg-zinc-900 hover:text-zinc-100"}`}
      >
        {item.label}
      </Link>
    );
  });
}
export function SidebarNavigation() {
  return (
    <aside className="fixed inset-y-0 left-0 z-30 hidden w-56 flex-col border-r border-zinc-800 bg-zinc-950 p-4 lg:flex">
      <Link href="/" className="mb-7 px-3 py-3 font-semibold">
        Culture Crisis Tracker
      </Link>
      <nav aria-label="Primary navigation" className="flex flex-col gap-1">
        <NavigationLinks />
      </nav>
      <p className="mt-auto px-3 text-xs text-zinc-500">
        Structural baselines · documented developments · provisional research
      </p>
    </aside>
  );
}
export function MobileNavigation() {
  return (
    <nav
      aria-label="Mobile navigation"
      className="flex flex-wrap gap-1 border-b border-zinc-800 px-2 py-2 lg:hidden"
    >
      <NavigationLinks />
    </nav>
  );
}
