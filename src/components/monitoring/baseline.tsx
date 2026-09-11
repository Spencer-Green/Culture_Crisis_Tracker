import Link from "next/link";
import type { readBaselines } from "@/services/monitoring/situation-read";
import type { SourceOperationalFreshness } from "@/services/scheduler/freshness-core";
import { dateLabel } from "@/services/monitoring/core";

export function BaselineSignal({
  item,
  collection,
}: {
  item: Awaited<ReturnType<typeof readBaselines>>["values"][number];
  collection?: SourceOperationalFreshness;
}) {
  return (
    <article className="space-y-2 border-b border-zinc-800 py-3">
      <p className="text-xs text-zinc-400">
        {item.proxy ? "Activity / supply proxy" : "Deterministic baseline"} ·{" "}
        {item.country ?? "Tracked international coverage"}
      </p>
      <h3 className="font-medium">{item.label}</h3>
      <p className="font-data text-lg">
        {item.value}{" "}
        <span className="text-sm text-zinc-400">
          {item.change
            ? `· ${item.change}${!item.proxy ? " year over year" : ""}`
            : "· comparison unavailable"}
        </span>
      </p>
      <p className="text-sm text-zinc-300">
        {item.proxy ? "Coverage window" : "Reporting period"}: {item.period}
      </p>
      <p className="text-xs text-zinc-400">
        {item.frequency} · {item.source}
      </p>
      <details className="text-sm text-zinc-400">
        <summary className="cursor-pointer">
          Collection and measurement context
        </summary>
        <div className="mt-2 space-y-2">
          <p>{item.caveat}</p>
          <p>
            Last successful source collection:{" "}
            {dateLabel(collection?.lastSuccessAt, true)}
          </p>
          <p>
            Collection status:{" "}
            {collection?.status.toLowerCase().replaceAll("_", " ") ??
              "unavailable"}
            . This describes the collection process, not the measurement’s
            reporting period.
          </p>
          <Link
            className="text-blue-300 underline"
            href={`/coverage#${item.sourceId}`}
          >
            Source and methodology
          </Link>
          <p>
            <Link className="underline" href={`/${item.sector}/analysis`}>
              Historical series and underlying measurements
            </Link>
          </p>
        </div>
      </details>
    </article>
  );
}
