import type { Metadata } from "next";
import Link from "next/link";

import { MediaArticleList } from "@/components/media-article-list";
import type { MediaSectorSlug } from "@/data-sources/news/media-types";
import { getMediaPageData } from "@/services/media/media";

export const dynamic = "force-dynamic";
export const metadata: Metadata = { title: "Culture Intelligence" };
type SearchParams = Promise<Record<string, string | string[] | undefined>>;
const first = (value: string | string[] | undefined) =>
  Array.isArray(value) ? value[0] : value;

export default async function MediaPage({
  searchParams,
}: {
  searchParams: SearchParams;
}) {
  const params = await searchParams;
  const hours =
    first(params.hours) === "24" ? 24 : first(params.hours) === "72" ? 72 : 168;
  const view = first(params.view) ?? "latest";
  const sector = (["music", "film", "theatre", "gaming"] as string[]).includes(
    view,
  )
    ? (view as MediaSectorSlug)
    : undefined;
  const data = await getMediaPageData({
    hours,
    sector,
    aiOnly: view === "ai-policy",
  });
  const tabs = [
    ["latest", "Latest"],
    ["ai-policy", "AI & Policy"],
    ["music", "Music"],
    ["film", "Film"],
    ["theatre", "Theatre"],
    ["gaming", "Gaming"],
  ] as const;
  return (
    <div className="space-y-6">
      <div>
        <p className="font-data text-xs tracking-[0.2em] text-violet-400 uppercase">
          Media intelligence
        </p>
        <h1 className="mt-2 text-2xl font-semibold tracking-tight text-zinc-50 sm:text-3xl">
          Culture Intelligence
        </h1>
        <p className="mt-2 max-w-3xl text-sm leading-6 text-zinc-400">
          Daily developments across the cultural economy. Headlines, short
          source-supplied snippets, and tracker-derived tags—not validated
          real-world events or a sentiment score.
        </p>
      </div>
      <div className="flex flex-wrap gap-2">
        {tabs.map(([id, name]) => (
          <Link
            key={id}
            href={`/media?view=${id}&hours=${hours}`}
            className={`rounded-full border px-3 py-2 text-xs ${view === id ? "border-violet-700 bg-violet-950/50 text-violet-200" : "border-zinc-800 text-zinc-500"}`}
          >
            {name}
          </Link>
        ))}
        <span className="mx-1 border-l border-zinc-800" />
        {[
          [24, "24H"],
          [72, "3D"],
          [168, "7D"],
        ].map(([value, name]) => (
          <Link
            key={value}
            href={`/media?view=${view}&hours=${value}`}
            className={`rounded-full border px-3 py-2 text-xs ${hours === value ? "border-blue-700 bg-blue-950/50 text-blue-200" : "border-zinc-800 text-zinc-500"}`}
          >
            {name}
          </Link>
        ))}
      </div>
      {data.databaseStatus === "unavailable" ? (
        <div className="rounded-xl border border-amber-900/50 bg-amber-950/20 p-4 text-sm text-amber-200">
          Media intelligence is temporarily unavailable.
        </div>
      ) : null}
      <div className="grid gap-5 xl:grid-cols-4">
        {[
          ["Top Developments", data.highlights.topDevelopments],
          ["AI & Creative Work", data.highlights.aiAndCreativeWork],
          ["Industry Health", data.highlights.industryHealth],
          ["Positive Signals", data.highlights.positiveSignals],
        ].map(([title, articles]) => (
          <section
            key={title as string}
            className="rounded-2xl border border-zinc-800 bg-zinc-950/60 p-4"
          >
            <h2 className="text-sm font-medium text-zinc-200">
              {title as string}
            </h2>
            <div className="mt-3">
              <MediaArticleList
                articles={articles as typeof data.articles}
                compact
                feedbackEnabled
              />
            </div>
          </section>
        ))}
      </div>
      <section className="rounded-2xl border border-zinc-800 bg-zinc-950/60 p-5">
        <div className="flex items-end justify-between gap-4">
          <div>
            <h2 className="text-lg font-semibold text-zinc-100">
              Chronological feed
            </h2>
            <p className="mt-1 text-xs text-zinc-500">
              {data.counts.total} stored article candidates in this view
            </p>
          </div>
          <p className="text-xs text-zinc-600">Newest first</p>
        </div>
        <div className="mt-4">
          <MediaArticleList articles={data.articles} feedbackEnabled />
        </div>
      </section>
    </div>
  );
}
