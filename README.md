# Culture Crisis Tracker

Culture Crisis Tracker is a foundation for monitoring the economic health of cultural and
entertainment sectors across Australia, the United States, the United Kingdom, Canada, New
Zealand, and the European Union.

The product is intended to distinguish between broad demand weakness, a shrinking industry
middle tier, normal cyclical conditions, and increasing concentration around superstar artists,
franchises, and platforms. The first two live integrations ingest Australian and UK household
spending series from the public ABS and ONS APIs.

## Technology

- Next.js App Router, React, and strict TypeScript
- Tailwind CSS
- PostgreSQL 16 in Docker Compose
- Prisma ORM
- Zod server-environment validation
- ESLint and Prettier
- Vitest
- npm

## Requirements

- Node.js 20.9 or newer
- npm
- Docker Desktop or another Docker Compose-compatible runtime

## Installation

Install the JavaScript dependencies:

```bash
npm install
```

Copy the documented environment template if `.env` is not already present:

```bash
cp .env.example .env
```

For local development, set:

```bash
DATABASE_URL=postgresql://postgres:postgres@localhost:5433/culture_crisis_tracker?schema=public
```

External API keys are optional at this stage. Leave unavailable values blank.
The ABS base URL should remain:

```bash
ABS_BASE_URL=https://data.api.abs.gov.au/rest
```

ONS is also public and requires no API key. Its v1 base URL should remain:

```bash
ONS_BASE_URL=https://api.beta.ons.gov.uk/v1
```

## Database setup

Start PostgreSQL 16:

```bash
docker compose up -d
```

Apply the initial schema migration (or create follow-up migrations during development):

```bash
npx prisma migrate dev
```

An initial migration is already present under `prisma/migrations`. If PostgreSQL is running and this is a fresh database, `npx prisma migrate deploy` also works.

Seed country, sector, and source metadata:

```bash
npm run db:seed
```

The seed does not make network requests and is safe to run repeatedly.

## Development

Start the application:

```bash
npm run dev
```

Then open [http://localhost:3000](http://localhost:3000).

Useful checks:

```bash
npm run lint
npm run typecheck
npm test
npm run format:check
npm run build
```

Runtime endpoints:

- `GET /api/health` reports application, database, and source-readiness state.
- `GET /api/data-sources` returns safe source metadata without credentials.

## Project structure

```text
prisma/
  schema.prisma       Database schema
  seed.ts             Metadata-only seed
src/
  app/                App Router pages and API routes
  components/         Dashboard shell and reusable display components
  data-sources/       Shared adapter contract, registry, and placeholder adapters
  lib/                Constants, environment validation, and Prisma client
```

The static source catalogue is the canonical definition of supported providers and their coverage.
The server-side runtime registry combines that metadata with safe environment readiness and mutable
database state. ABS and ONS are the only implemented adapters; all other adapters remain inert placeholders
whose metric discovery and observation methods throw a clear `NotImplementedError`.

## Source states

Source status uses four independent concepts:

- **Implemented** means a functioning adapter exists. ABS and ONS are the implemented sources.
- **Configured** means the required base URL is valid and all declared credentials are present.
  It does not verify credentials against a provider.
- **Enabled** is mutable database state that explicitly permits ingestion. ABS and ONS are the only
  sources enabled by the seed.
- **Healthy** is runtime connectivity state. Configuration or successful ingestion does not imply
  health; the registry reports `not-checked` unless a health check has actually run.

ABS, ONS, Eurostat, Statistics Canada, and GDELT are intended as public/no-key sources. They can be
configured when their public base URL is present. Authenticated providers require both their base
URL and all declared credentials before becoming configured. Configuration never implies that a
source is implemented, enabled, or healthy.

## ABS Monthly Household Spending Indicator

The ABS integration uses the public Data API at
`https://data.api.abs.gov.au/rest`. It does not use the authenticated ABS Indicator API and does
not require an API key.

The initial dataflow is `ABS:HSI_M(1.6.0)`, Monthly Household Spending Indicator. Its SDMX series
dimension order is:

```text
MEASURE.CATEGORY.PRICE_ADJUSTMENT.TSEST.STATE.FREQ
```

Implemented metrics:

- `au-household-spending-total-current-price-sa`
  - Label: Australian total household spending
  - Mapping: `7.TOT.CUR.20.AUS.M`
  - Codes: Household spending; Total; Current Price; Seasonally Adjusted; Australia; Monthly
  - Unit: `AUD` Australian Dollars, multiplier `6` Millions (`AUD millions`)
- `au-recreation-culture-spending-current-price-sa`
  - Label: Australian recreation and culture spending
  - Mapping: `7.50.CUR.20.AUS.M`
  - Codes: Household spending; Recreation and culture; Current Price; Seasonally Adjusted;
    Australia; Monthly
  - Unit: `AUD` Australian Dollars, multiplier `6` Millions (`AUD millions`)
- `au-recreation-culture-spending-mom-pct-sa`
  - Label: Australian recreation and culture monthly spending change
  - Mapping: `8.50.CUR.20.AUS.M`
  - Codes: Household spending — Percentage change from previous period; Recreation and culture;
    Current Price; Seasonally Adjusted; Australia; Monthly
  - Unit: `PCT` Percent, multiplier `0` Units
- `au-discretionary-spending-mom-pct-sa`
  - Label: Australian discretionary spending monthly change
  - Mapping: `8.3.CUR.20.AUS.M`
  - Codes: Household spending — Percentage change from previous period; ABS category
    Discretionary; Current Price; Seasonally Adjusted; Australia; Monthly
  - Unit: `PCT` Percent, multiplier `0` Units

Inspect the current ABS structure and validate these mappings without writing to the database:

```bash
npm run abs:inspect
```

Run ABS ingestion with an inclusive `YYYY-MM` range:

```bash
npm run ingest:abs -- --start=2021-01 --end=2026-06
```

Both period arguments are validated; omitting them defaults to the previous twelve complete
calendar months. A repeated ingestion updates observations with the same metric and monthly
boundaries rather than creating duplicates. Each attempt creates an `IngestionRun`, records
created/updated counts, and updates source freshness timestamps. `lastAttemptedSyncAt` records the
start of any attempt; `lastSuccessfulSyncAt` changes only after a completed ingestion.

The HSI_M structure inspected in August 2026 advertises history from July 2012 through June 2026.
The tracker initially persists data from January 2019. ABS can revise observations and publish a
new dataflow version, so run `abs:inspect` before changing hard-coded mappings. The first adapter
does not derive its own discretionary aggregate and does not convert the published units.

ABS describes HSI_M as experimental and annotates it as a `NonProductionDataflow`. Percentage-change
series contain a non-applicable July 2012 observation and begin numeric values in August 2012.
Observations through December 2018 carry a different-methodology warning, which is why the initial
tracker history starts in January 2019. ABS responses are not assumed to be ordered; the adapter
sorts observations chronologically.

## ONS Consumer Trends

The ONS integration uses the public v1 API at `https://api.beta.ons.gov.uk/v1` and requires no API
key. It discovers time series with:

```text
GET /search?content_type=timeseries&cdids={CDID}
```

The adapter selects the exact `CT` Consumer Trends result, uses its evergreen URI, and retrieves the
series with `GET /data?uri={encoded ONS uri}`. It does not use retired v0 time-series endpoints or
assume URI paths.

Implemented quarterly, seasonally adjusted metrics:

- `uk-household-spending-total-current-price-sa` — CDID `ZAKV`
  - `0 Household final consumption expenditure: Domestic concept CP SA £m`
  - `GBP millions current prices`; nominal domestic-concept expenditure
- `uk-household-spending-total-cvm-sa` — CDID `ZAKW`
  - `0 Household final consumption expenditure :Domestic concept CVM NAYear SA £m`
  - `GBP millions CVM`; inflation-adjusted chained volume measure, not literal cash expenditure
- `uk-recreation-culture-spending-current-price-sa` — CDID `ZAWZ`
  - `09 Recreation and culture CP SA £m`
  - `GBP millions current prices`; nominal COICOP division 09 expenditure
- `uk-recreation-culture-spending-cvm-sa` — CDID `ZAXA`
  - `09 Recreation and culture CVM NAYear SA £m`
  - `GBP millions CVM`; inflation-adjusted COICOP division 09 volume measure

The ZAKW punctuation shown above is the exact current ONS title. It differs only in spacing around
the colon from some ONS publication text. The adapter verifies CDID, title, CT dataset, and resolved
URI before parsing observations.

Inspect all four live mappings without writing to PostgreSQL:

```bash
npm run ons:inspect
```

Ingest an inclusive quarter range using strict `YYYY-Q1` through `YYYY-Q4` labels:

```bash
npm run ingest:ons -- --start=2025-Q4 --end=2026-Q1
npm run ingest:ons -- --start=2019-Q1
```

When `--end` is omitted, the CLI discovers the latest quarter common to all four series rather than
assuming it exists. When both bounds are omitted, it ingests the latest eight available quarters.
Only the response's `quarters` collection is normalised; annual rows are never persisted. Repeated
runs update the same metric and UTC quarter boundaries, preserving database idempotency.

ONS Consumer Trends is quarterly and is generally published with a substantial lag relative to the
monthly ABS indicator. ONS can revise historical values, including CVM reference-year changes, so a
repeat ingestion may legitimately report updates. Provenance metadata retains the ONS period label,
release details, CDID, URI, units, request URL, and retrieval time. The adapter sends requests
sequentially. For HTTP 429 responses it performs at most one retry, waits for a supplied
`Retry-After` value up to 30 seconds, and otherwise fails without a retry loop.

Source freshness is based on persisted successful ingestion runs and latest observation periods.
Successful ingestion does not change the independent health state; the Data Sources page continues
to report `Not Checked` until an explicit health check is performed.

## Credential safety

- `.env`, `.env.local`, and environment-specific local files are ignored by Git.
- `.env` must never be committed.
- `.env.example` contains names and public base URLs only; `DATABASE_URL` remains blank.
- Environment parsing and source readiness run on the server.
- API responses and the Data Sources page expose booleans and safe metadata, never secret values.
- Validation errors identify malformed fields without printing their values.
- Do not prefix secret variables with `NEXT_PUBLIC_`.

The local `.env` uses the development-only PostgreSQL credentials defined in
`docker-compose.yml`. Replace them for any shared or non-local environment.

## Current limitations

- ABS HSI_M and ONS Consumer Trends are the only live sources; every other provider remains
  unimplemented and disabled
- No scheduled jobs or general retry framework; ONS has only a bounded 429 retry
- No computed Culture Stress Index
- No authentication or user accounts
- No deployment configuration
- No real charts or charting dependency
- Persisted metrics are limited to four ABS and four ONS consumer-spending series; no industry
  events are ingested
- `DataSource.countryCode` and `DataSource.sectorSlug` hold only unambiguous single-value metadata.
  The static catalogue remains authoritative for multi-country and multi-sector coverage during the
  MVP; join tables can be introduced later if database queries require them.

Overview charts and composite indicators remain explicit empty states; they do not contain
fabricated data.

## Planned ingestion phases

1. Expand comparable consumer-spending series across the six markets.
2. Add source-specific scheduling and operational monitoring.
3. Add entertainment event and gaming sources.
4. Add news-derived industry events with provenance and confidence review.
5. Define and validate composite indicators only after source coverage is sufficient.

The recommended next source is Eurostat because it can extend public, no-key consumer-spending
coverage to the European Union. It remains unimplemented and disabled.
