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

## 2026-09-10 fresh validation and authorized unattended rollout

Fresh fixed sample (unchanged implementation between its two runs):

- `a5cfa468-7913-44f1-97a4-58587bcc1b1b`: failed closed on a passage over 600 characters;
  real native research and zero-reasoning extraction completed, no candidate staged.
- `d5b68979-8427-4a16-806b-11646630a8ce`: numeric observations matched the cited Music
  Victoria page, but model publication date was one day earlier than its displayed date.
  Candidate quarantined; historical run retained.

The passage limit is now a fixed 1,600 characters, sufficient for the three permitted
400-character observation excerpts plus context. The overall 16,000-character extraction
bound and provider token/call budgets are unchanged. Extraction version v2 requires date
and reporting-period text to appear in its source passage; otherwise the raw model value
is labelled unverified in limitations and exact metadata is not materialized.

A second fixed sample completed in 29.9s and 29.4s:
`7a502bbc-197e-4f7a-962f-70dabba0dced` and
`a7660c06-bc90-49e5-afe0-64fd0d94d287`. Both performed native search and no-reasoning
extraction, but their Music Victoria passages included the truncated number 441 instead
of 2,441. One also embedded a model-reported date into its passage. These are concrete
proof that quote containment is not independent source verification. A wrongly copied
passage can validate itself; the associated candidates were quarantined, not repaired
in place or silently accepted as verified.

The user explicitly selected **Enable unattended unverified discovery** after these
limitations were explained. This supersedes the earlier disabled rollout status, not the
failed qualification record. The system now distinguishes model discovery from verified
facts in persisted candidate state: every new native-pipeline candidate is UNVERIFIED.
Previous native candidates were likewise reclassified, except known-bad candidates which
remain QUARANTINED. No review events or historical ResearchRuns were changed. Approval
is still only for ingestion investigation. No canonical write path or UI was added.

A research-only macOS launch agent was installed and verified running. Existing source
cadence, task cadence, locks and rolling history are unchanged. The service initially
waits because validation history exceeds the normal rolling allowance. The next task
is eligible no earlier than 2026-09-11 07:28:32 UTC, then runs at an eligible scheduler
poll while the Mac is awake. The separate 12-hour source inspection cadence also applies.
See [operations](../ops/README.md) for service status, logs and stop/restart commands.

Post-rollout data check: 5,996 canonical observations, zero reviews, two UNVERIFIED
candidates and four QUARANTINED candidates; no unfinished ResearchRuns. Direct manual
validation used only the cited public page, outside the researcher pipeline; no search
provider or crawler was added. The numeric and displayed-date comparison was against
[Music Victoria's announcement](https://www.musicvictoria.com.au/music-victoria-releases-2025-victorian-live-music-venue-audit/).

Unattended discovery is not a claim of independently verified evidence or of meeting the
earlier 20-run reliability threshold. Future UI work must retain these distinctions.

Rollout verification: 150 test files / 941 tests pass; typecheck, lint and whitespace checks pass. A real scoped automatic cycle selected zero sources while cadence was closed. The installed launch agent was verified running after reload, with no worker error-log entries.

## 2026-09-11 GLM advisory auditor implementation — rollout held

GLM is an evidence-consistency auditor, separate from DeepSeek native research,
classifier and Luna. It receives an immutable research-run artifact and its recorded
provider-extracted passages. Those passages are not independent source retrieval.
Its verdict cannot approve a review, change candidate verification, or write canonical
observations. Research persistence completes before an optional audit; audit failure
cannot undo it or repeat DeepSeek research.

The additive `ResearchAuditRun` table stores the input snapshot/hash, prompt/model
version, reservation, result, available usage, and failure. Audit reservations use a
separate PostgreSQL advisory transaction lock. One attempt per run/contract, successful
identical-input caching, and refusal to repeat identical failed/uncertain packets prevent
retry loops. Distinct packets are bounded to four attempts per rolling 24h and 100 total
experimental attempts, including failures and fixtures. A five-minute active reservation
blocks concurrent dispatch; the provider timeout is 45 seconds with zero SDK retries.
There are no bypass flags. These are application limits, not a provider billing cap.
Input packets are capped at 20,000 UTF-8 bytes; output at 1,800 tokens. No tools are sent,
thinking is disabled, and incomplete responses, invented quotes, unexpected reasoning
or model substitution fail closed. Missing usage stays unknown.

The initial free `glm-4.7-flash` request returned HTTP 429 overload. The explicitly
selected implementation model is now `glm-4.7-flashx`; there is no runtime fallback.
[Official API](https://docs.z.ai/api-reference/llm/chat-completion) supports the model,
JSON output and disabled thinking. [Official pricing](https://docs.z.ai/guides/overview/pricing)
listed $0.07/M input and $0.40/M output tokens when checked. A $10 balance is ample for
these bounded experiments at those rates, but neither this implementation nor token
telemetry claims to report the account's actual remaining balance.

Live records, preserved without changing candidates or review history:

- `c9b11bb1-acc8-41a8-915c-45bc1dffe1c7`: free Flash overload, FAILED, no usage returned.
- `bc55fbbd-8ec9-4b87-b91c-73b160692b33`: FlashX synthetic three-case test passed;
  1,081 input / 516 output tokens, zero reasoning, 6.3 seconds.
- `49a89080-1452-4b11-9d1c-30c2537bc724`: FlashX historical research packet;
  1,864 input / 389 output tokens, zero reasoning, 10.1 seconds. It returned valid
  schema and exact excerpts, but incorrectly accepted an unsupported annual qualifier
  and provided an incoherent decline/growth explanation for another finding.

The historical test **failed semantic acceptance**. `SUCCEEDED` on an audit row means
provider execution and deterministic output validation succeeded, not that its verdict
is correct. **RESEARCH_AUDITOR_ENABLED remains false.** Do not enable automatic GLM
calls based only on the synthetic pass. No more live requests were made to fish for a
passing result. The next audit protocol needs field-level scope/period/direction checks
and a frozen regression set including these real errors before another fixed live
acceptance batch. A second model's agreement is never source verification.

Operator commands (read the held-rollout warning above):

- `npm run research:inspect` displays persisted advisory audits alongside runs.
- `RESEARCH_AUDITOR_ENABLED=true npm run research:audit -- --fixtures` is a bounded
  synthetic test; an identical successful packet uses the cache.
- `RESEARCH_AUDITOR_ENABLED=true npm run research:audit -- --run=<uuid>` audits an
  existing successful run without another DeepSeek call. Existing attempts are reused.
- `npm run research:developments` projects at most 50 existing candidates into a
  read-only `development-v1` contract for later UI work. It preserves publication versus
  reporting/discovery times, unverified/quarantined status and review state separately.
  Content hashes exclude occurrence timestamps/counts, so rediscovery is not a new
  measurement. This is a research-only projection; canonical/media adapters and alerts
  are future work. Nothing is exposed in the UI.

Research acquisition/extraction prompts are now task-driven (acquisition v7): sector,
geography, preferred sources and focus come from the task definition. Australian music
remains the only enabled task. Existing research scheduler limits, dedup, occurrences,
review ledger and unattended unverified discovery remain in place.

Final implementation checks: 152 files / 962 tests passed; typecheck, ESLint and
`git diff --check` passed. Repeating the historical audit returned `EXISTING` with
exactly three total audit rows and no additional request. The real read-only development
projection returned six candidates (four quarantined, two unverified). Zero review events
and zero running research runs were observed. Canonical count was 5,998; the two records
added since the earlier 5,996 snapshot were FRED observations created at 07:42 UTC on
September 10, not auditor writes. The research-only launch agent was reloaded and
verified running with an empty error log; GLM auditing remained disabled.

## 2026-09-11 paired shadow researcher and checker — v3 enabled

This supersedes the held v1 rollout above. The pinned auditor model is **GLM-4.7**.
DeepSeek's native research path is unchanged. The paired flow is:

```
DeepSeek native acquisition → extraction → provenance validation → shadow ResearchRun
  → immutable, provider-independent literal field checks (ResearchEvidenceCheck)
  → qualified GLM passage selection → deterministic checking → ResearchAuditRun
  → operator inspection; no candidate approval, canonical promotion or UI publication
```

GLM no longer writes verdicts, reasons, replacements or corrections. Code enumerates
all required claim/metadata/observation fields. GLM copies explicit candidate-scoped
passage IDs such as `1:p3`; unknown, cross-source, duplicated and omitted references
fail closed. Local code checks exact text/numeric boundaries, scale strings, qualifiers,
negation and date strings. It does not infer currency from a dollar sign or dates from
a title. Missing or paraphrased support is conservatively held for review. This deliberately
has false negatives: it is literal evidence checking, not a semantic truth classifier.

Both `TEXT_MATCH_ONLY` and `INSUFFICIENT_EVIDENCE` carry `PROVIDED_TEXT_ONLY` scope.
An internally consistent, wrongly copied passage can still match itself. For example,
441 and an incorrect date inside a model-reported snippet can match the packet while
remaining wrong on the original page. Neither local checks nor GLM agreement establishes
independent source accuracy. Candidates remain UNVERIFIED or QUARANTINED; old VALIDATED
states are not reinterpreted as verified. The independent-source requirement remains
unresolved for sources without approved acquisition/reuse rights. No crawler or new
search provider was added. APRA's published website terms restrict reuse; discovery
has not been treated as permission to copy its pages into a verification store.

Local checks have their own append-only-per-contract table and immutable input snapshot.
They persist before GLM qualification/dispatch and survive provider outages, missing keys
and audit-budget exhaustion. Local and GLM alignment methods are explicitly distinguished.
A bounded excerpt plus passage ID identifies each finding; the complete provided passage
is retained in the snapshot. Original ResearchRuns and review history are not rewritten.

Worker catch-up considers only the newest successful run completed in the last 48 hours.
It can check a run completed by another worker or resume after a budget skip without
re-dispatching research or scanning the entire historical backlog. Per-run/contract
idempotency, input hashing, separate audit locks, provider timeout and zero SDK retries
remain in force. Attempted failed/uncertain packets are not automatically repeated.

A protocol gate requires a successful GLM alignment on the exact version/model/input
hash of a fixed positive-control + annual + decline regression packet. A new unqualified
contract can attempt that fixed packet once under the **normal** audit budget; failure
leaves the gate closed. Qualification is not candidate review approval. Current v3 is
qualified. Normal unattended audits retain the four-attempt/24h and 100-attempt experiment
ceilings. Operator CLI qualification has a separate bounded allowance: at most two fixed
packets per model/contract and at most eight total attempts in a rolling day. It cannot
bypass active-request or lifetime limits; unattended execution never uses that allowance.
Research source/task cadence and the original 2/24h DeepSeek rolling limit are unchanged.

Live validation history for this pass (no new DeepSeek requests):

- FlashX v2 historical batch `52133a40-baec-4c32-9f46-b15eaf0ffc30` and short packet
  `a4a52a8f-6e04-4a43-b461-cb8e4a23b195`: timed out, failures retained, no retries.
- GLM-4.7 v2 `79414685-5429-4d6d-b185-b612d6f7d655`: final response arrived in 11.4s,
  rejected for an unknown numeric passage reference. Numeric reference ambiguity was
  removed in v3 by sending explicit passage IDs. The old raw response was not retained;
  its exact error cause cannot be reconstructed. Future validated-response failures now
  retain bounded final-message diagnostics and available usage, never reasoning text.
- GLM-4.7 v3 protocol packet `e92f1c95-d164-41ec-a656-195f1b7109bb`: PASS, 842 input /
  405 output tokens, 11.9s.
- GLM-4.7 v3 frozen historical batch plus positive control
  `d61f17d1-087f-49e7-990d-1e23a685c95a`: PASS, 1,527 input / 637 output tokens, 19.5s.
  The annual metric was held, numeric excerpts were matched, and decline was recognised
  without a model-generated contradiction story. Both historical candidates remained
  insufficiently supported. Neither successful response reported reasoning-token usage;
  it remains null, not fabricated as zero. Thinking was disabled in the requests.

These fixed tests qualify the narrow protocol for shadow operation; they do not establish
a long-run availability rate or independent factual verification. Failed attempts remain
in rolling accounting, with unknown usage where unavailable. No additional validation
requests will be sent merely to improve the success ratio.

Local `.env` now enables `RESEARCH_AUDITOR_ENABLED=true`; the repository default remains
false. `npm run research:verifier-status` reports qualification, local checks and the
next normal budget slot without a provider call. `research:inspect` includes local and
GLM results. The current day's validation history means automatic GLM work initially
waits for its normal budget. Local checks continue during that wait.

Final deployment verification: 153 test files / 984 tests passed, plus typecheck, ESLint
and whitespace checks. The reloaded research-only launch agent is running. Read-only
status confirms the current GLM-4.7/v3 protocol is qualified and both research/checker
flags are enabled. The automatic catch-up path persisted local checks and returned
`AUDIT_DAILY_LIMIT` without increasing the eight audit records. Two local-check records,
zero review events, 5,998 canonical observations, four quarantined and two unverified
candidates were observed; no running research remained. The next normal GLM budget slot
was 2026-09-12 00:24:54 Melbourne time at this check, followed by an eligible worker poll
while the Mac is awake. No UI integration or candidate-state promotion was performed.
