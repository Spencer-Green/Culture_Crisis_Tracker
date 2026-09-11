import Link from "next/link";
import { notFound } from "next/navigation";
import { readMonitoringArticle } from "@/services/media/media";
import { dateLabel } from "@/services/monitoring/core";
import {
  Notice,
  SourceReference,
  Surface,
} from "@/components/monitoring/evidence";

export default async function DevelopmentDetail({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const result = await readMonitoringArticle(id);
  if (!result.available)
    return <Notice>Development evidence could not be loaded.</Notice>;
  const a = result.article;
  if (!a) notFound();
  return (
    <div className="space-y-5">
      <Link href="/developments" className="text-blue-300">
        All developments
      </Link>
      <p className="text-sm text-zinc-400">
        Documented reporting · {a.sectorSlug}
      </p>
      <h1 className="text-2xl font-semibold">{a.title}</h1>
      <Surface title="Source evidence">
        <SourceReference url={a.canonicalUrl}>{a.publisher}</SourceReference>
        <p className="text-sm">{a.description ?? "No stored excerpt."}</p>
        <dl className="space-y-2 text-sm">
          {Object.entries({
            Published: dateLabel(a.publishedAt),
            "First discovered": dateLabel(a.firstSeenAt, true),
            "Last observed": dateLabel(a.lastSeenAt, true),
            "Last retrieved": dateLabel(a.retrievedAt, true),
            "Event occurred": "Not established separately from publication",
            "Recorded geographic coverage": a.countryCode ?? "Unknown",
          }).map(([key, value]) => (
            <div key={key}>
              <dt className="text-zinc-400">{key}</dt>
              <dd>{value}</dd>
            </div>
          ))}
        </dl>
      </Surface>
      <Surface title="Classification and uncertainty">
        <p className="text-sm">{a.classificationRationale}</p>
        <p className="text-sm text-zinc-400">
          Classification confidence: {a.confidence}. This does not measure the
          truth of the report.
        </p>
        <p className="text-sm text-zinc-400">
          Review: {a.classificationFeedback?.reviewState ?? "Not reviewed"}.
          Classification review is separate from research review and canonical
          ingestion.
        </p>
      </Surface>
    </div>
  );
}
