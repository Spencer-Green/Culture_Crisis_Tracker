import Link from "next/link";
import type { ReactNode } from "react";
import type { ResearchDevelopment } from "@/services/developments/research-development";
import {
  accessLabel,
  dateLabel,
  publicationLabel,
  reviewLabel,
  safeSourceUrl,
} from "@/services/monitoring/core";

export function Surface({
  title,
  children,
  id,
}: {
  title: string;
  children: ReactNode;
  id?: string;
}) {
  return (
    <section
      id={id}
      className="min-w-0 space-y-3 rounded-lg border border-zinc-800 p-4"
    >
      <h2 className="text-lg font-semibold">{title}</h2>
      {children}
    </section>
  );
}
export function Notice({ children }: { children: ReactNode }) {
  return (
    <p
      role="status"
      className="rounded border border-amber-900 p-3 text-sm text-amber-200"
    >
      {children}
    </p>
  );
}
export function SourceReference({
  url,
  children,
}: {
  url: string;
  children: ReactNode;
}) {
  const safe = safeSourceUrl(url);
  return safe ? (
    <a
      className="text-blue-300 underline underline-offset-4"
      href={safe}
      target="_blank"
      rel="noopener noreferrer"
    >
      {children}
      <span className="sr-only"> (opens source in a new tab)</span>
    </a>
  ) : (
    <span>{children} · source URL unavailable</span>
  );
}
export function ResearchFinding({
  item,
}: {
  item: ResearchDevelopment & {
    checkSummary?: { observedAt: string | null; local: string; glm: string };
  };
}) {
  return (
    <article
      className={`space-y-2 border-l-2 p-3 ${item.verification === "QUARANTINED" ? "border-amber-700" : "border-zinc-500"}`}
    >
      <p className="text-xs text-zinc-400">
        {item.verification === "QUARANTINED"
          ? "Quarantined · excluded from assessments"
          : "Provisional finding · not independently verified"}
      </p>
      <h3 className="font-medium">
        <Link
          className="line-clamp-3 hover:underline"
          href={`/research/${item.id.replace("research:", "")}`}
        >
          {item.summary}
        </Link>
      </h3>
      <Link
        className="inline-block text-xs text-blue-300 underline"
        href={`/research/${item.id.replace("research:", "")}`}
      >
        Inspect full finding
      </Link>
      <p className="text-sm text-zinc-400">
        {item.geography} · {item.source.publisher}
      </p>
      {item.checkSummary ? (
        <p className="text-xs text-zinc-400">
          Latest occurrence checks: {item.checkSummary.local}
        </p>
      ) : null}
      <p className="text-xs text-zinc-400">
        Published: {publicationLabel(item.publication)} · First discovered:{" "}
        {dateLabel(item.firstDiscoveredAt, true)}
      </p>
      <details className="text-sm text-zinc-400">
        <summary className="cursor-pointer">
          Access and observation history
        </summary>
        <div className="mt-2 space-y-2">
          <p>
            {accessLabel(item.source.traceConfidence, item.source.mediation)}
          </p>
          {item.checkSummary ? (
            <p>
              Local: {item.checkSummary.local}. GLM recorded check:{" "}
              {item.checkSummary.glm}. Occurrence:{" "}
              {dateLabel(item.checkSummary.observedAt, true)}.
            </p>
          ) : null}
          <p>Reporting period: {item.reportingPeriod.raw || "Unknown"}</p>
          <p>
            Last observed: {dateLabel(item.lastObservedAt, true)} ·{" "}
            {item.occurrenceCount} recorded occurrences
          </p>
          <p>
            {reviewLabel(item.reviewState)}. Rediscovery does not establish a
            new development.
          </p>
          <SourceReference url={item.source.url}>
            {item.source.title}
          </SourceReference>
          <p>
            <Link
              className="underline"
              href={`/research/${item.id.replace("research:", "")}`}
            >
              Inspect passages, checks and review history
            </Link>
          </p>
        </div>
      </details>
    </article>
  );
}
