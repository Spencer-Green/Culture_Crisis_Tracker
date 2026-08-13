import type { Metadata } from "next";
import type { ReactNode } from "react";

import { getSourceRegistry } from "@/data-sources/registry";
import {
  isCurrentSource,
  isStructuralBenchmarkSource,
} from "@/data-sources/source-role";
import type { HealthStatus } from "@/data-sources/status";
import { COUNTRIES, SECTORS } from "@/lib/constants";
import { enabledRssFeeds } from "@/data-sources/news/rss-registry";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "Data Sources",
};

const countryNames = Object.fromEntries(
  COUNTRIES.map((country) => [country.code, country.name]),
) as Record<string, string>;

const sectorNames = Object.fromEntries(
  SECTORS.map((sector) => [sector.slug, sector.name]),
) as Record<string, string>;

type BadgeTone = "neutral" | "success" | "warning" | "info";

function Badge({
  children,
  tone = "neutral",
}: {
  children: ReactNode;
  tone?: BadgeTone;
}) {
  const tones: Record<BadgeTone, string> = {
    neutral: "border-zinc-700 bg-zinc-900 text-zinc-400",
    success: "border-emerald-900 bg-emerald-950/60 text-emerald-300",
    warning: "border-amber-900 bg-amber-950/50 text-amber-300",
    info: "border-blue-900 bg-blue-950/50 text-blue-300",
  };

  return (
    <span
      className={`inline-flex rounded-full border px-2 py-1 text-[11px] ${tones[tone]}`}
    >
      {children}
    </span>
  );
}

export default async function DataSourcesPage() {
  const registry = await getSourceRegistry();
  const sources = registry.sources;

  return (
    <div className="space-y-6">
      <div>
        <p className="font-data text-xs tracking-[0.2em] text-blue-400 uppercase">
          Foundation
        </p>
        <h1 className="mt-2 text-2xl font-semibold tracking-tight text-zinc-50 sm:text-3xl">
          Data Sources
        </h1>
        <p className="mt-2 max-w-3xl text-sm leading-6 text-zinc-400">
          Supported providers, configuration readiness, and operational state.
          Configuration does not imply implementation, enablement, or health.
        </p>
      </div>

      {registry.databaseStatus === "unavailable" ? (
        <div className="rounded-2xl border border-amber-900/50 bg-amber-950/20 p-5 text-sm text-amber-200/80">
          Database operational state is unavailable. Static source and
          configuration metadata remains available.
        </div>
      ) : null}

      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-5">
        <Summary label="Supported" value={sources.length.toString()} />
        <Summary
          label="Configured"
          value={sources
            .filter((source) => source.configured)
            .length.toString()}
        />
        <Summary
          label="Implemented"
          value={sources
            .filter((source) => source.implementationStatus === "implemented")
            .length.toString()}
        />
        <Summary
          label="Active Current"
          value={sources
            .filter(
              (source) =>
                source.enabled === true && isCurrentSource(source.slug),
            )
            .length.toString()}
        />
        <Summary
          label="Structural Benchmarks"
          value={sources
            .filter(
              (source) =>
                source.enabled === true &&
                isStructuralBenchmarkSource(source.slug),
            )
            .length.toString()}
        />
      </div>

      <section className="overflow-hidden rounded-2xl border border-zinc-800 bg-zinc-950/70">
        <div
          className="overflow-x-auto overscroll-x-contain"
          role="region"
          aria-label="Scrollable data sources table"
          tabIndex={0}
        >
          <table className="w-full min-w-[1380px] border-collapse text-left text-sm">
            <caption className="sr-only">
              Supported data sources and their current readiness state
            </caption>
            <thead className="border-b border-zinc-800 bg-zinc-900/60 text-xs text-zinc-500">
              <tr>
                <th scope="col" className="px-5 py-4 font-medium">
                  Source
                </th>
                <th scope="col" className="px-5 py-4 font-medium">
                  Coverage
                </th>
                <th scope="col" className="px-5 py-4 font-medium">
                  Sectors
                </th>
                <th scope="col" className="px-5 py-4 font-medium">
                  Authentication
                </th>
                <th scope="col" className="px-5 py-4 font-medium">
                  Configuration
                </th>
                <th scope="col" className="px-5 py-4 font-medium">
                  Status
                </th>
                <th scope="col" className="px-5 py-4 font-medium">
                  Last attempted sync
                </th>
                <th scope="col" className="px-5 py-4 font-medium">
                  Last successful sync
                </th>
              </tr>
            </thead>
            <tbody className="divide-y divide-zinc-800/80">
              {sources.map((source) => (
                <tr
                  key={source.slug}
                  className="align-top transition-colors duration-200 hover:bg-zinc-900/40"
                >
                  <th scope="row" className="px-5 py-5 font-normal">
                    <p className="font-medium text-zinc-100">{source.name}</p>
                    <p className="mt-1 text-xs text-zinc-500">
                      {source.provider}
                    </p>
                  </th>
                  <td className="max-w-52 px-5 py-5 text-xs leading-5 text-zinc-400">
                    {source.countries
                      .map((code) => countryNames[code] ?? code)
                      .join(", ")}
                  </td>
                  <td className="max-w-56 px-5 py-5 text-xs leading-5 text-zinc-400">
                    {source.sectors
                      .map((slug) => sectorNames[slug] ?? slug)
                      .join(", ")}
                  </td>
                  <td className="px-5 py-5">
                    {source.isPublic ? (
                      <Badge tone="info">Public</Badge>
                    ) : (
                      <Badge>Authentication Required</Badge>
                    )}
                  </td>
                  <td className="px-5 py-5">
                    {source.configured ? (
                      <Badge tone="success">Configured</Badge>
                    ) : (
                      <div className="space-y-2">
                        <Badge tone="warning">Missing Configuration</Badge>
                        <p className="font-data text-[10px] leading-4 text-zinc-600">
                          {source.missingConfiguration.join(", ")}
                        </p>
                      </div>
                    )}
                  </td>
                  <td className="px-5 py-5">
                    <div className="flex flex-wrap gap-2">
                      {source.implementationStatus === "implemented" ? (
                        <Badge tone="success">Implemented</Badge>
                      ) : (
                        <Badge tone="warning">Not Implemented</Badge>
                      )}
                      {isStructuralBenchmarkSource(source.slug) ? (
                        <Badge tone="warning">Structural Benchmark</Badge>
                      ) : null}
                      {source.enabled === true ? (
                        <Badge tone="success">Enabled</Badge>
                      ) : source.enabled === false ? (
                        <Badge>Disabled</Badge>
                      ) : (
                        <Badge>Enablement Not Checked</Badge>
                      )}
                      {source.slug === "rss" ? (
                        <Badge tone="info">
                          {enabledRssFeeds().length} feeds enabled
                        </Badge>
                      ) : null}
                      <HealthBadge status={source.healthStatus} />
                    </div>
                  </td>
                  <td className="font-data px-5 py-5 text-xs text-zinc-600">
                    <Timestamp value={source.lastAttemptedSyncAt} />
                  </td>
                  <td className="font-data px-5 py-5 text-xs text-zinc-600">
                    <Timestamp value={source.lastSuccessfulSyncAt} />
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>
    </div>
  );
}

function HealthBadge({ status }: { status: HealthStatus }) {
  const states: Record<HealthStatus, { label: string; tone: BadgeTone }> = {
    "not-checked": { label: "Not Checked", tone: "neutral" },
    healthy: { label: "Healthy", tone: "success" },
    degraded: { label: "Degraded", tone: "warning" },
    unavailable: { label: "Unavailable", tone: "warning" },
  };
  const state = states[status];

  return <Badge tone={state.tone}>{state.label}</Badge>;
}

function Timestamp({ value }: { value: string | null }) {
  if (!value) {
    return <span>Not available</span>;
  }

  return (
    <time dateTime={value}>
      {new Intl.DateTimeFormat("en", {
        dateStyle: "medium",
        timeStyle: "short",
        timeZone: "UTC",
      }).format(new Date(value))}
    </time>
  );
}

function Summary({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-2xl border border-zinc-800 bg-zinc-950/70 p-5">
      <p className="text-xs text-zinc-500">{label}</p>
      <p className="font-data mt-3 text-2xl text-zinc-100">{value}</p>
    </div>
  );
}
