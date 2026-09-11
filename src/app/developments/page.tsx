import Link from "next/link";
import { MonitorControls } from "@/components/monitoring/filters";
import { DevelopmentStory } from "@/components/monitoring/development-story";
import { Notice, Surface } from "@/components/monitoring/evidence";
import {
  monitorFilters,
  queryHref,
  type Query,
} from "@/services/monitoring/core";
import {
  readDevelopments,
  getPersistedStorySyntheses,
} from "@/services/monitoring/developments-read";

export const metadata = { title: "Developments" };
export default async function DevelopmentsPage({
  searchParams,
}: {
  searchParams: Promise<Query>;
}) {
  const filters = monitorFilters(await searchParams);
  const result = await readDevelopments(filters);
  const page = result.stories.slice((filters.page - 1) * 20, filters.page * 20);
  const syntheses = await getPersistedStorySyntheses(page);
  const href = (n: number) =>
    queryHref("/developments", {
      sector: filters.sector,
      country: filters.country,
      days: filters.days,
      theme: filters.aiOnly ? "ai" : undefined,
      page: n,
    });
  return (
    <div className="space-y-5">
      <h1 className="text-2xl font-semibold">Developments</h1>
      <p className="text-sm text-zinc-400">
        Documented industry changes, grouped by story. Includes recent
        publications and newly discovered older reporting. Ranked by existing
        materiality classification, not article volume; not a sector-health
        score.
      </p>
      <MonitorControls filters={filters} />
      {!result.available ? (
        <Notice>
          Development records are unavailable. Recent coverage cannot be
          assessed.
        </Notice>
      ) : (
        <Surface title="Documented changes">
          {result.truncated ? (
            <Notice>
              This window exceeded the 2,000-article read limit. The results are
              incomplete; try the 24-hour window.
            </Notice>
          ) : null}
          <p className="text-xs text-zinc-400">
            {result.stories.length} qualifying story groups in loaded coverage.
            Geographic filters use recorded article coverage; they do not prove
            the event location.
          </p>
          {page.length ? (
            page.map((story) => (
              <DevelopmentStory
                key={story.clusterId}
                story={story}
                synthesis={syntheses.get(story.clusterId)}
              />
            ))
          ) : (
            <p>
              No qualifying developments in this window. Check collection status
              before interpreting this as an absence of change.
            </p>
          )}
          <nav
            aria-label="Development pagination"
            className="flex gap-5 text-sm"
          >
            <span>Page {filters.page}</span>
            {filters.page > 1 ? (
              <Link href={href(filters.page - 1)}>Previous</Link>
            ) : null}
            {filters.page * 20 < result.stories.length ? (
              <Link href={href(filters.page + 1)}>Next</Link>
            ) : null}
          </nav>
        </Surface>
      )}
      <div className="flex flex-wrap gap-5 text-sm text-blue-300">
        <Link href="/developments/articles">Full article intake</Link>
        <Link href="/developments/intake">GDELT intake</Link>
        <Link href="/activity">Scheduled performances and supply</Link>
        <Link href="/monitor">Collection status</Link>
      </div>
    </div>
  );
}
