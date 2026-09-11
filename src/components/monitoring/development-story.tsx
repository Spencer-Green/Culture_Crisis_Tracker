import Link from "next/link";
import { LunaStoryInsight } from "@/components/luna-story-insight";
import type { MediaStoryCluster } from "@/services/media/daily-brief-core";
import type { StorySynthesisReadResult } from "@/services/media/production-story-synthesis-core";
import { dateLabel } from "@/services/monitoring/core";
import { storyDiscovery } from "@/services/monitoring/developments-core";
import { SourceReference } from "./evidence";

export function DevelopmentStory({
  story,
  synthesis,
}: {
  story: MediaStoryCluster;
  synthesis?: StorySynthesisReadResult;
}) {
  return (
    <article className="space-y-2 border-b border-zinc-800 py-3">
      <p className="text-xs text-zinc-400">
        Documented reporting · {story.sector ?? "Cross-sector"}
      </p>
      <h3 className="font-medium">
        <Link
          className="hover:underline"
          href={`/developments/${story.representativeArticleId}`}
        >
          {story.canonicalHeadline}
        </Link>
      </h3>
      <p className="line-clamp-2 text-sm text-zinc-400">
        {story.snippet ??
          "Inspect the source reporting for the documented claim."}
      </p>
      <p className="text-xs text-zinc-400">
        Published: {dateLabel(story.earliestPublishedAt)} · {story.sourceCount}{" "}
        source {story.sourceCount === 1 ? "record" : "records"}
      </p>
      <details className="text-sm">
        <summary className="cursor-pointer text-zinc-400">
          Sources and interpretation
        </summary>
        <div className="mt-3 space-y-3">
          <p className="text-xs text-zinc-400">
            First discovered among these records:{" "}
            {dateLabel(storyDiscovery(story), true)}. Publication dates do not
            establish when the underlying event occurred. Multiple reports are
            not necessarily independent corroboration.
          </p>
          {story.sources.map((source) => (
            <p key={source.articleId}>
              <SourceReference url={source.url}>
                {source.publisher}: {source.headline}
              </SourceReference>{" "}
              <span className="text-xs text-zinc-400">
                Published {dateLabel(source.publishedAt)}
              </span>
            </p>
          ))}
          <p className="text-xs text-zinc-400">
            Classification: {story.confidence} confidence ·{" "}
            {story.humanReviewState}. Classification review does not verify the
            reported facts.
          </p>
          <p className="text-xs text-zinc-400">
            Classified as{" "}
            {story.eventType?.toLowerCase().replaceAll("_", " ") ??
              "unspecified"}
            . Classification-based interpretation: {story.whyItMatters}
          </p>
          <LunaStoryInsight result={synthesis} />
        </div>
      </details>
    </article>
  );
}
