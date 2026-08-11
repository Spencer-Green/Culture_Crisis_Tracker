import {
  DashboardCard,
  EmptyChart,
  EmptyList,
} from "@/components/dashboard-card";

const indicators = [
  {
    title: "Culture Stress Index",
    detail: "Composite methodology pending",
    tone: "text-blue-300",
  },
  {
    title: "Consumer Demand",
    detail: "No observations",
    tone: "text-zinc-300",
  },
  {
    title: "Industry Viability",
    detail: "No observations",
    tone: "text-zinc-300",
  },
  {
    title: "Middle-Tier Health",
    detail: "No observations",
    tone: "text-zinc-300",
  },
  {
    title: "AI Disruption",
    detail: "No policy events",
    tone: "text-zinc-300",
  },
] as const;

export default function OverviewPage() {
  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <p className="font-data text-xs tracking-[0.2em] text-blue-400 uppercase">
            Overview
          </p>
          <h1 className="mt-2 text-2xl font-semibold tracking-tight text-zinc-50 sm:text-3xl">
            Cultural economy pulse
          </h1>
          <p className="mt-2 max-w-2xl text-sm leading-6 text-zinc-400">
            A comparative view of demand, viability, concentration, and
            disruption across six Western markets.
          </p>
        </div>
        <div className="rounded-lg border border-zinc-800 bg-zinc-950 px-3 py-2 text-xs text-zinc-500">
          Last refresh:{" "}
          <span className="font-data text-zinc-300">Not yet available</span>
        </div>
      </div>

      <div className="rounded-2xl border border-blue-900/50 bg-blue-950/20 p-5">
        <div className="flex gap-3">
          <span
            className="mt-1 size-2 shrink-0 rounded-full bg-blue-400"
            aria-hidden="true"
          />
          <div>
            <h2 className="text-sm font-medium text-blue-100">
              Ingestion has not started
            </h2>
            <p className="mt-1 text-sm leading-6 text-blue-200/60">
              Every visual below is an explicit empty state. No synthetic values
              are presented as evidence.
            </p>
          </div>
        </div>
      </div>

      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-5">
        {indicators.map((indicator) => (
          <section
            key={indicator.title}
            className="rounded-2xl border border-zinc-800 bg-zinc-950/70 p-5 transition-colors duration-200 hover:border-zinc-700"
          >
            <p className="text-xs text-zinc-500">{indicator.title}</p>
            <p className={`mt-4 text-lg font-medium ${indicator.tone}`}>
              Pending
            </p>
            <p className="mt-1 text-xs text-zinc-600">{indicator.detail}</p>
          </section>
        ))}
      </div>

      <div className="grid gap-6 xl:grid-cols-2">
        <DashboardCard
          title="Consumer Demand"
          description="Recreation and culture spending over time"
        >
          <EmptyChart label="Consumer demand series" />
        </DashboardCard>
        <DashboardCard
          title="Industry Viability"
          description="Closures, cancellations, employment, and operating health"
        >
          <EmptyChart label="Industry viability trend" />
        </DashboardCard>
      </div>

      <div className="grid gap-6 xl:grid-cols-3">
        <DashboardCard
          title="Country Comparison"
          description="Australia, US, UK, Canada, New Zealand, and EU"
          className="xl:col-span-2"
        >
          <EmptyChart label="Comparable country indicators" />
        </DashboardCard>
        <DashboardCard title="Data Freshness" description="Recency by source">
          <EmptyList message="No sources have completed a sync" />
        </DashboardCard>
      </div>

      <div className="grid gap-6 xl:grid-cols-2">
        <DashboardCard
          title="Sector Comparison"
          description="Demand and viability signals by cultural sector"
        >
          <EmptyChart label="Cross-sector comparison" />
        </DashboardCard>
        <DashboardCard
          title="Latest Industry Events"
          description="Closures, cancellations, layoffs, policy, and consolidation"
        >
          <EmptyList message="No industry events have been ingested" />
        </DashboardCard>
      </div>
    </div>
  );
}
