import Link from "next/link";
import { Notice, Surface } from "@/components/monitoring/evidence";
import { readCollectionStatus } from "@/services/monitoring/situation-read";
import { readResearchOperations } from "@/services/monitoring/operations-read";
import { dateLabel } from "@/services/monitoring/core";

export const metadata = { title: "Monitor Status" };
export default async function MonitorPage() {
  const [collection, research] = await Promise.all([
    readCollectionStatus(),
    readResearchOperations(),
  ]);
  const sources = [...collection.sources].sort(
    (a, b) =>
      Number(b.enabled) - Number(a.enabled) ||
      a.sourceId.localeCompare(b.sourceId),
  );
  return (
    <div className="space-y-5">
      <h1 className="text-2xl font-semibold">Monitor Status</h1>
      <p className="text-sm text-zinc-400">
        Stored collection and research activity. Configuration does not prove
        the worker is running. Reading this page starts no research, audits or
        collection.
      </p>
      <Surface title="Research and passage selection">
        <p className="text-sm">
          Research configured:{" "}
          {research.configuration.researchEnabled ? "enabled" : "disabled"} ·
          GLM passage selection configured:{" "}
          {research.configuration.passageSelectionEnabled
            ? "enabled"
            : "disabled"}
        </p>
        {!research.available ? (
          <Notice>Research operational records are unavailable.</Notice>
        ) : (
          research.tasks.map((task) => (
            <article
              className="space-y-2 border-t border-zinc-800 pt-3 text-sm"
              key={task.id}
            >
              <h3 className="font-medium">
                {task.geography} · {task.sector}
              </h3>
              <p className="text-zinc-400">
                {task.id} · task {task.enabled ? "enabled" : "disabled"} ·
                nominal cadence {task.cadenceMinutes / 60} hours
              </p>
              <p>
                Last attempt:{" "}
                {dateLabel(task.lastAttempt?.startedAt.toISOString(), true)} ·{" "}
                {task.lastAttempt?.status ?? "No attempt recorded"}
              </p>
              <p>
                Last successful research:{" "}
                {dateLabel(
                  task.lastCompleted?.completedAt?.toISOString(),
                  true,
                )}
              </p>
              {task.lastAttempt?.failureKind ? (
                <p>Last failure: {task.lastAttempt.failureKind}</p>
              ) : null}
              <p className="text-zinc-400">
                Cadence, rolling limits and locks still govern execution. A
                completed check may produce no new discovery.
              </p>
            </article>
          ))
        )}
        <details>
          <summary className="cursor-pointer text-sm">
            Recent GLM attempts
          </summary>
          <div className="mt-3 space-y-2">
            {research.available && !research.audits.length ? (
              <p className="text-sm">No linked attempts recorded.</p>
            ) : null}
            {research.audits.map((audit) => (
              <p className="text-xs text-zinc-400" key={audit.id}>
                {dateLabel(audit.startedAt.toISOString(), true)} ·{" "}
                {audit.modelId} · {audit.status} · research run{" "}
                {audit.researchRunId}
              </p>
            ))}
          </div>
        </details>
      </Surface>
      <Surface title="Source collection">
        {collection.databaseStatus !== "available" ? (
          <Notice>
            Collection state is unavailable. Existing evidence may still be
            readable.
          </Notice>
        ) : null}
        <p className="text-sm text-zinc-400">
          Collection cadence is not a publisher release calendar. A recent
          collection does not make an old reporting period new.
        </p>
        {sources.map((source) => (
          <details
            id={source.sourceId}
            key={source.sourceId}
            className="rounded border border-zinc-800 p-3 text-sm"
          >
            <summary className="cursor-pointer">
              {source.sourceId} ·{" "}
              {source.status.toLowerCase().replaceAll("_", " ")} ·{" "}
              {source.enabled ? "enabled" : "disabled"}
            </summary>
            <dl className="mt-3 grid gap-3 sm:grid-cols-2">
              {Object.entries({
                "Last attempt": dateLabel(source.lastAttemptAt, true),
                "Last successful collection": dateLabel(
                  source.lastSuccessAt,
                  true,
                ),
                "Latest stored observation / source date":
                  source.latestObservationPeriod ?? "Not recorded",
                "Next scheduled eligibility": dateLabel(
                  source.nextScheduledAt,
                  true,
                ),
                "Last failure": dateLabel(source.lastFailureAt, true),
                "Collection guidance": source.action,
              }).map(([key, value]) => (
                <div key={key}>
                  <dt className="text-zinc-400">{key}</dt>
                  <dd>{value}</dd>
                </div>
              ))}
            </dl>
          </details>
        ))}
      </Surface>
      <Link className="text-sm text-blue-300" href="/monitor/sources">
        Detailed source configuration registry
      </Link>
    </div>
  );
}
