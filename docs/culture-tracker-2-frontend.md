# Culture Tracker 2.0 — functional information architecture

## Scope

Passes 1–6 establish a read-only situation-monitoring interface. Final typography, palette, visual density and interaction polish are reserved for the separate design-board pass. Existing source adapters, researcher orchestration, GLM validation, schedules, review writes, deduplication and canonical persistence are unchanged.

## Routes

| Route                                    | Role                                                                                                                           |
| ---------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------ |
| `/`                                      | Situation: scoped baseline readings, sector snapshot, documented developments, separate provisional research and coverage gaps |
| `/sectors`                               | Music, Film, Theatre and Gaming index                                                                                          |
| `/music`, `/film`, `/theatre`, `/gaming` | Shared sector situation template                                                                                               |
| `/<sector>/analysis`                     | Preserved historical charts and source-specific analysis                                                                       |
| `/developments`                          | Material story groups from recent publication/discovery coverage                                                               |
| `/developments/<article-id>`             | Stable source-record inspection link; not a durable cross-article event identity                                               |
| `/developments/articles`                 | Full article intake and existing classification-feedback tools                                                                 |
| `/developments/intake`                   | GDELT candidates, separate from curated developments                                                                           |
| `/activity`                              | Ticketmaster scheduled performances and longitudinal supply                                                                    |
| `/research`                              | Paginated provisional or quarantined findings, sorted by first discovery                                                       |
| `/research/<candidate-id>`               | Source, observations, occurrence-linked passages/checks and review history                                                     |
| `/coverage`                              | Evidence classes, assessment/time methods, coverage and source registry                                                        |
| `/monitor`                               | Stored source and research operations; no dispatch controls                                                                    |
| `/monitor/sources`                       | Preserved detailed configuration registry                                                                                      |
| `/consumer-spending`                     | Cross-sector demand analysis                                                                                                   |

Legacy Brief, Media, Industry Events, Data Sources, AI & Policy and Settings routes redirect into this hierarchy. Navigation exposes six destinations with active state and mobile/keyboard access.

## Read models

New projections live in `src/services/monitoring`. They use stored records only. No API route or browser action is added to dispatch research, GLM or ingestion. Refresh view rereads server data.

Research list uses the existing development projection (including historical VALIDATED → UNVERIFIED), plus a presentation-only latest-occurrence check summary. Default queries exclude quarantine; new-window queries use firstSeenAt. LastSeenAt never drives ordering or newness. Geographic selection accepts explicit country labels and regional labels ending in an explicit country; ambiguous geography is available in all coverage.

Research detail follows ResearchCandidate → ResearchRunCandidate → ResearchRun → audit/check records. A result index is resolved against that record's immutable inputSnapshot candidate key. It is never matched to the current candidate ordering or an unrelated latest run. Synthetic evidence packets are excluded. Full review history is read-only; the latest 20 research occurrences are available. Current mutable source metadata is explicitly distinguished from historical check inputs. No structured quarantine-reason field is invented.

Media views now optionally expose existing firstSeenAt/lastSeenAt fields. The new monitoring query reads a bounded union of recent publications and newly discovered older articles. Existing grouping/materiality rules are reused; ranking prioritizes classification importance then publication rather than source volume. Classification-based explanations are inspectable and attributed, not presented as established event facts. Persisted Luna interpretation is read in one batch on Developments, never generated on page access.

Structural anchors reuse existing source-specific calculations and periods, supplemented by MVT and LPA annual readings. Proxies are separated from economic baselines. LPA year-over-year display requires consecutive years. There is no new composite health calculation or research-to-metric conversion.

## Semantics

- Provisional is neither false nor independently verified.
- Literal text matches do not authenticate provider quotations or establish truth.
- A provider-reported page open is not independent application retrieval.
- Failed opens cannot become inspected sources.
- Approval means ingestion investigation, never canonical truth.
- Publication, reporting period, discovery, last observation and collection timestamps remain separate.
- Unknown/coarse dates are retained; no synthetic publication precision.
- Annual observations retain their period after a recent collection.
- Collection schedules are not publisher release calendars; configuration is not worker liveness.
- Missing coverage is not stability; read failures are not successful empty feeds.
- Quarantined research is excluded from Situation, sector highlights and assessments.
- Content hash changes alone do not create material-change alerts: hashes also contain provenance metadata.

## Explicit limits

No overall sector-health category is synthesized. The UI presents scoped measurements and a broad-assessment fallback. Stronger condition/direction labels require a separate defensible methodology.

No since-last-visit ledger, persistent importance pinning, semantic change ledger, cross-tier identity merge or automatic alert system is fabricated from the current contracts. Developments are a bounded recent window, not an exhaustive event census. Source counts are not independent corroboration. Research candidate variants may refer to the same source; deduplication is not changed by the UI.

List limits are explicit: 20 research findings per page, 20 occurrence histories per detail, 2,000 recent media records before story selection, 20 developments per page, and the existing 500-record GDELT intake bound. Source health and diagnostic information remain secondary to situational content.

## Validation

Deterministic tests cover publication precision, failed access, quarantine exclusion, discovery ordering, input bounds, safe source URLs, candidate/index binding, historical/synthetic check treatment, failure-vs-empty states, story grouping, geography, rediscovery dates and read-only/no-inference boundaries. Existing chart-preservation tests follow moved analysis routes. Browser checks exercise filtering, disclosure, navigation, source details and responsive layout. Full unit suite, typecheck, lint and production build are required before handoff.

No live provider validation or production-data edits are part of frontend acceptance. The independently running scheduler may continue to add records during checks.

### Acceptance results

- All 1,010 tests across 159 test files passed.
- Lint, production TypeScript checking, optimized production build and diff whitespace checks passed.
- Browser checks covered research filtering, provisional/quarantined details, keyboard disclosure, occurrence-linked checks, navigation and operational status.
- Desktop and mobile layouts had no horizontal overflow at the checked 1,440px and 390px viewport widths.
- Route readiness checks passed for research, coverage, monitor, developments, activity, Film analysis, Gaming, Theatre and both intake views.
- Pass 7 visual design remains deferred pending the design board. No deployment was performed.
