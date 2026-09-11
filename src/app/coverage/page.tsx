import Link from "next/link";
import { getSourceRegistry } from "@/data-sources/registry";
import { COVERAGE_NOTES, MONITOR_SECTORS } from "@/services/monitoring/core";
import { SourceReference, Surface } from "@/components/monitoring/evidence";

export const metadata = { title: "Coverage & Methods" };
export default async function CoveragePage() {
  const registry = await getSourceRegistry();
  return (
    <div className="space-y-5">
      <h1 className="text-2xl font-semibold">Coverage &amp; Methods</h1>
      <Surface title="Three evidence classes">
        <div className="grid gap-4 md:grid-cols-3">
          <article>
            <h3 className="font-medium">Deterministic baselines</h3>
            <p className="mt-2 text-sm text-zinc-400">
              Measurements collected by established adapters. Canonical status
              does not imply official authority or complete coverage. Period,
              units, scope and source remain essential.
            </p>
          </article>
          <article>
            <h3 className="font-medium">Documented developments</h3>
            <p className="mt-2 text-sm text-zinc-400">
              Reported industry changes grouped by story. Automated importance
              and classification help organize reporting; they do not verify
              facts or measure economic severity.
            </p>
          </article>
          <article>
            <h3 className="font-medium">Provisional research</h3>
            <p className="mt-2 text-sm text-zinc-400">
              DeepSeek native research with GLM passage selection and local
              literal checks. Provider text is not independently authenticated.
              Approval means investigation only; no automatic canonical
              promotion.
            </p>
          </article>
        </div>
      </Surface>
      <Surface title="Assessment method">
        <p className="text-sm text-zinc-400">
          There is no composite health score. Sector pages show scoped
          measurements and comparisons. Broad condition and direction are
          withheld until the evidence and methodology support them. Research
          findings do not vote on health; quarantined findings are excluded from
          highlights.
        </p>
        <p className="text-sm text-zinc-400">
          Activity counts, event listings and release calendars are proxies, not
          evidence of profitability or employment. A negative growth rate is not
          by itself proof of a crisis. Missing data is not stability.
        </p>
      </Surface>
      <Surface title="Reading time and change">
        <p className="text-sm text-zinc-400">
          Reporting period describes the measurement. Publication describes the
          source document. First discovery describes when the tracker
          encountered it. Last observed describes rediscovery. Collection dates
          describe the process. Date-only evidence stays date-only; clock times
          use Melbourne time.
        </p>
        <p className="text-sm text-zinc-400">
          New research is selected by first discovery, never last observation.
          Provenance or review changes do not establish new economic
          developments. Developments use a bounded publication/discovery window;
          story grouping is not yet a durable event or “since last visit”
          ledger.
        </p>
      </Surface>
      <Surface title="Coverage gaps">
        {MONITOR_SECTORS.map((sector) => (
          <p className="text-sm text-zinc-400" key={sector}>
            <Link className="text-blue-300 capitalize" href={`/${sector}`}>
              {sector}
            </Link>
            : {COVERAGE_NOTES[sector]}
          </p>
        ))}
        <p className="text-sm text-zinc-400">
          Research currently targets Australian live-music venue viability.
          Other research domains have not been enabled by this redesign.
        </p>
      </Surface>
      <Surface title="Source registry">
        <p className="text-sm text-zinc-400">
          Declared coverage is not a guarantee of complete or current
          observations. Public accessibility does not grant permission to
          scrape, store or republish.
        </p>
        {registry.sources.map((source) => (
          <details
            id={source.slug}
            key={source.slug}
            className="rounded border border-zinc-800 p-3 text-sm"
          >
            <summary className="cursor-pointer">
              {source.name} ·{" "}
              {source.countries.join(" / ") || "Scope not specified"}
            </summary>
            <div className="mt-3 space-y-2 text-zinc-400">
              <p>Provider: {source.provider}</p>
              <p>Sector coverage: {source.sectors.join(", ")}</p>
              <p>
                Implementation: {source.implementationStatus} · collection{" "}
                {source.enabled === null
                  ? "state unavailable"
                  : source.enabled
                    ? "enabled"
                    : "disabled"}
              </p>
              {source.evidenceRole ? (
                <p>Source role: {source.evidenceRole}</p>
              ) : null}
              {source.sourceUrl ? (
                <SourceReference url={source.sourceUrl}>
                  Publisher / source reference
                </SourceReference>
              ) : null}
              <p>
                <Link
                  className="text-blue-300"
                  href={`/monitor#${source.slug}`}
                >
                  Collection history and status
                </Link>
              </p>
            </div>
          </details>
        ))}
      </Surface>
    </div>
  );
}
