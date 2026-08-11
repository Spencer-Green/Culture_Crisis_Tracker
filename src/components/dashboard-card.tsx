import type { ReactNode } from "react";

type DashboardCardProps = {
  title: string;
  description?: string;
  children: ReactNode;
  className?: string;
};

export function DashboardCard({
  title,
  description,
  children,
  className = "",
}: DashboardCardProps) {
  return (
    <section
      className={`rounded-2xl border border-zinc-800/90 bg-zinc-950/70 p-5 shadow-2xl shadow-black/10 ${className}`}
    >
      <div className="mb-5">
        <h2 className="text-sm font-semibold tracking-tight text-zinc-100">
          {title}
        </h2>
        {description ? (
          <p className="mt-1 text-xs text-zinc-500">{description}</p>
        ) : null}
      </div>
      {children}
    </section>
  );
}

export function EmptyChart({ label }: { label: string }) {
  return (
    <div className="relative flex h-44 items-center justify-center overflow-hidden rounded-xl border border-dashed border-zinc-800 bg-zinc-950">
      <div
        aria-hidden="true"
        className="absolute inset-0 opacity-30"
        style={{
          backgroundImage:
            "linear-gradient(#27272a 1px, transparent 1px), linear-gradient(90deg, #27272a 1px, transparent 1px)",
          backgroundSize: "32px 32px",
        }}
      />
      <div className="relative max-w-xs px-4 text-center">
        <div className="mx-auto mb-3 h-0.5 w-10 rounded bg-blue-500/50" />
        <p className="text-xs font-medium text-zinc-400">{label}</p>
        <p className="mt-1 text-xs text-zinc-600">
          Awaiting the first validated ingestion run
        </p>
      </div>
    </div>
  );
}

export function EmptyList({ message }: { message: string }) {
  return (
    <div className="rounded-xl border border-dashed border-zinc-800 px-5 py-10 text-center">
      <p className="text-sm text-zinc-400">{message}</p>
      <p className="mt-1 text-xs text-zinc-600">
        No records are currently stored.
      </p>
    </div>
  );
}
