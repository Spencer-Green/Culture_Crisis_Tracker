import Link from "next/link";

import { MediaClassificationFeedback } from "@/components/media-classification-feedback";
import {
  getEffectiveEventType,
  getEffectiveSignalDirection,
  type MediaArticleView,
} from "@/services/media/media-service-core";
import type { SignalDirection } from "@/data-sources/news/media-types";
import { LunaStoryInsight } from "@/components/luna-story-insight";
import type { StorySynthesisPresentationMap } from "@/services/media/production-story-synthesis-presentation";

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

function signalLabel(value: SignalDirection): string {
  return value === "AMBIGUOUS" ? "ambiguous" : `${value.toLowerCase()} signal`;
}

function signalClass(value: SignalDirection): string {
  if (value === "POSITIVE") return "text-emerald-400";
  if (value === "NEGATIVE") return "text-rose-400";
  return "text-amber-400";
}

export function MediaArticleList({
  articles,
  compact = false,
  dense = false,
  feedbackEnabled = false,
  storySyntheses = {},
  emptyMessage = "No developments match this view.",
}: {
  articles: readonly MediaArticleView[];
  compact?: boolean;
  dense?: boolean;
  feedbackEnabled?: boolean;
  storySyntheses?: StorySynthesisPresentationMap;
  emptyMessage?: string;
}) {
  if (articles.length === 0)
    return (
      <p className="rounded-xl border border-dashed border-zinc-800 p-5 text-sm text-zinc-600">
        {emptyMessage}
      </p>
    );
  return (
    <div className={dense ? "divide-y divide-zinc-800" : "space-y-3"}>
      {articles.map((article) => (
        <article
          key={article.id}
          className={
            dense
              ? "py-3 first:pt-0 last:pb-0"
              : "rounded-xl border border-zinc-800 bg-zinc-950 p-4"
          }
        >
          <div
            className={`flex flex-wrap gap-2 text-[10px] tracking-wide text-zinc-500 uppercase ${dense ? "mt-1" : ""}`}
          >
            <span>{label(article.sectorSlug)}</span>
            {getEffectiveEventType(article) ? (
              <span className="text-blue-400">
                {label(getEffectiveEventType(article)!)}
              </span>
            ) : null}
            <span className={signalClass(getEffectiveSignalDirection(article))}>
              {signalLabel(getEffectiveSignalDirection(article))}
            </span>
            {!dense ? <span>importance {article.importance}/5</span> : null}
            {!dense ? <span>{article.confidence} confidence</span> : null}
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
          {!compact && !dense && article.description ? (
            <p className="mt-2 text-xs leading-5 text-zinc-500">
              {article.description}
            </p>
          ) : null}
          {!dense ? (
            <LunaStoryInsight result={storySyntheses[article.id]} />
          ) : null}
          <p className={`${dense ? "mt-1" : "mt-3"} text-xs text-zinc-600`}>
            {article.publisher} · {age(article.publishedAt)} ·{" "}
            {article.sourceMatches.join(" + ")}
          </p>
          {!compact && !dense ? (
            <p className="mt-2 text-[11px] leading-4 text-zinc-700">
              Tracker-derived: {article.classificationRationale}
            </p>
          ) : null}
          {feedbackEnabled ? (
            <MediaClassificationFeedback
              articleId={article.id}
              initialFeedback={article.classificationFeedback}
            />
          ) : null}
        </article>
      ))}
    </div>
  );
}
