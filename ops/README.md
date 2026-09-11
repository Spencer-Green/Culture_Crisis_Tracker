# Local unattended researcher

The user-authorized rollout is **unverified discovery**, not independently validated
observations. New provider-extracted candidates receive `UNVERIFIED`. Existing
quarantines survive rediscovery. Human approval still means ingestion investigation
only; no UI integration, canonical promotion or automatic review is enabled.

Set `LLM_RESEARCHER_ENABLED=true` in the ignored `.env`, then run:

```sh
python3 ops/install-research-worker.py
```

The installer creates/replaces only the per-user launch agent
`local.culture-crisis-tracker.researcher`. It starts the existing scheduler with
`--research-only`, polling every five minutes by default, and automatically restarts it
if the process exits. It starts at user login and needs this Mac awake, PostgreSQL
available and network access. It is not a cloud or always-awake deployment.

The worker filters **due** sources; unlike the operator `scheduler:once --source=...`
command, its scope does not bypass source cadence. Task cadence (24h), source inspection
cadence (12h), rolling allowance (2/24h), durable locks, one task per cycle and zero model
retries remain unchanged. Recent validation attempts are retained; initial waiting is
expected. Other ingestion sources are not started by this service.

```sh
# Status (includes process state and PID)
launchctl print gui/$(id -u)/local.culture-crisis-tracker.researcher

# Stop; remains stopped until reinstalled or the next user login
launchctl bootout gui/$(id -u)/local.culture-crisis-tracker.researcher

# Restart / apply code or .env changes
python3 ops/install-research-worker.py

# Evidence and scheduler gates; no model request
npm run research:inspect -- --task=au-live-music-venue-viability
npm run scheduler:inspect
```

For persistent disablement set `LLM_RESEARCHER_ENABLED=false` in `.env` and restart the
service. Logs are in `~/Library/Logs/CultureCrisisTracker/researcher.log` and
`researcher-error.log`. The plist contains paths and scheduler enablement, never API keys.
Research output remains in database staging, not the log or application UI.

The paired shadow checker is enabled locally with `RESEARCH_AUDITOR_ENABLED=true`.
The repository default is false. It records local literal checks before any optional GLM
call. GLM-4.7 must pass the exact current protocol gate, then can align passages under
its normal four-attempt rolling limit. Failed or uncertain packets are not retried.
Neither a local match nor GLM agreement upgrades candidate verification or review status.

Use `npm run research:verifier-status` to inspect the qualification and next normal budget
slot without sending model requests. Today’s retained validation history temporarily
closes the normal GLM budget; the latest recent research run is checked on subsequent
worker polls without re-running DeepSeek. See the
[paired pipeline record](../docs/deepseek-researcher.md#2026-09-11-paired-shadow-researcher-and-checker--v3-enabled)
for the fixed acceptance results and bounded operator qualification allowance.
