import Link from "next/link";
import { MonitorControls } from "@/components/monitoring/filters";
import {
  Notice,
  ResearchFinding,
  Surface,
} from "@/components/monitoring/evidence";
import {
  monitorFilters,
  queryHref,
  type Query,
} from "@/services/monitoring/core";
import {
  readResearch,
  RESEARCH_PAGE_SIZE,
} from "@/services/monitoring/research-read";

export const metadata = { title: "Research Findings" };
export default async function ResearchPage({
  searchParams,
}: {
  searchParams: Promise<Query>;
}) {
  const filters = monitorFilters(await searchParams);
  const result = await readResearch(filters);
  const href = (page: number) =>
    queryHref("/research", {
      sector: filters.sector,
      country: filters.country,
      days: filters.days,
      state: filters.quarantine ? "quarantined" : "provisional",
      view: filters.recent ? "new" : "all",
      page,
    });
  return (
    <div className="space-y-5">
      <h1 className="text-2xl font-semibold">Research Findings</h1>
      <p className="max-w-3xl text-sm text-zinc-400">
        DeepSeek discovers evidence. GLM selects source-scoped passages; local
        checks assess literal support in supplied text. Findings remain
        provisional, even when text matches.
      </p>
      <MonitorControls research filters={filters} />
      {!result.available ? (
        <Notice>
          Research records are unavailable. This does not mean no findings
          exist.
        </Notice>
      ) : (
        <Surface
          title={
            filters.quarantine
              ? "Quarantined findings"
              : "Provisional discoveries"
          }
        >
          <p className="text-sm text-zinc-400">
            {result.total} matching findings · ordered by first discovery, not
            rediscovery. Geographic filters match explicit country labels,
            including regional labels ending in that country; ambiguous scopes
            remain under all coverage.
          </p>
          {result.items.length ? (
            result.items.map((item) => (
              <ResearchFinding key={item.id} item={item} />
            ))
          ) : (
            <p>No findings match these filters.</p>
          )}
          <nav aria-label="Research pagination" className="flex gap-5 text-sm">
            <span>Page {filters.page}</span>
            {filters.page > 1 ? (
              <Link href={href(filters.page - 1)}>Previous</Link>
            ) : null}
            {filters.page * RESEARCH_PAGE_SIZE < result.total ? (
              <Link href={href(filters.page + 1)}>Next</Link>
            ) : null}
          </nav>
        </Surface>
      )}
      <Link className="text-sm text-blue-300 underline" href="/monitor">
        Research and collection status
      </Link>
    </div>
  );
}
