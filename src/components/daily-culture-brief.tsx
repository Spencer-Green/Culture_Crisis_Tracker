import Link from "next/link";

import type { DailyCultureBrief } from "@/services/media/daily-brief";
import type {
  BriefSector,
  MediaStoryCluster,
} from "@/services/media/daily-brief-core";

function formatTimestamp(value: string): string {
  return new Intl.DateTimeFormat("en-AU", {
    dateStyle: "medium",
    timeStyle: "short",
    timeZone: "UTC",
  }).format(new Date(value));
}

function age(value: string, generatedAt: string): string {
  const hours = Math.max(
    0,
    Math.floor(
      (new Date(generatedAt).getTime() - new Date(value).getTime()) / 3_600_000,
    ),
  );
  return hours < 1
    ? "<1h before brief"
    : hours < 24
      ? `${hours}h before brief`
      : `${Math.floor(hours / 24)}d before brief`;
}

function label(value: string): string {
  return value
    .replaceAll("_", " ")
    .replaceAll("industry-events", "cross-sector")
    .toLowerCase();
}

function StoryCard({
  story,
  generatedAt,
  compact = false,
}: {
  story: MediaStoryCluster;
  generatedAt: string;
  compact?: boolean;
}) {
  return (
    <article className="rounded-xl border border-zinc-800 bg-zinc-950 p-4">
      <div className="flex flex-wrap items-center gap-2 text-[10px] tracking-wide uppercase">
        {story.sector ? (
          <span className="text-zinc-500">{label(story.sector)}</span>
        ) : (
          <span className="text-amber-400">ambiguous routing</span>
        )}
        {story.eventType ? (
          <span className="text-blue-400">{label(story.eventType)}</span>
        ) : null}
        {story.aiImpactType ? (
          <span className="text-violet-400">{label(story.aiImpactType)}</span>
        ) : null}
        <span className="text-zinc-600">importance {story.importance}/5</span>
        <span className="text-zinc-600">{story.confidence} confidence</span>
        {story.humanReviewState === "corrected" ||
        story.humanReviewState === "reviewed" ? (
          <span className="rounded-full border border-emerald-900/70 bg-emerald-950/30 px-2 py-0.5 text-emerald-300">
            Reviewed
          </span>
        ) : null}
        {story.humanReviewState === "ambiguous" ? (
          <span className="rounded-full border border-amber-900/70 bg-amber-950/30 px-2 py-0.5 text-amber-300">
            Review conflict
          </span>
        ) : null}
      </div>
      <h3 className="mt-2 text-sm leading-5 font-medium text-zinc-100">
        <Link
          href={story.sources[0].url}
          target="_blank"
          rel="noopener noreferrer"
          className="hover:text-blue-300"
        >
          {story.canonicalHeadline}
        </Link>
      </h3>
      {!compact ? (
        <p className="mt-2 text-xs leading-5 text-zinc-400">
          {story.whyItMatters}
        </p>
      ) : null}
      <div className="mt-3 flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-zinc-600">
        <span>
          {story.sourceCount === 1
            ? story.publishers[0]
            : `Reported by ${story.sourceCount} sources`}
        </span>
        <span>{age(story.latestPublishedAt, generatedAt)}</span>
      </div>
      {!compact ? (
        <details className="mt-3 text-xs text-zinc-500">
          <summary className="cursor-pointer hover:text-zinc-300">
            {story.sources.length} underlying{" "}
            {story.sources.length === 1 ? "article" : "articles"}
          </summary>
          <ul className="mt-2 space-y-2 border-l border-zinc-800 pl-3">
            {story.sources.map((source) => (
              <li key={source.articleId}>
                <Link
                  href={source.url}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="hover:text-blue-300"
                >
                  {source.publisher}: {source.headline}
                </Link>
                <span className="ml-2 text-zinc-700">
                  {formatTimestamp(source.publishedAt)}
                </span>
              </li>
            ))}
          </ul>
        </details>
      ) : null}
    </article>
  );
}

function StorySection({
  title,
  description,
  stories,
  generatedAt,
  quietMessage,
}: {
  title: string;
  description?: string;
  stories: readonly MediaStoryCluster[];
  generatedAt: string;
  quietMessage: string;
}) {
  return (
    <section className="rounded-2xl border border-zinc-800/90 bg-zinc-950/70 p-5">
      <h2 className="text-sm font-semibold tracking-tight text-zinc-100">
        {title}
      </h2>
      {description ? (
        <p className="mt-1 text-xs text-zinc-500">{description}</p>
      ) : null}
      <div className="mt-4 space-y-3">
        {stories.length > 0 ? (
          stories.map((story) => (
            <StoryCard
              key={story.clusterId}
              story={story}
              generatedAt={generatedAt}
            />
          ))
        ) : (
          <p className="rounded-xl border border-dashed border-zinc-800 p-4 text-xs leading-5 text-zinc-600">
            {quietMessage}
          </p>
        )}
      </div>
    </section>
  );
}

const SECTOR_LABELS: Record<BriefSector, string> = {
  music: "Music",
  film: "Film",
  theatre: "Theatre",
  gaming: "Gaming",
};

export function DailyBriefOverview({ brief }: { brief: DailyCultureBrief }) {
  return (
    <section className="rounded-2xl border border-blue-900/50 bg-blue-950/15 p-5">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <p className="font-data text-[10px] tracking-[0.2em] text-blue-400 uppercase">
            Daily Culture Brief · Last 24 hours
          </p>
          <h2 className="mt-2 text-lg font-semibold text-zinc-100">
            What changed in culture today
          </h2>
          <div className="mt-2 max-w-3xl space-y-1 text-sm leading-6 text-zinc-400">
            {brief.topLine.map((line) => (
              <p key={line}>{line}</p>
            ))}
          </div>
        </div>
        <Link
          href="/brief"
          className="shrink-0 rounded-lg border border-blue-800 px-3 py-2 text-xs font-medium text-blue-200 hover:border-blue-600 hover:text-blue-100"
        >
          View full brief
        </Link>
      </div>
      {brief.mediaFreshnessWarning ? (
        <p className="mt-4 rounded-lg border border-amber-900/60 bg-amber-950/20 px-3 py-2 text-xs text-amber-200">
          {brief.mediaFreshnessWarning}
        </p>
      ) : null}
      <div className="mt-5 grid gap-3 lg:grid-cols-3">
        {brief.topDevelopments.slice(0, 3).map((story) => (
          <StoryCard
            key={story.clusterId}
            story={story}
            generatedAt={brief.generatedAt}
            compact
          />
        ))}
      </div>
      {brief.topDevelopments.length === 0 ? (
        <p className="mt-5 rounded-xl border border-dashed border-zinc-800 p-4 text-sm text-zinc-500">
          No story met the top-development threshold. Quiet days remain quiet.
        </p>
      ) : null}
      <p className="mt-4 text-[11px] text-zinc-600">
        Generated {formatTimestamp(brief.generatedAt)} · Media refreshed{" "}
        {brief.mediaLastRefresh
          ? formatTimestamp(brief.mediaLastRefresh)
          : "not available"}
      </p>
    </section>
  );
}

export function DailyBriefFull({ brief }: { brief: DailyCultureBrief }) {
  return (
    <div className="space-y-6">
      <section className="rounded-2xl border border-blue-900/50 bg-blue-950/15 p-6">
        <p className="font-data text-xs tracking-[0.2em] text-blue-400 uppercase">
          Daily Culture Brief
        </p>
        <h1 className="mt-2 text-2xl font-semibold tracking-tight text-zinc-50 sm:text-3xl">
          Last 24 hours in the cultural economy
        </h1>
        <div className="mt-3 max-w-3xl space-y-1 text-sm leading-6 text-zinc-300">
          {brief.topLine.map((line) => (
            <p key={line}>{line}</p>
          ))}
        </div>
        <dl className="mt-5 grid gap-3 text-xs text-zinc-500 sm:grid-cols-3">
          <div>
            <dt>Generated</dt>
            <dd className="font-data mt-1 text-zinc-300">
              {formatTimestamp(brief.generatedAt)}
            </dd>
          </div>
          <div>
            <dt>Media last refreshed</dt>
            <dd className="font-data mt-1 text-zinc-300">
              {brief.mediaLastRefresh
                ? formatTimestamp(brief.mediaLastRefresh)
                : "Not available"}
            </dd>
          </div>
          <div>
            <dt>Story-level input</dt>
            <dd className="font-data mt-1 text-zinc-300">
              {brief.diagnostics.storyClusters} clusters from{" "}
              {brief.diagnostics.rawEligibleArticles} eligible articles
            </dd>
          </div>
        </dl>
        {brief.mediaFreshnessWarning ? (
          <p className="mt-4 rounded-lg border border-amber-900/60 bg-amber-950/20 px-3 py-2 text-xs text-amber-200">
            {brief.mediaFreshnessWarning}
          </p>
        ) : null}
      </section>

      <div className="grid gap-6 xl:grid-cols-2">
        <StorySection
          title="Top Developments"
          description="Ranked by human-corrected importance where available, then confidence, independent source count, and recency."
          stories={brief.topDevelopments}
          generatedAt={brief.generatedAt}
          quietMessage="No story met the materiality and confidence threshold in this window."
        />
        <StorySection
          title="AI & Creative Work"
          description="Only AI developments with explicit creative-work or cultural-industry evidence."
          stories={brief.aiAndCreativeWork}
          generatedAt={brief.generatedAt}
          quietMessage="No qualifying AI and creative-work development was identified."
        />
      </div>

      <section>
        <div className="mb-4">
          <h2 className="text-sm font-semibold text-zinc-100">Sector Watch</h2>
          <p className="mt-1 text-xs text-zinc-500">
            Secondary sector developments are preferred when a story already
            appears in Top Developments.
          </p>
        </div>
        <div className="grid gap-6 xl:grid-cols-2">
          {(Object.keys(SECTOR_LABELS) as BriefSector[]).map((sector) => (
            <StorySection
              key={sector}
              title={SECTOR_LABELS[sector]}
              stories={brief.sectors[sector]}
              generatedAt={brief.generatedAt}
              quietMessage={`No qualifying ${SECTOR_LABELS[sector]} development was identified.`}
            />
          ))}
        </div>
      </section>

      <div className="grid gap-6 xl:grid-cols-2">
        <StorySection
          title="Positive Counter-Signals"
          description="Openings, hiring, funding, investment, expansion, and reported demand or revenue growth."
          stories={brief.positiveSignals}
          generatedAt={brief.generatedAt}
          quietMessage="No qualifying positive counter-signal was identified in this window."
        />
        <section className="rounded-2xl border border-zinc-800/90 bg-zinc-950/70 p-5">
          <h2 className="text-sm font-semibold text-zinc-100">
            What Changed Since Yesterday
          </h2>
          <p className="mt-1 text-xs text-zinc-500">
            Current 24 hours compared with the preceding 24 hours; count
            differences are not trends.
          </p>
          <ul className="mt-4 space-y-3 text-sm leading-6 text-zinc-400">
            {brief.delta.bullets.map((bullet) => (
              <li key={bullet} className="flex gap-3">
                <span className="mt-2 size-1.5 shrink-0 rounded-full bg-blue-500" />
                <span>{bullet}</span>
              </li>
            ))}
          </ul>
        </section>
      </div>

      <section className="rounded-2xl border border-zinc-800/90 bg-zinc-950/70 p-5">
        <h2 className="text-sm font-semibold text-zinc-100">Market Context</h2>
        <p className="mt-1 text-xs text-zinc-500">
          Latest validated structured observations. These metrics provide
          context and are not attributed to today&apos;s media developments.
        </p>
        {brief.marketContext.length > 0 ? (
          <div className="mt-4 grid gap-3 md:grid-cols-2 xl:grid-cols-4">
            {brief.marketContext.map((metric) => (
              <article
                key={metric.id}
                className="rounded-xl border border-zinc-800 bg-zinc-950 p-4"
              >
                <p className="text-[10px] tracking-wide text-blue-400 uppercase">
                  {SECTOR_LABELS[metric.sector]} · {metric.source}
                </p>
                <h3 className="mt-2 text-xs text-zinc-500">{metric.label}</h3>
                <p className="font-data mt-2 text-xl text-zinc-100">
                  {metric.value}
                </p>
                {metric.change ? (
                  <p className="font-data mt-1 text-xs text-zinc-300">
                    {metric.change}
                  </p>
                ) : null}
                <p className="mt-3 text-[11px] leading-4 text-zinc-600">
                  {metric.period} · {metric.frequency}
                </p>
                {metric.caveat ? (
                  <p className="mt-2 text-[11px] leading-4 text-zinc-700">
                    {metric.caveat}
                  </p>
                ) : null}
              </article>
            ))}
          </div>
        ) : (
          <p className="mt-4 rounded-xl border border-dashed border-zinc-800 p-4 text-xs text-zinc-600">
            No validated structured context is currently available.
          </p>
        )}
      </section>
    </div>
  );
}
