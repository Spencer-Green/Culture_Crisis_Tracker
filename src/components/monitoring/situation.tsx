import Link from "next/link";
import { readSituation } from "@/services/monitoring/situation-read";
import {
  COVERAGE_NOTES,
  MONITOR_SECTORS,
  queryHref,
  type MonitorFilters,
  type MonitorSector,
} from "@/services/monitoring/core";
import { BaselineSignal } from "./baseline";
import { DevelopmentStory } from "./development-story";
import { Notice, ResearchFinding, Surface } from "./evidence";
import { MonitorControls } from "./filters";

export async function Situation({
  filters,
  sector,
}: {
  filters: MonitorFilters;
  sector?: MonitorSector;
}) {
  const data = await readSituation({
    ...filters,
    sector: sector ?? filters.sector,
  });
  const sectors = sector
    ? [sector]
    : filters.sector
      ? [filters.sector]
      : MONITOR_SECTORS;
  const problems = data.collection.sources.filter(
    (s) =>
      s.enabled &&
      ["STALE", "OVERDUE", "BLOCKED", "FAILED_RECENTLY"].includes(s.status),
  );
  const baseHref = (path: string) =>
    queryHref(path, {
      sector: sector ?? filters.sector,
      country: filters.country,
      days: filters.days,
    });
  return (
    <div className="space-y-5">
      <h1 className="text-2xl font-semibold">
        {sector ? sector[0].toUpperCase() + sector.slice(1) : "Situation"}
      </h1>
      <MonitorControls
        filters={{ ...filters, sector: sector ?? filters.sector }}
        fixedSector={sector}
      />
      <p className="text-xs text-zinc-400">
        The recent window applies to developments and first research
        discoveries. Baseline reporting periods remain explicit. Theme filters
        apply to documented developments only.
      </p>
      {data.collection.databaseStatus !== "available" ? (
        <Notice>
          Collection status is unavailable. An empty feed cannot establish an
          absence of change.
        </Notice>
      ) : problems.length ? (
        <Notice>
          {problems.length} enabled collection{" "}
          {problems.length === 1 ? "source needs" : "sources need"} attention.
          Recent coverage may be incomplete.{" "}
          <Link className="underline" href="/monitor">
            Inspect collection status
          </Link>
        </Notice>
      ) : null}
      <section
        aria-label="Situation brief"
        className="space-y-2 border-l-2 border-zinc-500 pl-4"
      >
        <p>
          {data.baseline.values
            .filter((v) => !v.proxy && v.change)
            .slice(0, 2)
            .map((v) => `${v.label}: ${v.change} year over year (${v.period}).`)
            .join(" ") ||
            "No comparable anchor readings are selected for this scope. See detailed analysis for additional datasets."}
        </p>
        <p className="text-sm text-zinc-400">
          Broad sector condition is not established; the readings above describe
          specific markets.
        </p>
        <p className="text-sm text-zinc-400">
          {data.developments.available
            ? `${data.developments.stories.length} qualifying documented story groups in the ${filters.days === 1 ? "24-hour" : "7-day"} publication/discovery window.`
            : "Documented developments could not be loaded."}{" "}
          {data.research.available
            ? `${data.research.total} provisional findings first discovered in this window.`
            : "Research findings could not be loaded."}{" "}
          These are coverage counts, not measures of economic impact.
        </p>
        {data.developments.truncated ? (
          <p className="text-sm text-amber-200">
            Documented coverage exceeds the read limit; counts and selection are
            incomplete.
          </p>
        ) : null}
      </section>
      {!sector ? (
        <Surface title="Sector snapshot">
          <div className="grid gap-3">
            {sectors.map((s) => {
              const anchors = data.baseline.values.filter(
                (v) => v.sector === s && !v.proxy,
              );
              const story = data.developments.stories.find(
                (v) => v.sector === s,
              );
              const finding = data.research.items.find(
                (v) => v.sector.toLowerCase() === s,
              );
              return (
                <article
                  key={s}
                  className="grid gap-3 border-b border-zinc-800 pb-3 text-sm md:grid-cols-[0.65fr_1.3fr_1.3fr_1fr]"
                >
                  <div>
                    <h3 className="font-semibold">
                      <Link className="text-blue-300" href={baseHref(`/${s}`)}>
                        {s[0].toUpperCase() + s.slice(1)}
                      </Link>
                    </h3>
                    <p className="text-xs text-zinc-400">
                      Condition not established
                    </p>
                  </div>
                  <div>
                    <p className="text-xs text-zinc-500">Baseline</p>
                    <p>
                      {anchors[0]
                        ? `${anchors[0].label}: ${anchors[0].change ?? "comparison unavailable"}${anchors[0].change ? " YoY" : ""}`
                        : "Economic baseline not available in this scope"}
                    </p>
                    {anchors[0] ? (
                      <p className="text-xs text-zinc-400">
                        Reporting period: {anchors[0].period}
                      </p>
                    ) : null}
                  </div>
                  <div>
                    <p className="text-xs text-zinc-500">
                      Documented developments
                    </p>
                    {story ? (
                      <Link
                        className="line-clamp-2"
                        href={`/developments/${story.representativeArticleId}`}
                      >
                        {story.canonicalHeadline}
                      </Link>
                    ) : (
                      <p className="text-zinc-400">
                        {data.developments.available
                          ? "None in loaded coverage"
                          : "Unavailable"}
                      </p>
                    )}
                  </div>
                  <div>
                    <p className="text-xs text-zinc-500">
                      Provisional research
                    </p>
                    {finding ? (
                      <Link
                        className="line-clamp-2"
                        href={`/research/${finding.id.replace("research:", "")}`}
                      >
                        {finding.summary}
                      </Link>
                    ) : (
                      <p className="text-zinc-400">
                        {data.research.available
                          ? "No new finding in this selection"
                          : "Unavailable"}
                      </p>
                    )}
                  </div>
                </article>
              );
            })}
          </div>
        </Surface>
      ) : (
        <p className="text-sm text-zinc-400">{COVERAGE_NOTES[sector]}</p>
      )}
      {sector ? (
        <Surface title="Structural baseline">
          {data.baseline.values
            .filter((v) => !v.proxy)
            .map((v) => (
              <BaselineSignal
                key={v.id}
                item={v}
                collection={data.collection.sources.find(
                  (s) => s.sourceId === v.sourceId,
                )}
              />
            ))}
          {!data.baseline.values.some((v) => !v.proxy) ? (
            <p className="text-sm text-zinc-400">
              No economic anchor readings selected in this scope. Available
              activity proxies are shown separately below; they cannot establish
              sector health.
            </p>
          ) : null}
        </Surface>
      ) : null}
      <div className="grid gap-5 xl:grid-cols-[1.2fr_1fr]">
        <Surface title="Documented developments">
          {!data.developments.available ? (
            <Notice>Developments unavailable.</Notice>
          ) : data.developments.stories.length ? (
            data.developments.stories
              .slice(0, 3)
              .map((story) => (
                <DevelopmentStory key={story.clusterId} story={story} />
              ))
          ) : (
            <p className="text-sm text-zinc-400">
              No qualifying reports in loaded coverage.
            </p>
          )}
          <Link
            className="text-sm text-blue-300"
            href={queryHref("/developments", {
              sector: sector ?? filters.sector,
              country: filters.country,
              days: filters.days,
              theme: filters.aiOnly ? "ai" : undefined,
            })}
          >
            Inspect developments →
          </Link>
        </Surface>
        <Surface title="Research findings">
          <p className="text-sm text-zinc-400">
            New provisional discoveries. Text checks do not establish
            independent verification.
          </p>
          {!data.research.available ? (
            <Notice>Research unavailable.</Notice>
          ) : data.research.items.length ? (
            data.research.items
              .slice(0, 3)
              .map((item) => <ResearchFinding key={item.id} item={item} />)
          ) : (
            <p className="text-sm text-zinc-400">
              No first discoveries in this window. Older findings may remain
              relevant.
            </p>
          )}
          <Link className="text-sm text-blue-300" href={baseHref("/research")}>
            Inspect all research, including older findings →
          </Link>
        </Surface>
      </div>
      <Surface
        title={
          sector ? "Activity context and deeper analysis" : "Structural context"
        }
      >
        {data.baseline.values
          .filter((v) => (sector ? v.proxy : !v.proxy))
          .slice(0, sector ? 4 : 3)
          .map((v) => (
            <BaselineSignal
              key={v.id}
              item={v}
              collection={data.collection.sources.find(
                (s) => s.sourceId === v.sourceId,
              )}
            />
          ))}
        {!data.baseline.available ? (
          <Notice>Baseline data could not be loaded.</Notice>
        ) : null}
        <div className="flex flex-wrap gap-4 text-sm text-blue-300">
          {sector ? (
            <Link
              href={queryHref(`/${sector}/analysis`, {
                country: filters.country,
              })}
            >
              Full {sector} analysis and historical series
            </Link>
          ) : null}
          <Link href="/consumer-spending">Cross-sector demand context</Link>
          <Link href="/coverage">Coverage and methods</Link>
        </div>
      </Surface>
      <Surface title="Coverage and open questions">
        {sectors.map((s) => (
          <p className="text-sm text-zinc-400" key={s}>
            <Link className="text-blue-300 capitalize" href={`/${s}`}>
              {s}
            </Link>
            : {COVERAGE_NOTES[s]}
          </p>
        ))}
        <p className="text-sm text-zinc-400">
          The active researcher task currently focuses on Australian live-music
          venue viability. Missing research in other domains is a coverage gap,
          not evidence of stability.
        </p>
      </Surface>
    </div>
  );
}
