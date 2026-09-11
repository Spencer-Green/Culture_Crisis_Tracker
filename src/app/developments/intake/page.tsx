import Link from "next/link";
import { getIndustryEventCandidates } from "@/services/industry-events/events";
import { first, dateLabel, type Query } from "@/services/monitoring/core";
import {
  Notice,
  SourceReference,
  Surface,
} from "@/components/monitoring/evidence";
export const metadata = { title: "GDELT intake" };
export default async function Intake({
  searchParams,
}: {
  searchParams: Promise<Query>;
}) {
  const q = await searchParams;
  const days = first(q.days) === "7" ? 7 : 30;
  const result = await getIndustryEventCandidates({
    days,
    countryCode: first(q.country),
    sectorSlug: first(q.sector),
    domain: first(q.domain),
  }).then(
    (items) => ({ available: true, items }),
    () => ({ available: false, items: [] }),
  );
  return (
    <div className="space-y-5">
      <Link href="/developments" className="text-blue-300">
        Documented developments
      </Link>
      <h1 className="text-2xl font-semibold">GDELT intake</h1>
      <p className="text-sm text-zinc-400">
        Unreviewed media candidates, excluded from the curated Situation stream.
        Up to 500 recent records; classification is not verification.
      </p>
      <form className="flex flex-wrap gap-3">
        <label>
          Period{" "}
          <select
            className="rounded border border-zinc-700 bg-zinc-950 p-2"
            name="days"
            defaultValue={days}
          >
            <option value="7">7 days</option>
            <option value="30">30 days</option>
          </select>
        </label>
        <label>
          Domain{" "}
          <input
            className="rounded border border-zinc-700 p-2"
            name="domain"
            defaultValue={first(q.domain)}
          />
        </label>
        <button className="rounded border border-zinc-600 px-3">Filter</button>
      </form>
      {!result.available ? (
        <Notice>Intake records are unavailable.</Notice>
      ) : (
        <Surface title="Candidate reporting">
          {!result.items.length ? (
            <p>No matching records in loaded coverage.</p>
          ) : (
            result.items.map((c) => (
              <article
                key={c.id}
                className="space-y-2 border-b border-zinc-800 pb-3"
              >
                <h2 className="font-medium">{c.title}</h2>
                <p className="text-sm text-zinc-400">
                  {c.sectorSlug} · {c.countryCode ?? "Unknown scope"} ·
                  Published {dateLabel(c.publishedAt)} · {c.reviewState}
                </p>
                <p className="text-sm text-zinc-400">
                  {c.classificationRationale}
                </p>
                <SourceReference url={c.sourceUrl}>{c.domain}</SourceReference>
              </article>
            ))
          )}
        </Surface>
      )}
    </div>
  );
}
