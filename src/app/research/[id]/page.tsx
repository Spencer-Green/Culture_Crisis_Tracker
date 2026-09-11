import Link from "next/link";
import { notFound } from "next/navigation";
import {
  Notice,
  SourceReference,
  Surface,
} from "@/components/monitoring/evidence";
import {
  accessLabel,
  dateLabel,
  observations,
  reviewLabel,
} from "@/services/monitoring/core";
import { presentCheck } from "@/services/monitoring/check-presentation";
import { readResearchDetail } from "@/services/monitoring/research-read";

export const metadata = { title: "Research evidence" };
export default async function ResearchDetail({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const result = await readResearchDetail(id);
  if (!result.available)
    return (
      <Notice>
        Research evidence could not be loaded.{" "}
        <Link href="/research">Return to Research</Link>
      </Notice>
    );
  const candidate = result.candidate;
  if (!candidate) notFound();
  const source = candidate.sourceDocument;
  return (
    <div className="space-y-5">
      <Link className="text-sm text-blue-300 underline" href="/research">
        All research findings
      </Link>
      <p className="text-sm text-zinc-400">
        {candidate.sector} · {candidate.geography}
      </p>
      <h1 className="text-2xl font-semibold">{candidate.claim}</h1>
      {candidate.validationState === "QUARANTINED" ? (
        <Notice>
          Quarantined. Excluded from situation highlights and assessments. A
          separate structured quarantine reason is not recorded; inspect
          limitations and review history below.
        </Notice>
      ) : (
        <p className="border-l-2 border-zinc-500 pl-3">
          Provisional finding — not independently verified. Local checks cannot
          establish that provider-supplied text reproduces the original source
          accurately.
        </p>
      )}
      <Surface title="Source and time">
        <SourceReference url={source.canonicalUrl}>
          {source.publisher} — {source.title}
        </SourceReference>
        <dl className="grid gap-3 text-sm sm:grid-cols-2">
          {Object.entries({
            Published:
              source.publishedAt?.toISOString().slice(0, 10) ??
              source.publishedAtRaw,
            "Reporting period": source.reportingPeriodRaw,
            "First discovered": dateLabel(
              candidate.firstSeenAt.toISOString(),
              true,
            ),
            "Last observed": dateLabel(
              candidate.lastSeenAt.toISOString(),
              true,
            ),
            Occurrences: String(candidate.occurrenceCount),
            "Source access": accessLabel(
              candidate.traceConfidence,
              source.evidenceMediation,
            ),
            "Source authority (reported)": candidate.authority,
            "Source role (reported)": candidate.sourceRole,
          }).map(([label, value]) => (
            <div key={label}>
              <dt className="text-zinc-400">{label}</dt>
              <dd>{value || "Unknown"}</dd>
            </div>
          ))}
        </dl>
        <p className="text-xs text-zinc-400">
          Source metadata above is the current staged record. The run-specific
          evidence below preserves the claim and text actually checked.
        </p>
      </Surface>
      <Surface title="Staged observations">
        {observations(candidate.observations).map((row, index) => (
          <div className="border-b border-zinc-800 pb-2 text-sm" key={index}>
            <p>
              {row.metric}: {row.value} {row.unit}
            </p>
            <p className="text-zinc-400">
              Qualifier: {row.qualifier || "None recorded"}
            </p>
          </div>
        ))}
        <details>
          <summary className="cursor-pointer text-sm">
            Recorded limitations and original structured extraction
          </summary>
          <pre className="mt-3 max-h-96 overflow-auto text-xs break-words whitespace-pre-wrap text-zinc-400">
            {JSON.stringify(
              {
                limitations: candidate.limitations,
                observations: candidate.observations,
              },
              null,
              2,
            )}
          </pre>
        </details>
      </Surface>
      <Surface title="Passages and checks by research occurrence">
        <p className="text-sm text-zinc-400">
          Most recent 20 occurrences. Each result is bound to this candidate in
          that run’s stored input. A missing check is not a rejection; a text
          match is not truth verification.
        </p>
        {!candidate.runOccurrences.length ? (
          <p>No occurrence evidence recorded.</p>
        ) : null}
        {candidate.runOccurrences.map((occurrence) => {
          const checks = [
            ...occurrence.run.evidenceChecks.map((check) => ({
              id: check.id,
              label: "Local literal checks",
              status: "Recorded",
              snapshot: check.inputSnapshot,
              result: check.result,
            })),
            ...occurrence.run.audits.map((audit) => ({
              id: audit.id,
              label: `GLM recorded check · ${audit.modelId}`,
              status: audit.status,
              snapshot: audit.inputSnapshot,
              result: audit.result,
            })),
          ];
          return (
            <details
              key={occurrence.id}
              className="rounded border border-zinc-800 p-3"
            >
              <summary className="cursor-pointer text-sm">
                Observed {dateLabel(occurrence.observedAt.toISOString(), true)}{" "}
                · {checks.length} check records
              </summary>
              <div className="mt-3 space-y-4">
                <p className="text-xs text-zinc-400">
                  Research run {occurrence.runId} · {occurrence.run.status}
                </p>
                {!checks.length ? (
                  <p>Checks pending or unavailable for this occurrence.</p>
                ) : null}
                {checks.map((check) => {
                  const presentation = presentCheck(
                    check.snapshot,
                    check.result,
                    id,
                  );
                  return (
                    <section
                      key={check.id}
                      className="space-y-2 border-t border-zinc-800 pt-3"
                    >
                      <h3 className="font-medium">
                        {check.label} · {check.status}
                      </h3>
                      {presentation ? (
                        <>
                          <p className="text-sm">{presentation.label}</p>
                          <p className="text-sm text-zinc-400">
                            Claim at check time: {presentation.candidate.claim}
                          </p>
                          <SourceReference
                            url={presentation.candidate.sourceUrl}
                          >
                            Source bound to this check
                          </SourceReference>
                          <p className="text-xs text-zinc-400">
                            Publication evidence:{" "}
                            {presentation.candidate.publicationDate} · Reporting
                            period: {presentation.candidate.reportingPeriod} ·{" "}
                            {presentation.candidate.evidence.mediation}
                          </p>
                          <details>
                            <summary className="cursor-pointer text-sm">
                              Provider-supplied evidence passage
                            </summary>
                            <blockquote className="mt-2 border-l border-zinc-500 pl-3 text-sm whitespace-pre-wrap text-zinc-300">
                              {presentation.candidate.evidence.passage ||
                                "No passage recorded"}
                            </blockquote>
                          </details>
                          <p className="text-sm text-zinc-400">
                            {presentation.reason}
                          </p>
                          {presentation.findings.map((finding, i) => (
                            <details key={i} className="text-sm">
                              <summary className="cursor-pointer">
                                {finding.field} ·{" "}
                                {finding.check === "MATCHED"
                                  ? "Literal match"
                                  : "Not established"}
                              </summary>
                              <blockquote className="my-2 border-l border-zinc-500 pl-3">
                                {finding.evidenceQuote ||
                                  "No supporting passage selected"}
                              </blockquote>
                              <p className="text-zinc-400">
                                {finding.explanation}
                              </p>
                            </details>
                          ))}
                        </>
                      ) : (
                        <p className="text-sm text-zinc-400">
                          No displayable candidate-bound evidence in this check
                          record. No verification conclusion can be drawn.
                        </p>
                      )}
                    </section>
                  );
                })}
              </div>
            </details>
          );
        })}
      </Surface>
      <Surface title="Review history">
        <p className="text-sm text-zinc-400">
          Approval authorizes ingestion investigation only. This view cannot
          approve findings or change review history.
        </p>
        {!candidate.reviewEvents.length ? (
          <p>Not reviewed.</p>
        ) : (
          candidate.reviewEvents.map((event) => (
            <article
              key={event.id}
              className="border-t border-zinc-800 pt-3 text-sm"
            >
              <p>
                {reviewLabel(event.decision)} ·{" "}
                {dateLabel(event.reviewedAt.toISOString(), true)}
              </p>
              <p className="text-zinc-400">{event.reason}</p>
              <details>
                <summary className="cursor-pointer">
                  Record and evidence version
                </summary>
                <p>
                  Review {event.id} · Supersedes:{" "}
                  {event.supersedesReviewEventId ?? "none"}
                </p>
                <pre className="max-h-64 overflow-auto text-xs break-words whitespace-pre-wrap">
                  {JSON.stringify(event.candidateSnapshot, null, 2)}
                </pre>
              </details>
            </article>
          ))
        )}
      </Surface>
    </div>
  );
}
