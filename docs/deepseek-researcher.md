# DeepSeek researcher: architecture and qualification

Audit and implementation date: 2026-09-10. Decision: **B — redesign research orchestration while preserving scheduler and staging infrastructure.**

## System model

The scheduler checks independent researcher enablement, key availability, source lock,
task cadence and rolling attempt history. It dispatches one task per cycle. Before a
provider request, the researcher reserves a RUNNING ResearchRun. Success finalizes that
row and stages source documents, candidates and occurrences transactionally; failures
finalize the same row with sanitized diagnostics and no candidates. A crash leaves an
observable attempt that still consumes cadence/rolling allowance.

Source dedup uses the existing source identity logic. Candidate dedup retains old
fingerprints and adds scope/reporting context only for the new pipeline. The review
ledger remains append-only. No researcher operation writes MetricObservation, performs
canonical promotion, approves a review, or grants ingestion/republication permission.

## Failure history and diagnosis

The handoff described three architectures: combined native research/serialization;
native research followed by reasoning-enabled serialization; then native research
followed by a strict local artifact parser. The reported serialization failures exhausted
12,000 and 6,000 output tokens, largely in reasoning. Those are provider completion
failures under an unsuitable serialization contract, not scheduler failures.

The one-stage publication-date rejection was a local contract defect. Coarse dates are
legitimate evidence and are now retained without manufacturing exact dates. The
subsequent memory-only response was correctly rejected. `tool_choice=auto` does not
enforce mandatory research.

Independent live probes during this work found:

| Invocation                                                | Observed result                                                                               |
| --------------------------------------------------------- | --------------------------------------------------------------------------------------------- |
| Flash, specific web-search choice                         | 2.4s, no native calls, textual search imitation                                               |
| Flash, required choice                                    | 1.9s, no native calls, textual tool imitation                                                 |
| Pro, specific choice                                      | 73.8s, genuine search/open actions and final evidence text                                    |
| Pro, required choice                                      | Connection failure; insufficient evidence about tool semantics                                |
| Pro, forced acquisition awaiting terminal completion      | 120s timeout                                                                                  |
| Pro, streaming acquisition awaiting terminal completion   | 120s timeout; trace showed ten actions despite the prompt budget                              |
| Application-bounded acquisition + no-reasoning extraction | Acquisition and extraction completed; schema mode produced trailing text                      |
| JSON-mode extraction                                      | Valid JSON; an untraced source was rejected                                                   |
| Later extraction                                          | Local length limit and missing explicit native-call manifest exposed further contract defects |

These are retained failures, not silently retried attempts. Prompt instructions did not
enforce action limits. The revised orchestration therefore stops acquisition locally
and starts a different, fixed extraction phase. Extraction has used zero reasoning
tokens in the live runs, avoiding the historical reasoning-exhaustion mechanism.

## Capability audit

Official references consulted:

- [Responses API](https://api-docs.deepseek.com/api/create-response/)
- [Responses guide](https://api-docs.deepseek.com/guides/responses_api/)
- [JSON output](https://api-docs.deepseek.com/guides/json_mode/)
- [Tool calls](https://api-docs.deepseek.com/guides/tool_calls/)

The documented native tools, search/open/find actions, specific and required tool choice,
and original web-search item replay support this workflow. Responses is stateless;
replay original native tool items rather than relying on previous_response_id.
Server-side continuation means a forced tool request is not equivalent to one search
followed by guaranteed synthesis. max_tool_calls is not a reliable client action quota.

Documentation is a capability claim, not sufficient operational evidence. Flash failed
native invocation in the probes even with stronger tool choice. Pro is selected because
it demonstrated real native actions. `reasoning=none` is used for extraction; merely
lowering reasoning effort would still permit reasoning to consume its output budget.
The advertised JSON-schema response mode did not guarantee parseable JSON in a live
run. The implementation uses JSON mode plus an explicit schema and strict local Zod
validation. Native call IDs must be supplied explicitly because the restored result
presentation uses other identifiers.

## Architectural alternatives

| Option                                                                         | Reliability and provenance                                                                         | Cost/latency                                                                   | Complexity/testability/staging                                                          |
| ------------------------------------------------------------------------------ | -------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------ | --------------------------------------------------------------------------------------- |
| One Pro forced-search request with final artifact                              | Few moving parts; terminal synthesis and bounded tool continuation remain unreliable               | One request but potentially long native loop                                   | Easy parser tests; compatible; timeout/malformed artifact remain coupled                |
| Bounded acquisition, original native replay, no-thinking extraction (selected) | Mandatory observable search; independent extraction admission; quotes remain provider-extracted    | Two fixed requests, 180s client deadline; acquisition usage may be unavailable | Moderate orchestration; mockable phase boundaries; legacy materializer/staging retained |
| Stage native retrieval events only, defer all claim extraction to a human      | Strongest separation from unsupported model claims; loses automated structured discovery           | One bounded request; minimal extraction tokens                                 | Simple deterministic staging but substantial product/review changes and lower utility   |
| Application-directed native research per preselected source/query              | Better task control but still depends on DeepSeek actually invoking its server tool; more requests | More provider turns and overhead                                               | More states, larger test surface; not justified before the selected path is qualified   |

No option assumes another search provider or unrestricted local crawler. Increasing
output ceilings or adding retry-until-success is not an acceptable alternative.

## Selected conceptual pipeline

```text
scheduler gates + durable lock
  -> reserve RUNNING attempt
  -> Pro native search stream (forced web_search; low reasoning)
  -> completed-search gate + application acquisition boundary
  -> original native tool replay + explicit URL/call manifest
  -> Pro extraction (no tools, no reasoning, JSON mode)
  -> local schema + URL/call/mediation/numeric-support checks
  -> deterministic artifact and candidate materialization
  -> provenance validation
  -> transactional shadow staging + occurrences
  -> optional human approval for ingestion investigation
```

The boundary stops after successful search plus successful page work, or a bounded
number of observed completed actions. A tool-budget stop still needs a successful search
and admissible sources. The system cannot prove that aborting an HTTP stream immediately
stops all server work or billing; it does not report missing acquisition usage as zero.

Source authority and retrieval confidence are independent. A failed primary-source open
can support SEARCH_MEDIATED / TRACE_ATTEMPTED evidence, never direct inspection. The
provider does not expose page bodies in the observed native trace. Quote/value consistency
is checked locally, but quote fidelity to the underlying page is not independently
verified. All resulting candidates remain low-confidence discovery for human investigation.

## Migration and removed assumptions

Additive database migrations add RUNNING to ResearchRunStatus and QUARANTINED to candidate validation state. Existing rows, identities,
reviews and firstSeenAt values are not rewritten. Deploy the migration and regenerate
Prisma before running the new code. A RUNNING row is finalized only while it is still
RUNNING, preventing a second completion from overwriting an existing outcome.

Removed from the active path: Flash default; automatic tool choice; reasoning-enabled
serialization; the requirement that acquisition produce a final artifact; one-call
success as a product requirement; metric-name rewriting; unjustified high confidence;
ephemeral CLI execution that bypassed scheduler accounting. Historical artifact parsers,
nullable legacy telemetry fields and read compatibility remain deliberately supported.

The operator-only `scripts/research-probe.ts` is a diagnostic harness: it runs through
scheduler gates and deliberately records probe outcomes as failed research, never
candidate ingestion. It is not used by unattended scheduling.

## Qualification criteria

Deterministic checks must cover real search versus text imitation; failed opens; wrong
URLs and call IDs; tool-only acquisition; interrupted stream boundaries; malformed JSON;
unsupported numbers/scales; no extraction tools/reasoning; exactly two calls without
retry; partial usage; phase-failure persistence; reservation failure before dispatch;
single finalization; source identity/occurrences; scope-aware candidate identity; immutable
review history; and normal scheduler skip behavior. Run repository tests, typecheck and lint.

Live qualification must use a fixed sample and retain every failure. After a successful
end-to-end smoke test, collect 20 normal-cadence attempts across different days, with no
operator overrides or automatic retries. Require 20/20 real native searches, no unsupported
candidate admission, no safety/mediation violations, zero reasoning tokens during
extraction, and at least 19/20 completed valid discovery results within the client budget.
Manually compare every staged quote and its scope/date/unit to its cited source. Empty
discoveries are valid only where the retained trace supports that outcome. A failed gate
stops qualification for diagnosis; do not discard failures or expand the sample until
the desired percentage appears.

One successful smoke test cannot establish unattended reliability. Keep the default
enablement gate conservative until qualification is complete. Scheduled history and
rolling limits must not be edited to create an artificial clean test window.

## Final verification record

The last pre-acceptance live attempt (`91e96f0e-ff3f-4cc6-b4fe-9a399a506302`)
performed genuine native research, stopped acquisition after 32.5 seconds, and completed
no-reasoning extraction in 16.4 seconds (5,592 reported extraction tokens). It failed
the then-current whole-result numeric gate because a negative percentage did not
literally match the positive magnitude in its quoted “falling” phrase. That failed
ResearchRun remains unchanged.

The final admission code rejects individual unsupported numeric observations and records
reasons in evidence bindings and source limitations. It does not infer a sign or a number
from a verbal fraction. It builds the task summary deterministically rather than retaining
model conclusions about rejected evidence. Sources with only narrative support become
staged LIVE_WEB_INDICATOR candidates, not canonical data-source candidates.

Offline replay of that exact retained native trace and extraction response passed the
full runner, provenance validation and successful staging-draft construction: two source
candidates, two retained numeric observations, the signed observation rejected, and the
verbal fraction retained only as narrative. No new provider request or database write was
made during replay. An earlier OneMusic retained response also passed the local pipeline.
This is regression evidence. The fixed live acceptance sample below supersedes the preliminary smoke-test status; no unattended reliability claim is made.

Database checks before the fixed acceptance sample: 5,996 canonical MetricObservations, four staged source
documents, zero staged candidates and zero review events, unchanged from the audit
baseline. The RUNNING enum migration was applied; failed research attempts and scheduler
history were preserved. The normal rolling-limit check made no research request. Local
researcher enablement remains off; testing used command-scoped enablement and explicit
operator overrides only. No production scheduler limits were changed.

## Fixed live acceptance sample: failed provenance acceptance

The implementation was frozen for exactly two fresh attempts, with no tuning between them:

| ResearchRun                            | Execution                           | Evidence review                                                                               |
| -------------------------------------- | ----------------------------------- | --------------------------------------------------------------------------------------------- |
| `3ed481dc-99f9-4402-be7d-18f920428304` | Completed in 33.4s; two candidates  | **Failed**: one observation attributed a secondary publication's percentage to Music Victoria |
| `b8835029-06de-4170-9b35-3965f25a750a` | Completed in 24.4s; zero candidates | Safe empty discovery: only observed PDF URL failed retrieval; other URLs excluded             |

Both attempts performed real native searches and extraction with zero reasoning tokens.
Execution success is not provenance success. The sample failed acceptance and is not a
basis for enabling unattended operation. No additional live calls were made after this
sample. Further qualification requires a new declared sample after the provenance
changes below, retaining this failed sample in the record.

The concrete Music Victoria candidate `48d51e09-097c-4c0d-93f4-e0d732a9728c` was
quarantined, preserving its observations, run occurrence and source history. An explicit
reason was appended to its limitations. No review event was created. Quarantined evidence
cannot be approved for ingestion investigation, and rediscovery does not clear quarantine.

A deterministic source-passage containment gate now rejects any observation whose quote
is absent from its own source's evidence passage. This catches the observed cross-source
percentage and is covered by a regression test. It does **not** establish independent
page-text verification: the source passage is still provider-extracted. This remaining
limitation is material to qualification and must not be described as verified fact.

Final data check: 5,996 canonical observations and zero review events remain unchanged;
five staged source documents and two candidates exist, one quarantined. Music Victoria
rediscovery reused its existing source record, kept firstSeenAt at 2026-09-07, and advanced
its occurrence count to three. One new APRA source was added. The second run made no
source or candidate writes. Both new migrations were applied. The researcher remains
disabled by default, and scheduler limits remain unchanged.

Final deterministic verification: 150 test files / 938 tests passed; TypeScript typecheck, ESLint and git diff whitespace checks passed.
