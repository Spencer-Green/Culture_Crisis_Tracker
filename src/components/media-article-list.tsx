import Link from "next/link";

import type { MediaArticleView } from "@/services/media/media-service-core";

function age(value: string): string {
  const hours = Math.max(
    0,
    Math.floor((Date.now() - new Date(value).getTime()) / 3_600_000),
  );
  return hours < 1
    ? "<1h ago"
    : hours < 24
      ? `${hours}h ago`
      : `${Math.floor(hours / 24)}d ago`;
}

function label(value: string): string {
  return value
    .replaceAll("_", " ")
    .replaceAll("industry-events", "cross-sector")
    .toLowerCase();
}

export function MediaArticleList({
  articles,
  compact = false,
  emptyMessage = "No developments match this view.",
}: {
  articles: readonly MediaArticleView[];
  compact?: boolean;
  emptyMessage?: string;
}) {
  if (articles.length === 0)
    return (
      <p className="rounded-xl border border-dashed border-zinc-800 p-5 text-sm text-zinc-600">
        {emptyMessage}
      </p>
    );
  return (
    <div className="space-y-3">
      {articles.map((article) => (
        <article
          key={article.id}
          className="rounded-xl border border-zinc-800 bg-zinc-950 p-4"
        >
          <div className="flex flex-wrap gap-2 text-[10px] tracking-wide text-zinc-500 uppercase">
            <span>{label(article.sectorSlug)}</span>
            {article.eventType ? (
              <span className="text-blue-400">{label(article.eventType)}</span>
            ) : null}
            {article.aiImpactType ? (
              <span className="text-violet-400">
                {label(article.aiImpactType)}
              </span>
            ) : null}
            <span>importance {article.importance}/5</span>
            <span>{article.confidence} confidence</span>
          </div>
          <h3 className="mt-2 text-sm leading-5 font-medium text-zinc-100">
            <Link
              href={article.canonicalUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="hover:text-blue-300"
            >
              {article.title}
            </Link>
          </h3>
          {!compact && article.description ? (
            <p className="mt-2 text-xs leading-5 text-zinc-500">
              {article.description}
            </p>
          ) : null}
          <p className="mt-3 text-xs text-zinc-600">
            {article.publisher} · {age(article.publishedAt)} ·{" "}
            {article.sourceMatches.join(" + ")}
          </p>
          {!compact ? (
            <p className="mt-2 text-[11px] leading-4 text-zinc-700">
              Tracker-derived: {article.classificationRationale}
            </p>
          ) : null}
        </article>
      ))}
    </div>
  );
}
