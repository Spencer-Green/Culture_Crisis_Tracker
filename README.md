# Culture Crisis Tracker

Culture Crisis Tracker is a foundation for monitoring the economic health of cultural and
entertainment sectors across Australia, the United States, the United Kingdom, Canada, New
Zealand, and the European Union.

The product is intended to distinguish between broad demand weakness, a shrinking industry
middle tier, normal cyclical conditions, and increasing concentration around superstar artists,
franchises, and platforms. Active current integrations ingest Australian, UK, and US
household-demand data from ABS, ONS, BEA, and Statistics Canada, plus US consumer-credit and
credit-card stress data from FRED. Eurostat annual EU data is retained separately as a structural
benchmark. GDELT supplies a reviewable media-event candidate corpus and Ticketmaster supplies a
structured forward live-event calendar for industry-viability research; neither produces an
Industry Viability score. IGDB and Steam provide a structured gaming release corpus and
point-in-time Steam activity snapshots without creating a Gaming Stress score.
TheNewsAPI and a curated RSS/Atom registry provide a unified, reviewable media-article layer for
daily culture intelligence without storing full article bodies or producing a news-derived score.

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

Secrets belong only in the ignored local `.env` file and must never be committed. BEA and FRED
ingestion require `BEA_API_KEY` and `FRED_API_KEY`; leave credentials for unused providers blank.
IGDB ingestion requires `IGDB_CLIENT_ID` and `IGDB_CLIENT_SECRET`; Steam readiness requires
`STEAM_WEB_API_KEY`. TheNewsAPI ingestion requires `THENEWSAPI_API_KEY`. All credentials remain
server-only.
The ABS base URL should remain:

```bash
ABS_BASE_URL=https://data.api.abs.gov.au/rest
```

ONS is also public and requires no API key. Its v1 base URL should remain:

```bash
ONS_BASE_URL=https://api.beta.ons.gov.uk/v1
EUROSTAT_BASE_URL=https://ec.europa.eu/eurostat/api/dissemination/statistics/1.0
```

The authenticated US endpoints should remain:

```bash
BEA_BASE_URL=https://apps.bea.gov/api/data
FRED_BASE_URL=https://api.stlouisfed.org/fred
```

The media endpoint should remain:

```bash
THENEWSAPI_BASE_URL=https://api.thenewsapi.com/v1
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
database state. ABS, ONS, BEA, FRED, Eurostat, Statistics Canada, GDELT, Ticketmaster, IGDB, and
Steam are implemented.
Eurostat is classified as a structural benchmark rather than an active current source. GDELT is an
event-candidate source rather than a metric-observation source. All other adapters remain inert
placeholders whose metric discovery and observation methods throw a clear `NotImplementedError`.

## Source states

Source status uses four independent concepts:

- **Implemented** means a functioning adapter exists. ABS, ONS, BEA, FRED, Eurostat, Statistics
  Canada, GDELT, Ticketmaster, IGDB, and Steam are implemented.
- **Configured** means the required base URL is valid and all declared credentials are present.
  It does not verify credentials against a provider.
- **Enabled** is mutable database state that explicitly permits ingestion. New ABS, ONS, BEA,
  FRED, Eurostat, Statistics Canada, GDELT, Ticketmaster, IGDB, and Steam records use enabled
  defaults; routine seed reruns preserve existing manual enablement and sync timestamps.
- **Healthy** is runtime connectivity state. Configuration or successful ingestion does not imply
  health; the registry reports `not-checked` unless a health check has actually run.

ABS, ONS, Eurostat, Statistics Canada, and GDELT are intended as public/no-key sources. They can be
configured when their public base URL is present. Authenticated providers require both their base
URL and all declared credentials before becoming configured. Configuration never implies that a
source is implemented, enabled, or healthy.

## ABS household spending indicators

The ABS integration uses the public Data API at
`https://data.api.abs.gov.au/rest`. It does not use the authenticated ABS Indicator API and does
not require an API key.

The monthly nominal dataflow is `ABS:HSI_M(1.6.0)`, Monthly Household Spending Indicator. Its SDMX
series dimension order is:

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

Official quarterly real consumption comes from the separate ABS dataflow
`ABS:HSI_Q(1.2.0)`, Quarterly Household Spending Indicator, under the same logical ABS provider.
It uses the same SDMX dimension order and adds exactly two raw metrics:

- `au-household-spending-total-real`
  - Official label: Australian total household spending, chain volume measures
  - Full series: `ABS,HSI_Q,1.2.0/7.TOT.CVM.20.AUS.Q`
  - Codes: Household spending; Total; Chain Volume Measures; Seasonally Adjusted; Australia;
    Quarterly
  - Unit: `AUD` Australian Dollars, multiplier `6` Millions
- `au-recreation-culture-spending-real`
  - Official label: Australian recreation and culture spending, chain volume measures
  - Full series: `ABS,HSI_Q,1.2.0/7.50.CVM.20.AUS.Q`
  - Codes: Household spending; Recreation and culture; Chain Volume Measures; Seasonally Adjusted;
    Australia; Quarterly
  - Unit: `AUD` Australian Dollars, multiplier `6` Millions

ABS labels these observations `Chain Volume Measures`; the HSI_Q SDMX metadata and Table 15 expose
`$ Millions` but do not publish a fixed reference-year code in the series key. The tracker therefore
retains the exact chain-volume wording rather than asserting a permanent base year. These official
volume measures are used instead of constructing a monthly `nominal HSI / CPI` proxy.

Inspect the current ABS structure and validate these mappings without writing to the database:

```bash
npm run abs:inspect
```

Run ABS ingestion with an inclusive `YYYY-MM` range:

```bash
npm run ingest:abs -- --start=2021-01 --end=2026-06
```

The existing command remains monthly-only. Use the dedicated quarterly command for official real
metrics, with strict `YYYY-Qn` periods:

```bash
npm run ingest:abs-real -- --start=2019-Q1 --end=2026-Q2
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

HSI_Q currently exposes both implemented series from 2014 Q3 through 2026 Q2. The tracker backfill
starts at 2019 Q1 for the shared cross-market baseline. Quarterly observations retain exact UTC
quarter boundaries and are never converted to monthly data, interpolated, or forward-filled.

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

## BEA Monthly Personal Consumption Expenditures

The BEA integration uses the official Data API endpoint at
`https://apps.bea.gov/api/data`, the authenticated `NIPA` dataset, and JSON responses. The API key
is sent as `UserID` only in server-side requests and is removed from persisted request URLs.

Live metadata inspection in August 2026 verified these monthly NIPA mappings:

- `us-pce-total-current-price`
  - Table `T20805`, line `1`, series `DPCERC`
  - `Personal consumption expenditures (PCE)`
  - Current dollars; `USD millions SAAR`
- `us-pce-total-real`
  - Table `T20806`, line `1`, series `DPCERX`
  - `Personal consumption expenditures (PCE)`
  - Chained 2017 dollars; `chained 2017 USD millions SAAR`
- `us-recreation-services-pce-current-price`
  - Table `T20805`, line `18`, series `DRCARC`
  - `Recreation services`
  - Current dollars; `USD millions SAAR`
- `us-recreation-services-pce-real`
  - Table `T20806`, line `18`, series `DRCARX`
  - `Recreation services`
  - Chained 2017 dollars; `chained 2017 USD millions SAAR`

`T20805` is “Table 2.8.5. Personal Consumption Expenditures by Major Type of Product,
Monthly.” `T20806` is its real chained-dollar counterpart. All four values are seasonally adjusted
at annual rates. They are annual-rate observations published monthly, not literal monthly cash
expenditure. Chained-dollar components are not generally additive. The adapter does not combine
BEA's separate recreational-goods category with recreation services.

The inspection command uses `GetParameterValues` for NIPA table/year availability and narrow
`GetData` requests to verify line descriptions, codes, units, and current period coverage:

```bash
npm run bea:inspect
```

BEA reports nominal monthly table history from January 1959, real monthly table history from
January 2007, and currently publishes both selected tables through June 2026. Ingest an inclusive
`YYYY-MM` range with:

```bash
npm run ingest:bea -- --start=2019-01 --end=2026-06
```

BEA revises NIPA history and may update chained-dollar reference years. Re-run inspection before
changing mappings, and repeat ingestion to apply revisions idempotently. The initial tracker
backfill begins in January 2019.

### BEA detailed recorded-music consumer demand

The Music page also uses BEA's official `NIUnderlyingDetail` dataset. These measures describe US
household Personal Consumption Expenditures, not RIAA retail value, record-company wholesale
revenue, label revenue, artist income, or royalties. Live metadata inspection verified:

- `us-audio-streaming-radio-pce-current-price`
  - Table `U20405` (`2.4.5U`), line `225`, series `LA000232`
  - `Audio streaming and radio services (including satellite radio)`
  - Current dollars; `USD millions SAAR`; monthly from January 2007
- `us-audio-streaming-radio-pce-real`
  - Table `U20406` (`2.4.6U`), line `225`, series `LB000232`
  - The same official category in chained 2017 dollars; monthly from January 2007
- `us-owned-recorded-music-pce-current-price`
  - Table `U20405`, line `45`, series `DRTDRC`
  - `Audio discs, tapes, vinyl, and permanent digital downloads`
  - Current dollars; `USD millions SAAR`; monthly from January 1959
- `us-owned-recorded-music-pce-real`
  - Table `U20406`, line `45`, series `DRTDRX`
  - The same official category in chained 2017 dollars; monthly from January 2007

`U20405` is “Table 2.4.5U. Personal Consumption Expenditures by Type of Product.” `U20406` is its
official real chained-dollar counterpart. The tracker preserves both rather than constructing a CPI
proxy. All monthly levels are seasonally adjusted annual rates: the UI labels them `annualized` and
does not divide them by twelve. Chained-dollar series are not used to calculate nominal wallet
shares.

The streaming label must not be shortened to imply on-demand subscriptions alone because BEA
explicitly includes radio and satellite radio. The displayed streaming/radio share uses only the
two compatible current-dollar PCE categories and is a share of tracked recorded-music consumption,
not a share of the complete music industry.

Inspect the exact lines without persistence, then ingest an inclusive monthly range:

```bash
npm run bea:music:inspect
npm run ingest:bea:music -- --start=2019-01 --end=2026-06
```

With no range, the dedicated command maximizes available official history for the selected metrics;
metric-specific start dates prevent synthetic pre-history. Missing observations are skipped, never
interpolated, and repeated runs update the same raw observations.

## FRED Consumer Credit and Credit-Card Stress

The FRED integration uses the official base `https://api.stlouisfed.org/fred`. Metadata comes from
`GET /series`, release attribution from `GET /series/release`, and native observations from
`GET /series/observations` with `file_type=json`, `observation_start`, and `observation_end`.
`FRED_API_KEY` is server-only and removed from persisted request URLs.

Live metadata inspection verified these exact source series:

- `TOTALSL` — `Total Consumer Credit Owned and Securitized`
  - Monthly; Millions of U.S. Dollars; Seasonally Adjusted
  - Release: `G.19 Consumer Credit`
- `REVOLSL` — `Revolving Consumer Credit Owned and Securitized`
  - Monthly; Millions of U.S. Dollars; Seasonally Adjusted
  - Release: `G.19 Consumer Credit`
- `DRCCLACBS` — `Delinquency Rate on Credit Card Loans, All Commercial Banks`
  - Quarterly, End of Period; Percent; Seasonally Adjusted
  - Release: `Charge-Off and Delinquency Rates on Loans and Leases at Commercial Banks`
- `CORCCACBS` — `Charge-Off Rate on Credit Card Loans, All Commercial Banks`
  - Quarterly; Percent; Seasonally Adjusted
  - Annualized and net of recoveries
  - Release: `Charge-Off and Delinquency Rates on Loans and Leases at Commercial Banks`

Inspect current metadata without database writes:

```bash
npm run fred:inspect
```

Ingest the full shared inclusive ISO date window:

```bash
npm run ingest:fred -- --start=1943-01-01 --end=2026-06-01
```

The adapter does not transform units, resample, forward-fill, or interpolate. Monthly balance
series and quarterly stress rates keep their native frequencies and individual ranges. Live
metadata verified `TOTALSL` from January 1943 through June 2026 (1,002 observations), `REVOLSL`
from January 1968 through June 2026 (702), `DRCCLACBS` from 1991 Q1 through 2026 Q1 (141), and
`CORCCACBS` from 1985 Q1 through 2026 Q1 (165). FRED observations and Federal Reserve source
releases may be revised on different schedules.

### Historical credit context

Historical summaries are Culture Crisis Tracker presentation-layer calculations over the full
persisted native series. They are not stored as observations. Missing values are excluded and input
order does not affect the result. Minimum, maximum, median, 25th, 75th, 90th, and 97.5th
percentiles use linear interpolation at ordered index `(n - 1) × p`, equivalent to the common R-7
or Excel `PERCENTILE.INC` method. Percentile rank uses empirical midrank: observations below the
current value plus half of observations equal to it, divided by the valid observation count.

The tracker-derived historical classification uses these exact percentile-rank boundaries:

- Below 25: `Low`
- 25 inclusive to below 75: `Typical`
- 75 inclusive to below 90: `Elevated`
- 90 inclusive to below 97.5: `High`
- 97.5 and above: `Extreme`

The UI labels this as `Culture Crisis Tracker historical classification`. These are not Federal
Reserve thresholds and do not establish causation. Previous-period and year-over-year comparisons
require observations at the exact preceding native period and exact year-earlier period; missing
periods are not filled.

For `DRCCLACBS`, the Federal Reserve delinquency series covers loans at least 30 days past due and
still accruing, plus loans in nonaccrual status. Delinquency is not described as default. For
`CORCCACBS`, rates retain their source meaning as seasonally adjusted, annualized, and net of
recoveries.

`TOTALSL` and `REVOLSL` historical percentiles are explicitly nominal context, not standalone
stress measures. Nominal outstanding credit tends to rise over long periods with inflation,
population, income, and economic growth. CPI, population, disposable-income, per-capita, real, and
credit-to-income normalization are therefore presented as separate lenses rather than collapsed
into a composite score.

### Normalized consumer-credit analytics

FRED redistributes the three raw supporting series used for normalization; the application retains
the underlying statistical source and release instead of attributing their authorship to FRED:

- `CPIAUCSL` — `Consumer Price Index for All Urban Consumers: All Items in U.S. City Average`
  - U.S. Bureau of Labor Statistics; `Consumer Price Index` release
  - Monthly; seasonally adjusted; `Index 1982-1984=100`
  - January 1947 through June 2026; 953 persisted observations
- `POPTHM` — `Population`
  - U.S. Bureau of Economic Analysis; `Personal Income and Outlays` release
  - Monthly; not seasonally adjusted; thousands of persons
  - January 1959 through June 2026; 810 persisted observations
- `DSPI` — `Disposable Personal Income`
  - U.S. Bureau of Economic Analysis; `Personal Income and Outlays` release
  - Monthly; seasonally adjusted annual rate; billions of dollars
  - January 1959 through June 2026; 810 persisted observations

These are genuine raw FRED `MetricObservation` inputs but are not headline culture metrics. Derived
real credit, per-capita credit, credit/income ratios, growth rates, and percentiles are calculated at
request time and are never persisted as source observations.

All joins require an exact matching monthly period; missing months are omitted without interpolation
or forward filling. The practical common histories are January 1947 onward for `TOTALSL` plus
`CPIAUCSL`, January 1959 onward for `TOTALSL` plus `POPTHM` or `DSPI`, and January 1968 onward for
`REVOLSL` plus `POPTHM`.

Inflation-adjusted credit uses latest-aligned-period dollars:

```text
real_credit_t = nominal_credit_t × latest_aligned_CPI / CPI_t
```

The current reference is the June 2026 CPI observation. This controls for general price-level
change but remains a Culture Crisis Tracker calculation rather than an official FRED series.

Per-capita credit converts `USD millions` and `thousands of persons` to dollars per person:

```text
credit_per_person = credit_USD_millions × 1,000 / population_thousands
```

This controls for population growth but is not credit per borrower.

Credit relative to disposable income converts DSPI billions to the same million-dollar unit:

```text
credit_to_DPI_percent = credit_USD_millions / (DSPI_USD_billions × 1,000) × 100
```

DSPI remains an annualized income flow and is not divided by twelve. The result compares consumer
credit stock with annualized disposable personal income; it is not generic household
debt-to-income because `TOTALSL` excludes major liabilities such as mortgages.

Historical percentiles describe each normalized series' position within its own available history.
They do not prove financial crisis, borrower distress, or causation. Charts expose Nominal,
Inflation-adjusted, Per capita, and Credit / disposable income as separate single-unit views over
5Y, 10Y, 20Y, or maximum available ranges.

FRED and Federal Reserve attribution and any applicable provider terms must be reviewed before a
public or commercial deployment. The application presents BEA consumption and FRED credit
evidence separately and does not claim that credit availability causes entertainment spending.

## EU Structural Benchmark (Eurostat)

The EU Structural Benchmark integration uses Eurostat's public, unauthenticated dissemination
statistics API at
`https://ec.europa.eu/eurostat/api/dissemination/statistics/1.0`. It makes filtered JSON-stat 2.0
requests to `GET /data/nama_10_cp18`; no API key or other credential is required.

Dataset `nama_10_cp18` is `Household final consumption expenditure by purpose (COICOP 2018)`.
Live inspection in August 2026 returned dimension order `freq → unit → coicop18 → geo → time`.
The parser validates the response-declared order and category indexes rather than relying on that
observed order. The initial integration uses geography `EU27_2020`, labelled `European Union - 27
countries (from 2020)`, and annual frequency code `A`.

Implemented mappings:

- `eu-household-spending-total-current-price`
  - Purpose `TOTAL` — `Total`
  - Unit `CP_MEUR` — `Current prices, million euro`
- `eu-household-spending-total-real`
  - Purpose `TOTAL` — `Total`
  - Unit `CLV20_MEUR` — `Chain linked volumes (2020), million euro`
- `eu-recreation-culture-spending-current-price`
  - Purpose `CP09` — `Recreation, sport and culture`
  - Unit `CP_MEUR` — `Current prices, million euro`
- `eu-recreation-culture-spending-real`
  - Purpose `CP09` — `Recreation, sport and culture`
  - Unit `CLV20_MEUR` — `Chain linked volumes (2020), million euro`

Inspect dataset structure, aggregate/member-state coverage, category codes, units, and target
availability without database writes:

```bash
npm run eurostat:inspect
```

Ingest an inclusive annual `YYYY` range:

```bash
npm run ingest:eurostat -- --start=2019 --end=2024
```

All four EU27_2020 target series contain compatible observations from 1995 through 2024. The
tracker currently persists 2019–2024, six annual observations per metric. Eurostat national
accounts can be revised, and annual publication has a longer expected lag than monthly ABS or BEA
data. It is excluded from active current-source counts, headline freshness, and current cross-market
demand charts. The Consumer Spending page retains it in a collapsed secondary section for future
historical and structural analysis.

The integration uses only the COICOP-2018 dataset and does not stitch older ECOICOP or COICOP-1999
series onto it. Eurostat supplies the selected dataset as a backcast series through 1995, which
makes the persisted 2019 baseline classification-compatible within this dataset. This does not
eliminate all conceptual differences between national accounting systems, and `EU27_2020` is an
aggregate for the current 27-country composition rather than a single member state. Current-price
and chain-linked-volume measures remain separate, and euro values are never converted to another
currency in persistence.

## Statistics Canada quarterly household consumption

Statistics Canada is a public, no-key current-demand source. The integration uses the official Web
Data Service base `https://www150.statcan.gc.ca/t1/wds` and table `36-10-0124-01`, PID `36100124`,
`Detailed household final consumption expenditure, Canada, quarterly`. It validates cube metadata
with `POST /rest/getCubeMetadata`, validates each coordinate/vector mapping with `POST
/rest/getSeriesInfoFromCubePidCoord`, and retrieves narrow date ranges with `GET
/rest/getDataFromVectorByReferencePeriodRange`.

Implemented headline series:

- `ca-household-spending-total-current-price`
  - `Household final consumption expenditure`; `Current prices`
  - Coordinate `1.1.1.1.0.0.0.0.0.0`; vector `V62700456`
- `ca-household-spending-total-real`
  - `Household final consumption expenditure`; `2017 constant prices`
  - Coordinate `1.2.1.1.0.0.0.0.0.0`; vector `V62700682`
- `ca-recreation-culture-spending-current-price`
  - `Recreation and culture`; `Current prices`
  - Coordinate `1.1.1.70.0.0.0.0.0.0`; vector `V62700517`
- `ca-recreation-culture-spending-real`
  - `Recreation and culture`; `2017 constant prices`
  - Coordinate `1.2.1.70.0.0.0.0.0.0`; vector `V62700751`

All four are Canada geography, quarterly frequency code `9`, and `Seasonally adjusted at
quarterly rates`. The tracker preserves the published quarterly-rate values exactly: it does not
annualize, divide, or multiply them. WDS reports unit code `81` (`Dollars`) and scalar-factor code
`6` (`millions`), so stored source values use `CAD millions` with current- or constant-2017-price
and quarterly-rate semantics. Compact UI values use `C$`; raw values and units remain unchanged.

The four vectors have a common live history from 1981 Q1 through 2026 Q1, released most recently on
May 29, 2026. The initial tracker backfill deliberately begins at 2019 Q1 to align with the existing
cross-market baseline and contains 29 observations per metric. Inspect live cube, series, range,
and future cultural-detail metadata without database writes:

```bash
npm run statcan:inspect
```

Ingest an inclusive quarter range using strict `YYYY-Qn` syntax:

```bash
npm run ingest:statcan -- --start=2019-Q1 --end=2026-Q1
```

Statistics Canada can revise national-accounts history. Repeat ingestion updates the same metric
and UTC quarter boundaries idempotently. No monthly observations are created, and quarterly gaps
are not interpolated or forward-filled. The nominal and real recreation series enter the existing
2019-indexed charts as quarterly Canadian points; indexing compares relative trajectories rather
than asserting identical national-account baskets.

Useful current-price cultural detail discovered but intentionally not ingested in this pass:

- `Recording media`: member `73`, `V62700520`, coordinate `1.1.1.73.0.0.0.0.0.0`
- `Musical instruments and major durables for indoor recreation`: member `75`, `V62700522`,
  coordinate `1.1.1.75.0.0.0.0.0.0`
- `Games, toys and hobbies`: member `76`, `V62700523`, coordinate `1.1.1.76.0.0.0.0.0.0`
- `Recreational and sporting services`: member `81`, `V62700528`, coordinate
  `1.1.1.81.0.0.0.0.0.0`
- `Cinemas`: member `83`, `V62700530`, coordinate `1.1.1.83.0.0.0.0.0.0`
- `Other cultural services`: member `85`, `V62700532`, coordinate `1.1.1.85.0.0.0.0.0.0`
- `Audio-visual and photographic equipment`: member `71`, `V62700518`
- `Books`: member `87`, `V62700534`; `Newspapers and periodicals`: member `88`, `V62700535`

## Cross-market demand presentation

The Overview and Consumer Spending pages use Recharts for local, client-rendered time-series
visualization. Recharts is bundled with the application and does not load fonts, scripts, or other
assets from an external network.

The nominal recreation and culture comparison uses these persisted source series:

- Australia: ABS recreation and culture spending, current prices, monthly
- United Kingdom: ONS `09 Recreation and culture CP SA £m`, quarterly
- United States: BEA recreation services, current dollars, monthly, SAAR
- Canada: Statistics Canada `Recreation and culture`, current prices, quarterly rates

Each series is independently indexed to `100` at its first valid observation on or after
`2019-01-01`. Raw currencies are not compared directly: AUD, GBP, USD, CAD, and EUR levels are not
converted, and indexing does not imply that the source definitions are identical. Indexed values
are Culture Crisis Tracker presentation-layer calculations and are never persisted.

The real comparison uses official ABS recreation and culture chain volume measures, ONS recreation
and culture CVM, BEA real recreation services in chained 2017 dollars SAAR, and Statistics Canada
recreation and culture at 2017 constant prices. Nominal and real series remain separate.

Native frequencies are preserved. Nominal Australia and the United States are monthly; real
Australia, the United Kingdom, and Canada are quarterly. The chart places published observations on
a shared time axis. It does not interpolate, forward-fill, resample, or manufacture quarterly values
for intervening periods. Tooltips retain the native period, frequency, source value, source unit,
price basis, and SAAR status. Australia's latest nominal and real periods are displayed separately,
and no nominal-real growth gap is calculated across mismatched monthly and quarterly reference
periods.

Consumer Spending country summaries calculate movement at each source's native cadence. Monthly
period change compares a published month with the immediately preceding calendar month; quarterly
period change compares a published quarter with the immediately preceding calendar quarter. YoY
compares each month or quarter with the same native period one year earlier. Missing comparison
periods remain unavailable rather than being replaced with the nearest record. These growth rates
are Culture Crisis Tracker presentation-layer calculations, except where the summary explicitly
labels the official ABS recreation-and-culture monthly percentage-change series.

The nominal recreation share is `nominal recreation category / nominal total household spending`
for an exactly aligned source period. Its YoY movement is reported in percentage points. Real or
chain-linked levels are never used as nominal wallet shares. The US calculation is labelled
`Recreation services share of total PCE` because BEA recreation services is narrower than the
broader recreation-and-culture categories published for Australia, the UK, and Canada.

Where both nominal and real recreation series exist, the dashboard compares their YoY growth rates
and reports a `Nominal-real growth gap`. It does not subtract nominal and real levels or label the
gap as inflation. The chart's `YoY change` mode uses the same exact-period methodology, preserves
each point's source metadata and native frequency, and performs no interpolation. The latest-market
snapshot displays each country's actual latest period rather than implying synchronized releases.

Raw recent observations remain available in collapsed audit disclosures beneath each country.
Eurostat remains a collapsed annual structural benchmark and is excluded from the four current
consumer-demand markets and their chart calculations.

BEA monthly PCE values are seasonally adjusted annual rates. SAAR is the annualized spending pace
implied by a month, not the amount spent during that month; values are not divided by twelve for
display. Headline values therefore include `annualized` and retain current-dollar or chained-2017
dollar labels.

Source values published in millions use compact presentation when the resulting number is easier to
read: USD uses `$`, AUD uses `A$`, GBP uses `£`, CAD uses `C$`, and EUR uses `€`; million, billion, and trillion
suffixes use sensible magnitude-based precision. Persisted values and source units remain unchanged
and visible in supporting information and chart tooltips.

## GDELT cultural-industry event candidates

GDELT is a public, no-key evidence-discovery source. The integration uses the official DOC 2.0
endpoint:

```text
GET https://api.gdeltproject.org/api/v2/doc/doc
```

Requests use `mode=artlist`, `format=json`, `sort=datedesc`, explicit UTC `startdatetime` and
`enddatetime`, and a bounded `maxrecords`. Seven-day ingestion requests at most 50 articles per
query family; 30-day ingestion requests at most 100. The CLI refuses windows above 30 days. Query
families run sequentially with 5.5 seconds between requests. HTTP 429 and transient 5xx responses
receive at most two retries with bounded exponential or `Retry-After` backoff. GDELT is itself
rate-limited, so inspection or ingestion may fail cleanly without changing the candidate corpus.

Phase-one source scope is Australia, the United States, the United Kingdom, and Canada. GDELT
`sourcecountry` filters constrain publisher geography, not event geography. Event-country
assignment is separately inferred only when the title contains defensible country or place evidence;
otherwise it remains unknown. A publisher country is never copied into the event-country field.

The named query families are:

- `venue-closure` — cultural venue closures and threatened closures
- `festival-cancellation` — festival cancellation, collapse, and closure
- `insolvency-bankruptcy` — bankruptcy, insolvency, administration, liquidation, and receivership
- `layoffs` — layoffs, redundancies, staff cuts, and workforce reductions
- `funding-cuts` — grant, subsidy, funding, and budget cuts
- `demand-weakness` — weak ticket sales, attendance, box office, or bookings
- `positive-signals` — openings, launches, investment, hiring, record attendance, and expansion

The application taxonomy distinguishes confirmed-title candidates such as `VENUE_CLOSURE` from
threatened events such as `VENUE_AT_RISK`, along with festival/tour cancellations, insolvency,
closures, layoffs, funding cuts, demand weakness, consolidation, openings, launches, investment,
hiring, attendance records, revenue growth, and capacity expansion. Classification is deterministic
and title-based. `high`, `medium`, and `low` confidence describe candidate quality, not verified
truth. Records begin as `unreviewed`; the application-layer review states are `unreviewed`,
`accepted`, and `rejected`. No machine-learning classifier or causal claim is used.

Each record is explicitly a `GDELT candidate`. It stores title, canonical HTTP(S) article URL,
publisher domain, publication and retrieval timestamps, query families, candidate event types,
sector, conservatively inferred event country, publisher source country, polarity, confidence,
review state, and a short tracker-generated rationale. Full article text is neither fetched nor
stored. Returned article URLs are treated as untrusted: unsafe protocols are rejected, and the
server never follows article links. The browser may open the validated original link.

Exact article deduplication canonicalizes the URL, removes common tracking parameters, and derives
a deterministic UUID from the canonical URL. If one URL matches several queries, one record retains
all matched query-family and event-type tags. Repeat ingestion updates that record and preserves any
existing manual review state. Separate articles about the same real-world closure remain separate
candidates; real-world event clustering is future work.

Inspect five results per family without writing to PostgreSQL:

```bash
npm run gdelt:inspect
npm run gdelt:inspect -- --query-family=venue-closure --country=AU
```

Run bounded candidate ingestion:

```bash
npm run ingest:gdelt -- --days=7
npm run ingest:gdelt -- --days=30
npm run ingest:gdelt -- --days=7 --query-family=layoffs --country=CA
```

The Industry Events page is an evidence browser with date, country, sector, event type, polarity,
confidence, review-state, and domain filters. Overview may report raw corpus counts while Industry
Viability remains `Collecting evidence` or `Pending`; it does not create a score. Raw article volume
is not treated as a trend because it is affected by syndication, overall news volume, source and
language coverage, query stability, and major-news bursts. Trend analysis requires real-event
clustering, source normalization, stable query evaluation, and a news-volume denominator.

Phase one intentionally has no multi-year backfill. It also does not scrape article bodies, infer
confirmed events from keyword presence alone, collapse related coverage into one real-world event,
or implement Eventbrite, Steam, IGDB, or Mediastack.

## Ticketmaster structured event supply

Ticketmaster integration uses the authenticated official Discovery API v2 root:

```text
https://app.ticketmaster.com/discovery/v2/
```

Phase one uses `GET /classifications.json` for live cultural classification validation,
`GET /events.json` for forward searches, `GET /events/{id}.json` for representative inspection,
and the venue endpoints `GET /venues.json` and `GET /venues/{id}.json` during inspection. The
`TICKETMASTER_API_KEY` is read server-side and added as the `apikey` query parameter only when a
request is sent. Authenticated request URLs are never persisted, logged, returned by APIs, or
serialized into frontend data. Stored event links are Ticketmaster's separate public event URLs.

The current live-validated cultural segment mappings are:

- `Music` — `KZFzniwnSyZfZ7v7nJ` → project sector `music`
- `Arts & Theatre` — `KZFzniwnSyZfZ7v7na` → project sector `theatre`
- `Film` — `KZFzniwnSyZfZ7v7nn` → project sector `film`

The initial venue-geography scope is Australia (`AU`), the United States (`US`), the United
Kingdom (`GB`), and Canada (`CA`). Sports and unsupported classifications are excluded from the
cultural supply corpus. Ticketmaster segment, genre, and subgenre labels remain attached to each
event rather than being replaced by the coarser project-sector mapping. Ticketmaster Discovery is
not a census: counts describe Ticketmaster-discovered or Ticketmaster-covered event supply, not all
live cultural activity.

Production searches always use explicit UTC `startDateTime` and `endDateTime` parameters and
deterministic half-open date windows. Retrieval is partitioned by country, cultural segment, and
bounded date window. A window reporting more than 1,000 results is bisected recursively before
pagination; if even a one-hour window exceeds the safe deep-paging boundary, ingestion fails rather
than silently truncating. Adjacent windows share an exact exclusive/inclusive boundary, results are
filtered to that boundary again locally, and Ticketmaster event IDs remove overlap. Requests are
sequential and locally throttled to at most two requests per second. HTTP 429 and transient 5xx
responses receive at most two bounded retries, honoring `Retry-After` where exposed. The public
default quota is treated conservatively as 5,000 requests per day; `rate-limit-available` is
reported by the CLI when the API exposes it.

`TicketmasterEvent` is a dedicated structured-supply record rather than a GDELT media candidate.
The official Ticketmaster event ID is its unique source identity; repeat snapshots update the same
row while retaining `firstSeenAt`, `lastSeenAt`, and retrieval timestamps. Venues are deduplicated
separately using official Ticketmaster venue IDs. Venue geography defines event country. The record
preserves local and UTC date/time, timezone, exact source status, segment/genre/subgenre, promoter,
onsale dates, attractions metadata, public event URL, locale, test flag, and published price range.
Missing prices remain null and are never interpreted as zero or an average.

Rows that disappear from a later API response remain available for longitudinal first/last-seen
analysis. Dashboard supply counts use the latest successful complete four-country, three-segment
snapshot that covers at least the selected forward range, plus any later sightings for those dates,
so retained older listings do not inflate the current forward calendar. Country- or
segment-filtered CLI runs therefore update records without replacing the dashboard's latest
complete snapshot.

Current statuses remain source-faithful. Live validation currently returns `onsale`, `offsale`,
`cancelled`, and `rescheduled`; any `canceled` or `postponed` variants remain separate rather than
being rewritten. In particular, `offsale` is not cancellation. A canceled event in one snapshot is
not a cancellation rate or proof that the cancellation occurred during that window.

The Industry Events page separates `Live Event Supply` from `Media Event Candidates`. It reports
raw 7-, 30-, or 90-day forward events, distinct active venues, events per venue, source status,
cultural segment and genre mix, price-range availability, and upcoming events by week. Farther-out
weeks may be less complete because events have not yet been listed, so the forward weekly chart is
a calendar shape rather than a historical trend. One current snapshot does not establish supply
growth, venue closure, ticket-price inflation, demand, or industry stress. Recurring snapshots are
required before longitudinal interpretation.

Inspect live classifications, coverage, event shapes, and venue endpoints without database writes:

```bash
npm run ticketmaster:inspect
```

Run bounded forward ingestion, optionally filtering one market or segment:

```bash
npm run ingest:ticketmaster -- --days=7
npm run ingest:ticketmaster -- --days=30
npm run ingest:ticketmaster -- --days=90
npm run ingest:ticketmaster -- --days=7 --country=AU --segment=music
```

The phase-one CLI hard-caps windows to 7, 30, or 90 days. There is no past-event backfill or attempt
to reconstruct 2019–2025 supply. Longitudinal supply, mature cancellation analysis, and price change
must accumulate from scheduled future snapshots.

### Ticketmaster longitudinal methodology

Ticketmaster longitudinal storage deliberately separates three concepts:

1. `TicketmasterEvent` is the latest known source state for one official event ID. It retains
   `firstSeenAt` and `lastSeenAt`, but is not itself a historical snapshot.
2. `TicketmasterEventStatusChange` is append-only evidence that a previously persisted exact source
   status changed during a specific ingestion run. First observation does not create a synthetic
   `null → onsale` transition. Unchanged repeat ingestion creates no transition. The unique event
   and ingestion-run identity prevents retry duplicates while allowing the same transition to recur
   in a genuinely later run.
3. `TicketmasterSupplySnapshot` is a point-in-time aggregate of a completed forward calendar. It
   stores event and venue counts, events per venue, exact current-status counts, and price-range
   availability. Percentage changes are calculated later and are not persisted.

Complete unfiltered runs create snapshots only after all four countries and all three cultural
segments have been fetched and current event persistence has succeeded. A 7-day run creates 7D
snapshots; a 30-day run creates 7D and 30D snapshots; a 90-day run creates 7D, 30D, and 90D
snapshots. Each window contains 16 rows: AU, US, GB, and CA crossed with `ALL CULTURAL`, `Music`,
`Arts & Theatre`, and `Film`. Partial country or segment runs update current event state but do not
create final market snapshots. Snapshot creation and successful ingestion-run completion share a
transaction, so snapshot failure cannot be reported as analytical success.

Snapshot comparisons require the same country, segment, and window. `Latest vs previous` uses the
immediately preceding complete comparable capture. Approximately seven- and 30-day comparisons use
only captures within two and three days of their targets respectively; missing history remains
`Insufficient history`. Available neutral calculations are forward supply change, active venue
change, calendar-density change, and exact status-count change. They are not stress scores.

Transition queries support exact `previousStatus → newStatus` counts by observation interval,
country, and segment. Current `cancelled` listings and newly observed `onsale → cancelled`
transitions are different measures. A future cancellation-transition rate requires a documented
eligible-event denominator, such as events previously active and still observable in a comparable
window; no such rate is published yet.

Disappearance is never converted to cancellation. A listing may age out of 7D, 30D, or 90D, move
dates, leave API coverage, or complete normally. Rows remain available for first/last-seen analysis,
but only explicit status changes create transition records. Historical trends begin with the first
stored baseline; no synthetic pre-history is generated. The one-time baseline command uses a stored
retrieval timestamp or, for older completed runs, the maximum event retrieval timestamp inside that
run. It only backfills an existing latest transition when `previousStatus`,
current status, and `statusChangedAt` all identify an actual observed change:

```bash
npm run ticketmaster:baseline
```

The Supply Trends UI reuses current country, segment, and 7D/30D/90D filters. Until a second
comparable capture exists it says `Collecting longitudinal history`; Overview uses the same honest
state for cross-sector comparison. Ticketmaster remains coverage-limited and is not the full
live-event market.

## IGDB and Steam gaming data

### IGDB authentication and release scope

IGDB uses the official v4 API root:

```text
https://api.igdb.com/v4/
```

The server obtains a Twitch app access token with the client-credentials flow at
`POST https://id.twitch.tv/oauth2/token`. `IGDB_CLIENT_ID` and `IGDB_CLIENT_SECRET` are read from
`.env`; the access token is cached in memory until shortly before its reported expiry. Client
credentials, bearer tokens, authenticated headers, and authenticated request details are never
persisted, logged, or serialized to the browser. The runtime does not use a user OAuth flow or the
configured redirect URI.

The release corpus uses IGDB `games` records from 2019 onward plus approximately 180 days of
upcoming releases. The phase-one corpus also requires an involved-company record so release-supply
and concentration attribution remain auditable. Cancelled (`6`) and Rumored (`7`) statuses are
excluded while source records with unspecified status remain eligible. Queries are partitioned into deterministic monthly date windows, page at 500
records, run sequentially, and use a local 275 ms minimum request interval under IGDB's documented
four-requests-per-second limit. HTTP 429 and transient 5xx responses receive at most two bounded
retries. The inspection command also validates `game_types`, `external_game_sources`, `genres`, and
`platforms`:

```bash
npm run igdb:inspect
npm run ingest:igdb -- --start=2019-01-01 --end=2027-02-09
```

Phase-one inclusion is source-defined `Main Game` (`0`), `Standalone Expansion` (`4`), `Remake`
(`8`), and `Remaster` (`9`). Records with `version_parent` are excluded to avoid collector and
edition duplicates. DLC, non-standalone expansions, bundles, mods, episodes, seasons, packs,
updates, expanded editions, ports, and forks are excluded by their IGDB game type. Standalone
remakes and remasters remain valid records. This is a conservative source-field policy rather than
title heuristics. Requiring company attribution can omit legitimate releases with incomplete IGDB
company metadata, and source miscoding can still affect scope.

`Game` uses the IGDB ID as provider identity and preserves name, slug, first release date, exact
game type, parent/version references, IGDB timestamps, and first/last-seen timestamps. Normalized
relations preserve companies and developer/publisher flags, genres, platforms, release-date
records, release region/date precision, and external identifiers. Company and release metadata is
updated idempotently; raw macro observations and Ticketmaster/GDELT records are unaffected.

Steam matching uses only IGDB `external_game_source = Steam` (live source ID `1`) and its numeric
`uid`. There is no title fuzzy matching or catalog-wide guess. Multiple source records can retain a
shared Steam app identity, while Steam enrichment selects one deterministic IGDB record per app ID.

### Steam activity and commercial overlay

Steam enrichment is limited to validated IGDB Steam mappings. It does not enumerate the entire
Steam catalog. Phase one uses Valve-owned endpoints:

- `GET https://api.steampowered.com/ISteamUserStats/GetNumberOfCurrentPlayers/v1/?appid=...` for
  current players. This is a concurrent-player count for users currently connected to Steam, not
  DAU, MAU, sales, or lifetime audience.
- `GET https://store.steampowered.com/appreviews/{appid}?json=1...` for the official review summary:
  total reviews, positive reviews/percentage, and source score label. Reviews are engagement and
  sentiment evidence, not unit sales.
- `GET https://store.steampowered.com/api/appdetails?appids=...` for current Valve store metadata,
  price in source minor units, currency, discount, free-to-play status, developers, publishers, and
  release-date text. Missing price data remains null and currencies are not converted.

The modern authenticated `IStoreService/GetAppList/v1` endpoint requires a suitable Web API key.
Local inspection currently receives HTTP 403 for the configured non-publisher key, so that endpoint
is not used. The older all-app endpoint is deprecated and is also not used. The source remains
configured only when the official base URL and `STEAM_WEB_API_KEY` are present, but current player,
review, and store collection does not attach the key unnecessarily to public requests.

Valve requests are sequential with a 275 ms minimum interval and bounded retry for HTTP 429 and
transient 5xx responses. Inspect endpoints without database writes, then enrich bounded mapped
batches:

```bash
npm run steam:inspect
npm run ingest:steam -- --limit=100
npm run ingest:steam -- --limit=500 --offset=500
```

`SteamGameSnapshot` separates dynamic observations from static IGDB metadata. It stores the game
and Steam identities, capture and retrieval timestamps, current players, review summary, current
and original price, discount, currency, free-to-play and store-availability state. The default
capture identity is the UTC hour. Retrying a batch in that hour updates the same game/capture row;
a later hour creates legitimate new history. No pre-ingestion Steam activity is reconstructed.

The Gaming page presents tracked releases over time, 30/90/180-day upcoming supply, source genre
and platform mix, distinct developers and publishers, top-ten release shares, Steam player/review
coverage, and current price/discount/free-to-play coverage. Publisher/developer concentration is a
share of attributed tracked releases, not revenue or employment concentration. A summed concurrent
player snapshot is Steam-covered activity across collected titles, not total gaming engagement.

Important limitations:

- IGDB release and company metadata completeness varies by record and horizon.
- Steam covers one platform, not the full PC or gaming market.
- Current players are concurrent connected users, not generalized active users.
- Reviews are not sales and discounts are not distress.
- Farther-out upcoming release counts are less mature.
- Longitudinal Steam interpretation begins only after multiple snapshots accumulate.
- No Gaming Stress Index or Industry Viability score is calculated.

## Culture Intelligence media layer

### Unified article model

`MediaArticle` is a raw article/story candidate, not a validated real-world event. It remains
separate from GDELT's candidate-event records and Ticketmaster's structured events. The record
stores a headline, API/feed snippet, publisher, safe canonical URL, publication/retrieval dates,
tracker-derived domain/event/signal-direction/confidence/importance labels, review state, and
compact provenance. `MediaArticleSourceMatch` preserves every NewsAPI query-family or RSS-feed
match without duplicating the article. Full article bodies are neither fetched nor stored.

Source registry metadata distinguishes `PRIMARY_DOCUMENT`, `JOURNALISTIC_REPORTING`, and
`SPECIALIST_ANALYSIS` evidence roles, along with institutional perspective, jurisdiction, and
bounded source specialisms. This is provenance, not a truth score. Primary documents establish
what the issuing institution did, announced, proposed, published, concluded, or stated; they do
not independently establish downstream employment, market, adoption, or creator-response effects.

Canonical identity is the normalized HTTPS article URL. Host casing, fragments, trailing slashes,
and common tracking parameters (`utm_*`, `gclid`, `fbclid`, and `mc_*`) are normalized while
meaningful query identifiers remain. A repeated or cross-source canonical URL updates
`lastSeenAt` and adds provenance rather than creating another article. Raw articles remain
independent records. Curated presentation and the Daily Culture Brief derive conservative
story-level clusters at query time from canonical URLs, stored story fingerprints, close
publication times, matching sector/event labels, and distinctive normalized-headline overlap.
False merges are treated as more costly than duplicate clusters, and every underlying publisher
link remains visible.

Classification is deterministic and uses only title, supplied description/snippet, source
metadata, and a query/feed sector hint. Confidence is `LOW`, `MEDIUM`, or `HIGH`. Importance is a
transparent tracker-derived 1–5 heuristic based on concrete named developments, rights/policy or
labor implications, explicit scale terms, and cross-sector breadth; it is not an objective impact
score. The public classification hierarchy is `domain/sector → event type → signal direction →
importance → confidence`. Signal direction is exactly `POSITIVE`, `NEGATIVE`, or `AMBIGUOUS` and
describes the supported direction of the tracked development, not article tone, ideological
approval, evidence strength, or materiality. A confidently observed rule change can therefore be
high-importance and `AMBIGUOUS`, while an evidenced closure is normally `NEGATIVE` and attendance
growth is normally `POSITIVE`.

Event types provide conservative priors rather than fixed sentiment mappings. Forecasts,
proposals, legal interpretation, leadership changes, policy or eligibility rules, and materially
mixed cross-sector effects default to `AMBIGUOUS` unless supplied evidence supports a clearer
direction. Investment and AI adoption are not automatically positive; observed capacity,
participation, rights, demand, or efficiency improvement is required, while demonstrated labour or
revenue harm can support `NEGATIVE`. Conflicting positive and negative effects collapse to
`AMBIGUOUS` rather than selecting a preferred stakeholder. Importance, confidence, AI Intelligence
eligibility, and ranking remain direction-neutral.

The older persisted AI-impact field remains an internal compatibility input for existing AI
routing and Overview analytics while the richer query-time AI category and claim-kind architecture
supersedes it. It is no longer the user-facing third classification dimension. Historical AI-tag
corrections and positive-review snapshots are retained under their original semantics and are not
reinterpreted as signal-direction judgments.

The reusable media event vocabulary also distinguishes senior leadership changes, major
product/capability releases, concrete compute-infrastructure expansions, and rights or eligibility
rule changes. These types describe supported actions rather than AI subject matter alone. Existing
general types remain authoritative where they already fit: material AI financing is `INVESTMENT`,
workforce replacement is `AI_LABOR_DISPLACEMENT`, and regulatory enforcement remains
`AI_POLICY_REGULATION`. Routine personnel changes, minor features, generic partnerships, planned
capacity discussions, forecasts, and commentary do not receive the new event types merely because
they concern a prominent AI organization.

### TheNewsAPI

The authenticated source uses only:

```text
GET https://api.thenewsapi.com/v1/news/all
```

The token is attached as `api_token` only at request time and removed from safe provenance URLs,
errors, logs, and frontend data. Queries use the documented phrase, prefix, grouping, AND (`+`),
OR (`|`), and exclusion syntax and are restricted to title, description, and keywords to reduce
main-text false positives. Five scheduled AI discovery families cover frontier capabilities,
compute/infrastructure, policy/governance, labour/economics, and rights/creative-industry
developments. They rank the bounded result set by API relevance; family membership is not event,
importance, or AI-relevance evidence, and these families therefore have no fallback event type.
Named non-AI families continue to cover closures, layoffs, insolvency, cancellations, demand
weakness, funding cuts, consolidation, openings, investment, attendance or revenue growth, and
expansion. Counter-signals are deliberately collected alongside stress candidates.

The free-plan operating policy assumes 100 requests/day and three articles/request. A run defaults
to 15 sequential targeted requests, has a hard application cap of 25, and reports usage. HTTP 429
and transient 5xx responses receive at most two bounded retries. The source accepts UTC date-times
in `YYYY-MM-DDTHH:mm:ss` format. The scheduler remains bounded to ten requests every three hours
(at most 80/day): the five structural AI families plus the first five cultural-industry event
families. Inspection uses only three representative requests and never writes to the database:

```bash
npm run media:newsapi:inspect
npm run ingest:media:newsapi -- --hours=24 --max-requests=15
npm run ingest:media:newsapi -- --hours=72 --family=ai-frontier-capabilities
```

### Curated RSS and Atom

RSS ingestion uses publisher-exposed RSS 2.0 or Atom endpoints, not manufactured feeds or
third-party mirrors. The parser retains GUID, title, HTTPS link, published/updated time, a short
HTML-stripped snippet, feed identity, and retrieval time. Source tiers (`PRIMARY_TRADE`,
`MAJOR_GENERAL`, `SPECIALIST`, `OFFICIAL`) guide presentation priority; they are not truth scores.

The live-validated registry has 18 enabled feeds:

- Music: Music Business Worldwide, Billboard, NME Music, and Pitchfork News.
- Film: Variety Film, Deadline Film, The Hollywood Reporter Movies, and IndieWire Film.
- Theatre/arts: Playbill and ArtsHub Australia.
- Gaming: GamesIndustry.biz, Game Developer, PC Gamer, and Polygon.
- AI/policy: TechCrunch AI, Ars Technica Technology Lab, and Electronic Frontier Foundation.
- Cross-sector: The Guardian Culture.

BroadwayWorld is disabled because its publisher endpoint returned HTTP 403 during validation;
TheaterMania is disabled because its endpoint returned no parseable items. Broken feeds are not
silently counted healthy. Inspect and ingest with:

```bash
npm run media:rss:inspect
npm run ingest:media:rss -- --hours=72
npm run ingest:media:rss -- --hours=24 --sector=gaming
```

### Authoritative institutional feeds

Nine official recurring feeds use the same bounded RSS/Atom parser but run as distinct sources so
their cadence, ingestion runs, and freshness remain auditable:

- U.S. Copyright Office NewsNet — `https://www.copyright.gov/rss/newsnet.xml`
- CFPB Newsroom — `https://www.consumerfinance.gov/about-us/newsroom/feed/`
- FTC Competition — `https://www.ftc.gov/feeds/press-release-competition.xml`
- FTC Consumer Protection — `https://www.ftc.gov/feeds/press-release-consumer-protection.xml`
- NIST Information Technology — `https://www.nist.gov/news-events/information%20technology/rss.xml`
- UK DSIT — `https://www.gov.uk/government/organisations/department-for-science-innovation-and-technology.atom`
- UK Intellectual Property Office — `https://www.gov.uk/government/organisations/intellectual-property-office.atom`
- UK Competition and Markets Authority — `https://www.gov.uk/government/organisations/competition-and-markets-authority.atom`
- European Commission DG CONNECT — `https://ec.europa.eu/commission/presscorner/api/rss?language=en&pagesize=20&dept=CONNECT`

Each is `PRIMARY_DOCUMENT` / `OFFICIAL`. Retrieval is sequential, limited to one feed request per
source run, a trailing 72-hour publication window, and at most 50 accepted items. There is no
pagination, archive crawl, full-document fetch, or external-link following. Copyright NewsNet and
NIST run daily; the other feeds run every 12 hours and are deliberately excluded from the existing
three-hour journalism RSS cycle. Manual refresh uses the existing command, for example:

```bash
npm run ingest:media:rss -- --hours=72 --source=copyright-newsnet
```

Primary-source guardrails treat reports, research, guidance, proposals, and consultations as
documents rather than completed real-world events. A discrete event classification requires an
explicit institutional actor/action in the supplied title. Official or forceful wording does not
by itself raise importance, and an authoritative source establishes what that institution did or
said rather than proving a forecast or downstream effect. The current event taxonomy cannot
encode every regulatory procedure or proposal status, so unsupported cases retain a null event
type rather than adding broad new categories.

GOV.UK feed content is attributed to the named department or agency; reuse of Crown material must
follow the Open Government Licence and its attribution requirements. All other official-source
terms and attribution requirements continue to apply. Institutional claims remain distinct from
independent journalistic evidence.

Live validation on 26 August 2026 found that the supplied DG CONNECT Press Corner URL returned a
general `Press releases - RSS` channel and item-level `POLICY_AREA` metadata, including items not
specific to DG CONNECT. The tracker preserves the requested endpoint provenance but does not infer
DG CONNECT authorship from the query parameter: unrelated items remain low-importance,
`industry-events` records with null event types. The endpoint's department filtering should be
revalidated before treating this feed as complete DG CONNECT coverage.

### Specialist AI, policy, labour, and copyright feeds

Ten high-signal feeds extend the same `MediaArticle` layer with an explicit
`SPECIALIST_ANALYSIS` evidence role:

- Tech Policy Press — `https://www.techpolicy.press/rss/feed.xml`
- Lawfare — Cybersecurity & Tech — `https://www.lawfaremedia.org/feeds/cybersecurity-tech`
- CSET — `https://cset.georgetown.edu/feed/`
- AI Now Institute — `https://ainowinstitute.org/feed/`
- Kluwer Copyright Blog — `https://legalblogs.wolterskluwer.com/copyright-blog/rss.xml`
- AI as Normal Technology — `https://www.normaltech.ai/feed`
- Blood in the Machine — `https://www.bloodinthemachine.com/feed`
- ChinAI — `https://chinai.substack.com/feed`
- Authors Alliance — `https://www.authorsalliance.org/feed/`
- Creative Commons — `https://creativecommons.org/feed/`

Source metadata preserves the primary and additional perspectives (policy, legal, research,
academic, analytical, advocacy, labour, journalism, licensing, or translation), jurisdiction, and
specialisms. These labels describe evidentiary context, not ideology or truth. CSET remains
source-level `SPECIALIST_ANALYSIS`: its feed does not reliably encode a robust item-level boundary
between original research and commentary. ChinAI carries `TRANSLATED_OR_SUMMARISED` provenance;
where its feed supplies a clean external source link that URL is retained, but the translation is
not treated as direct ingestion of the original document.

Every specialist run makes one feed request, follows no pagination or external links, fetches no
full article text, rejects future-dated entries, strips HTML, and caps both age and item count.
Tech Policy Press normalizes only the newest 100 feed entries, then caps persistence to 20 items
and 72 hours because its feed is unusually large; the other specialist feeds are capped to 30
items and seven days. Item text must independently match a
bounded AI, policy, labour, copyright, compute, competition, or creator-rights relevance predicate:
feed membership alone does not guarantee ingestion or Culture Intelligence eligibility.

Tech Policy Press, Lawfare, Kluwer, and Blood in the Machine run every 12 hours. CSET, AI Now,
Normal Technology, ChinAI, Authors Alliance, and Creative Commons run daily. They stay outside the
three-hour journalism cycle and reuse the scheduler's locking, staggering, failure isolation, and
freshness semantics.

Specialist analysis may be structurally material while retaining `eventType = null`. Labour
exposure or forecasts are not observed displacement; workplace adoption is not layoffs; legal
analysis is not a ruling; proposals are not enacted regulation; and organizational advocacy
establishes an attributed position rather than an objective outcome. First-class AI materiality
can still recognize evidence-rich policy, labour, economics, compute, industrial-structure, or
rights analysis without requiring a named cultural sector. Luna evidence packets receive the
role, perspectives, jurisdiction, specialisms, institution, and translation provenance as trusted
metadata; titles and snippets remain untrusted evidence.

Feed content remains subject to each publisher's copyright and reuse terms. The tracker stores
only supplied metadata and a short sanitized snippet, not full articles.

`/media` is the Culture Intelligence view with 24H/3D/7D and sector/AI filters, high-signal views,
and a chronological feed. Music, Film, Theatre, and Gaming pages show complementary Recent
Developments without replacing structured analytics.

### Human classification review

Media classification review has three explicit states: no feedback row means `UNREVIEWED`, while
stored feedback is either `CORRECT` or `WRONG_CLASSIFICATION`. A correct review snapshots the
machine sector, event type, signal direction, importance, confidence, and legacy AI-impact
compatibility value exactly as they existed at review time. If those current machine fields later
differ, evaluation reads expose
`REVIEW_OUTDATED` while preserving the historical approval.

Wrong-classification reasons and optional correction values remain separate from immutable machine
fields. Reviewers can flag and optionally correct signal direction as Positive, Negative, or
Ambiguous. The former AI-tag correction remains readable for historical evaluation but is no longer
offered as the current UI action. Switching a wrong review to correct clears all reasons,
corrections, and any
`NOT_RELEVANT_TO_CULTURAL_INTELLIGENCE` exclusion; switching to wrong clears the positive snapshot.
Clearing either state deletes the feedback row and returns the article to unreviewed. Positive
validation is evaluation data only: it does not affect ranking, routing, eligibility, clustering,
the Daily Brief, or classifier behavior.

Future explicit review actions also append a `MediaClassificationReviewEvent` inside the same
database transaction as the operational feedback change. This ledger is historical rather than
operational: it freezes the review-time title, supplied description, source/query/feed context,
canonical identity, content hash, machine prediction, classification rationale, intentional
contract versions, and field-level `UNREVIEWED` / `APPROVED` / `CORRECTED` / `REJECTED` judgments.
Changing or clearing a review appends a superseding event and leaves the earlier event intact.
Feedback rows that predate the ledger are not backfilled or represented as equivalent immutable
examples.

The review ledger versions live in
`src/services/media/media-classification-contract-versions.ts`. Increment the classifier version
when the overall prediction contract changes; the ruleset version for material deterministic rule
changes; the taxonomy version for label additions or semantic changes; the Signal Direction version
for direction-derivation changes; the input-schema version when classifier-relevant serialized input
changes; and the review-guideline version when the meaning of a human review action changes. These
versions are intentional semantic identifiers rather than Git commit substitutes. A deployment Git
revision is recorded separately only when the runtime provides one.

### Daily Culture Brief

Overview contains a compact Daily Culture Brief and `/brief` exposes the full story-level view.
The default current window is the preceding 24 hours by article publication time. The comparison
window is the immediately preceding 24 hours; reusable loading supports a 72-hour corpus without
treating re-ingestion time as recency. The brief is generated on request rather than persisted.
This keeps it aligned with the latest feedback and freshness state, avoids storing copied article
content, and leaves a versioned archive as a later product decision.

Story interpretation uses human correction fields only in the brief layer. An explicit corrected
sector, event type, signal direction, legacy AI tag, or importance takes precedence over the corresponding machine label
without modifying `MediaArticle`. Conflicting corrections inside one cluster are marked ambiguous
and routed conservatively. `NOT_RELEVANT_TO_CULTURAL_INTELLIGENCE` excludes an article; a cluster
with no remaining eligible articles disappears from the brief. Human corrections still do not
change `/media`, sector routing, ingestion, or classifier output.

Top Developments rank material clusters by effective importance, confidence, independent publisher
count, and recency, in that order. Publisher count is corroborating breadth, not a substitute for
importance, and syndicated copies do not inflate it. AI Intelligence is a first-class analytical
domain: a material AI rule, frontier-model release, creator-tool deployment, labour development,
rights action, accelerator/export-control change, infrastructure investment, or attributed
economic signal can qualify without naming Music, Film, Theatre, or Gaming. Eligibility still
requires a supported material development; tutorials, incidental mentions, minor features, generic
opinion, and unsupported predictions remain excluded. Attributed forecasts establish that a named
speaker expressed a view, not that the predicted outcome is true. Positive openings, hiring,
investment, funding, expansion, attendance, and revenue developments are retained as
counter-signals. Quiet windows explicitly remain quiet; the system does not fill sections with
low-confidence stories.

AI importance assesses the supported development itself rather than requiring already-observed
downstream employment or revenue effects. Binding market-access rules and national or
precedent-setting policy can reach importance 5; major proposals, substantial deployment,
frontier capability, or material compute/capital changes can reach importance 4. Confidence is
separate: one explicit credible source can strongly support the narrow claim that an action was
taken or a statement was made, while uncertainty about consequences remains visible. The derived
AI category vocabulary is query-time application logic and does not add persisted Prisma enums;
existing event and legacy AI-impact values remain stored compatibility taxonomy. This domain/materiality/evidence
separation is designed to admit a future Consumer/Credit intelligence domain without treating
media signals as measured macroeconomic observations.

AI assessment also derives a query-time claim kind: `OBSERVED_ACTION`, `PROPOSED_ACTION`,
`ATTRIBUTED_ANALYSIS`, or `GENERAL_MENTION`. It is not persisted and does not replace the evidence
role or human corrections. The Luna experiment receives this deterministic context so it can keep
completed actions distinct from proposals, forecasts, interpretation, and organizational
positions; production eligibility and ranking remain deterministic.

All synthesis is deterministic and limited to stored headlines, snippets, classifications,
feedback, publication metadata, and current structured metrics. Short “why it matters” text is a
transparent event-type template, not an article-body summary, causal claim, or model-generated
narrative. The market-context panel uses only latest validated observations with source, date,
frequency, unit, and scope caveats. It does not claim that daily reporting caused the structured
metric. The brief also shows the latest RSS/TheNewsAPI refresh and warns when existing scheduler
freshness marks either media source late or failed. Production page rendering uses no external
model; both the manual experiment and the precomputed production layer described next remain
isolated from request paths.

Phase 1 includes a manual, ephemeral GPT-5.6 Luna story-synthesis experiment without changing the
Daily Brief or any production page. It accepts one currently eligible deterministic story cluster,
removes `NOT_RELEVANT_TO_CULTURAL_INTELLIGENCE` evidence, applies the existing human-correction
precedence, and sends at most six stored headline/snippet records in a 12,000-character evidence
packet. Evidence v5 exposes deterministic signal direction, AI category, and claim kind; distinguishes hard label
corrections from the softer importance judgment, reports publisher diversity without treating it
as independent confirmation, and identifies primary, journalistic, specialist, and mediated
evidence separately. Signal direction is explicitly non-sentiment and independent of claim kind,
confidence, causality, materiality, and ranking. Legacy AI-impact values appear only in a named
compatibility block when present. Trusted grounding instructions are separated from the untrusted article
metadata, tools and web search are disabled, SDK retries are disabled, strict structured output is
validated, and no result is written to Prisma or OpenAI storage. List candidates or synthesize one
explicitly:

```bash
npm run llm:synthesize-story -- --list
npm run llm:synthesize-story -- <cluster-or-article-id> --dry-run
npm run llm:synthesize-story -- <cluster-or-article-id>
npm run llm:synthesize-story -- <cluster-or-article-id> --yes
```

Interactive use requires confirmation before the one API request unless `--yes` is supplied.
`--evaluation-only` may be combined with an explicit identifier to inspect a low-ranked recent
cluster without changing its stored labels, deterministic eligibility, rank, Daily Brief routing,
or any production request path. It never admits `NOT_RELEVANT_TO_CULTURAL_INTELLIGENCE` evidence.
Usage reporting separates uncached input, cached input, and output tokens. Estimated cost uses the
current documented GPT-5.6 Luna standard rates of USD $0.20, $0.02, and $1.20 per million tokens,
respectively; it is an estimate rather than an organization billing query. The model output cannot
change classifications, eligibility, materiality, ranking, clustering, or presentation.

The refined single-story output preserves a query-time synthesis claim kind
(`OBSERVED_ACTION_OR_EVENT`, `PROPOSAL_OR_PLAN`, `ATTRIBUTED_FORECAST_OR_ANALYSIS`,
`EMPIRICAL_FINDING`, `INTERPRETATION`, or `GENERIC_MENTION`), distinguishes incident, signal, and
structural-development significance, types only material uncertainties, and may identify concrete
observable `whatToWatch` indicators. Validation rejects claim-kind changes, proposal-to-enactment,
unsupported causal assertions, investment-to-displacement drift, benchmark-to-deployment drift,
unsupported temporal-inflection language, invented numbers, and cross-story connections in a
single-story packet. Material analysis may retain `eventType = null`.

Validated single-story synthesis can now be precomputed and persisted outside request-time
rendering. The `luna-story-synthesis` scheduler source reuses the existing scheduler lock and run
observability, selects only clusters already admitted by deterministic production eligibility,
and defaults to disabled until `LUNA_SYNTHESIS_ENABLED=true`. When enabled, it checks every three
hours, considers the four highest-ranked eligible clusters, calls Luna only for stale or missing
entries in that bounded shortlist, and permits no more than sixteen calls in any rolling 24-hour
window. These bounds, the 48-hour evidence lookback, and the refresh
cadence are configurable with `LUNA_SYNTHESIS_MAX_PER_CYCLE`,
`LUNA_SYNTHESIS_DAILY_CALL_LIMIT`, `LUNA_SYNTHESIS_LOOKBACK_HOURS`, and
`LUNA_SYNTHESIS_REFRESH_HOURS`.

Each artifact is keyed by a SHA-256 fingerprint of effective evidence v5 plus the prompt version,
output-schema version, and requested model. A newly joined article, relevant human correction,
`NOT_RELEVANT` evidence change, or version change therefore creates a new identity; unchanged
evidence is reused without an API call. Validated results and individual attempts retain model,
latency, token, estimated-cost, and failure metadata. Invalid output or provider failure never
replaces the last validated artifact. The read service returns `CURRENT`, `STALE`, or `MISSING`
and performs no inference; existing deterministic copy remains the application fallback.
The full Daily Brief and bounded Culture Intelligence highlight cards use one batched artifact
lookup per page service. `CURRENT` results show a compact interpretation, one material uncertainty,
and one concrete indicator to watch. `STALE` results retain the last validated interpretation with
a subtle evidence-changed note. `MISSING` results render no Luna block, spinner, or request-time
fallback; the deterministic card remains unchanged. The compact Overview brief does not request or
display Luna synthesis.

Run one bounded manual production cycle with explicit spend confirmation:

```bash
npm run llm:generate-production -- --limit=1 --hours=48
npm run llm:generate-production -- --limit=1 --hours=48 --yes
npm run llm:production-status
```

Automatic production synthesis remains interpretation-only: it cannot change classification,
Signal Direction, importance, confidence, ranking, eligibility, clustering, or human feedback.
Cross-story synthesis remains manual and ephemeral pending a separate persistence/cadence design.

An additional manual-only bounded intelligence experiment can synthesize up to six deterministic
clusters and two stored evidence rows per cluster, capped at 30,000 serialized characters. A
deterministic shortlist and relationship hints are built before the one Luna call; only hinted
cluster relationships may appear in output, causality remains `NOT_ESTABLISHED`, contradictions
require a deterministic conflict candidate, and trend/inflection language requires a supplied
historical span. This command is not called by `/`, `/brief`, or any production request path:

```bash
npm run llm:synthesize-intelligence -- --dry-run
npm run llm:synthesize-intelligence
npm run llm:synthesize-intelligence -- --yes --limit=6 --hours=336
npm run llm:synthesize-intelligence -- --dry-run --evaluation-only --ids=<cluster-id>,<cluster-id>
```

Explicit `--ids` selection is bounded to six clusters and is manual/evaluation-only when the
override is supplied. It does not bypass `NOT_RELEVANT_TO_CULTURAL_INTELLIGENCE`, persist output,
or alter production shortlist selection. Single- and multi-story prompts require explicit
attribution for forecasts, findings, specialist interpretation, and mediated evidence; cross-story
causality remains prohibited, and `whatToWatch` is expressed as observable evidence rather than a
recommendation.

Phase 1B adds a manual evaluation harness without changing that authority. Luna now returns an
independent qualitative materiality level (`VERY_LOW`, `LOW`, `MODERATE`, `HIGH`, or `VERY_HIGH`)
and rationale alongside evidence strength. Evidence strength asks how directly the stored evidence
supports the synthesis; materiality asks how consequential the supported development could be for
cultural-sector economics, structure, labour, rights, production, distribution, demand, or
technology. A one-publisher report may therefore have high evidence strength for a narrow claim,
while high potential materiality may coexist with weak evidence when uncertainty is explicit.

The evaluation-only comparison maps deterministic importance 1–5 to `VERY_LOW` through
`VERY_HIGH` to flag `ALIGNED`, `LLM_HIGHER`, or `LLM_LOWER` results. These scales are not claimed to
be mathematically equivalent, and the comparison never changes production importance. Candidate
sampling greedily covers sectors, event themes, importance bands, positive/AI signals, source
breadth, and reviewed/corrected evidence. Dry-run before authorizing a bounded live run:

```bash
npm run llm:evaluate-stories -- --dry-run --limit=15
npm run llm:evaluate-stories -- --limit=15
npm run llm:evaluate-stories -- --limit=15 --yes
```

The command never exceeds 20 calls, executes sequentially without retries, shows an upper-bound
cost before confirmation, and reports actual token, cost, median-latency, and p95-latency totals.
Interactive runs can record optional synthesis-quality, materiality, grounding, and note fields.
Run artifacts are written under gitignored `data/evaluations/story-synthesis/`; they contain cluster
evidence, results, comparisons, usage, flags, and optional human judgments, but no API key. They are
evaluation data only and are not persisted to Prisma or used by production pages.

### DeepSeek live-research shadow staging

The researcher discovers evidence for `au-live-music-venue-viability` only. It is a
shadow discovery system, separate from deterministic ingestion, classification and Luna.
No researcher path writes canonical observations or automatically approves reviews.
Fresh tests confirmed that provider-extracted quotes can remain inaccurate despite local
containment checks. The authorized unattended rollout is **unverified discovery only**:
new model candidates are UNVERIFIED; known-bad evidence is QUARANTINED. Nothing is wired
into the UI or canonical ingestion. See the validation record for the retained failures.

The current pipeline uses DeepSeek Responses with `deepseek-v4-pro`:

1. Reserve a durable `RUNNING` attempt under the existing scheduler lock.
2. Stream native `web_search`, with specific web-search tool choice, low reasoning,
   an 8,000 output-token ceiling and a 120-second deadline. Reject memory-only answers.
3. Stop acquisition locally after a successful search plus successful page operation,
   or at the bounded action boundary. Preserve completed original native tool items.
4. Replay those native items into one no-tools, no-reasoning extraction request. Supply
   observed URLs and a native-call identifier manifest; use JSON mode with an explicit
   schema, a 4,000-token ceiling and at most 60 seconds remaining in the 180-second budget.
5. Validate JSON locally, admit traced evidence, construct the legacy text artifact
   deterministically, validate provenance, and finalize the same run in shadow staging.

There are at most two provider requests per attempt, no retries, and no alternative
search provider or local page fetcher. DeepSeek's server tool-loop limits are not an
application-enforceable action quota; stopping the stream bounds client acquisition.
An interrupted stream may not report token usage. Such acquisition usage and combined
usage remain unknown, with the reported extraction portion retained separately.

Quotes are model-extracted from provider-restored results, not independently verified
against locally available page bodies. Source authority and retrieval confidence remain
independent. Failed opens never establish direct inspection. Exact publication dates,
coarse publication evidence, reporting periods and retrieval timestamps stay distinct.
Candidate confidence remains low. Numeric observation quotes must occur in the same
source evidence passage. Known-invalid staged candidates can be quarantined; quarantine
persists through rediscovery and prevents approval. Unsupported source URLs are rejected independently;
if every proposed URL is rejected, the attempt fails. Unsupported numeric observations are omitted with explicit rejection reasons; verbal
fractions remain narrative. Other contract violations fail closed. Discovery supplies no permission to scrape, store or republish source material.

Configure `DEEPSEEK_API_KEY` and explicitly enable `LLM_RESEARCHER_ENABLED=true` before
operator execution. All CLI research now passes through scheduler safeguards and durable
persistence; the historical `--persist` flag is accepted but is no longer needed.

```bash
npm run research:once -- --task=au-live-music-venue-viability
npm run research:inspect -- --task=au-live-music-venue-viability
npm run scheduler:inspect
npm run research:review -- --candidate=<id> --decision=approve-for-investigation --reason="..."
```

Normal unattended scheduling remains disabled by default, inspects every 12 hours,
executes at most one task per cycle, applies task cadence of 24 hours and a rolling
limit of two attempts per 24 hours. Incomplete durable attempts also count, so a process
crash cannot erase a dispatched attempt from cadence/rolling history. Preflight skips
make no model call and create no research run. Operator-only `--force-task` and
`--force-rolling-limit` bypass only their named gates; they are not unattended defaults.

Existing source identity, first-seen timestamps, occurrence tracking and append-only
review history are retained. New candidate fingerprints additionally include scope and
raw reporting context; historical fingerprints are never rewritten. Approval means
approved for ingestion investigation, never canonical truth.

The local research-only service can be installed with `python3 ops/install-research-worker.py`
after enabling `LLM_RESEARCHER_ENABLED=true` in `.env`. It uses launchd at user login and
runs `scheduler-worker.ts --research-only`; it never selects other ingestion sources or
passes operator cadence overrides. See [local service operations](ops/README.md).

See [researcher architecture and validation](docs/deepseek-researcher.md) for the live
findings, remaining qualification requirements and migration details.

Important media-methodology limits:

- News coverage is not real-world event incidence, and absence of coverage is not absence of an
  event.
- Multiple outlets can cover one underlying story; brief clusters are conservative presentation
  groups, not validated real-world events.
- Publisher and feed coverage varies by country and sector.
- Polarity describes the candidate article, not overall industry health.
- Importance is tracker-derived, reviewable, and deliberately conservative.
- No article URL is fetched server-side and no paywall or publisher restriction is bypassed.

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

## Provisional US domestic box office

The Film page uses the public Kaggle community dataset **U.S. Weekend Box Office Summaries**
(`jonbown/weekend-box-office-summaries`) as a temporary research placeholder. The dataset reports
that its underlying figures are Box Office Mojo-derived. This project does not scrape Box Office
Mojo or The Numbers, does not call a Box Office Mojo API, and does not claim an official or
licensed Box Office Mojo integration. Replace this source with a licensed or primary US theatrical
source before public production deployment.

The source uses Kaggle's supported public API endpoints and currently requires no Kaggle
credentials:

```text
GET https://www.kaggle.com/api/v1/datasets/view/jonbown/weekend-box-office-summaries
GET https://www.kaggle.com/api/v1/datasets/download/jonbown/weekend-box-office-summaries
```

The downloaded ZIP contains annual `weekend_summary_YYYY.csv` files. Current columns are `date`,
`occasion`, `top10_gross`, `top10_wow_change`, `overall_gross`, `overall_wow_change`,
`num_releases`, `top_release`, and `week_no`. `USBoxOfficeWeekend` stores one canonical populated
weekend per source year/week number, exact weekend boundaries, total and Top 10 nominal USD gross,
source-published change labels, release count, #1 film, dataset version metadata, retrieval dates,
and explicit provisional provenance. Repeated downloads update revised periods rather than
duplicating them.

The community files include overlapping three-, four-, and five-day holiday summaries under the
same source week number. To avoid double-counting, ingestion selects the summary closest to the
standard three-day weekend, prefers the unqualified row on ties, and records that policy in source
metadata. Null future placeholders are not ingested. Missing pandemic observations are not
interpolated or converted to zero.

Inspect without persistence and ingest the research history from 2015 onward with:

```bash
npm run usboxoffice:inspect
npm run ingest:usboxoffice -- --start=2015
```

Film analytics remain presentation-layer calculations:

- Week-over-week compares consecutive published weekends only when their dates are 5–10 days
  apart.
- Latest year-over-year compares the same source week number one year earlier.
- Four-week rolling gross sums four consecutive published weekends; gaps return unavailable rather
  than being interpolated.
- Trailing 52-week gross uses a date-bounded 364-day window ending at the latest weekend.
- Calendar YTD sums the current source year only through the latest available source week.
- Prior-year and 2019 YTD comparisons stop at that same week number, so a partial current year is
  never compared with a complete historical year.

All amounts are nominal US dollars. No inflation adjustment, ticket-price decomposition, or
structural-health conclusion is made from short-term weekend volatility.

## British Film Institute UK film data

The Film page uses official public BFI resources rather than a commercial box-office API. Weekly
reports are discovered from the [BFI weekend box-office figures](https://www.bfi.org.uk/industry-data-insights/weekend-box-office-figures)
page and its annual index pages, then downloaded from BFI's `core-cms.bfi.org.uk` file host. The
access review found no `robots.txt` file and no main-site term expressly prohibiting this bounded,
low-frequency retrieval. BFI's general terms limit use to personal/non-commercial contexts, so the
integration is suitable for private research and licensing/data-reuse should be reassessed before
public or commercial deployment. No access control, CAPTCHA, browser emulation, or third-party
box-office source is used.

The public weekly archive uses several spreadsheet formats:

- 2019–2025 include legacy XLS and newer XLSX files.
- 2026 reports are currently ODS.
- Each report covers Friday–Sunday nominal GBP and contains the BFI top 15, other reported UK
  films, and other newly released films.

`BFIWeekendBoxOffice` stores a deterministic weekend identity, the explicit source-published top-15
total, a broader sum of every film row present in the workbook, reported release count, top-film
detail, source file provenance, and retrieval/publication timestamps. Because the additional
sections are not a complete census of every non-UK holdover outside the top 15, the broader measure
is always labelled **reported weekend gross**, not total UK box office. Concentration calculations
(#1, Top 3, and Top 5 share) use that same reported denominator and remain presentation-layer
calculations.

Inspect and ingest with:

```bash
npm run bfi:inspect
npm run ingest:bfi
npm run ingest:bfi -- --since=2019
```

Routine ingestion defaults to the current year. Historical files are cached outside the repository
under the operating-system temporary directory and are not committed. Repeated ingestion upserts
revised weekends by source/weekend end date. Missing and pandemic-closure weekends remain gaps;
the tracker never interpolates them.

Weekly analysis uses consecutive published reports for WoW, equivalent ISO weekends for YoY,
four consecutive observations for the four-week rolling sum, and equivalent elapsed ISO weeks for
prior-year and 2019 YTD comparisons. The Film page compares US and UK only through each market's
own percentage change relative to 2019; it does not compare or convert raw USD and GBP levels.

Annual structural context comes from clean ODS tables published through the
[BFI Statistical Yearbook](https://www.bfi.org.uk/industry-data-insights/statistical-yearbook):

- annual UK cinema admissions;
- annual UK box-office gross;
- UK and Republic of Ireland release count (stored with its wider scope documented);
- feature-film UK production spend and production count;
- HETV production spend and count stored separately from film.

The current structured Yearbook tables cover through 2023. Admissions are not inferred from gross,
and nominal box office is not treated as audience volume. Film production activity is presented
separately from theatrical demand, and HETV is never relabelled as film production.

## Theatre sector data

### Broadway Business access review

Broadway demand uses the public [Broadway Business Grosses](https://broadwaybusiness.com/grosses/)
page. The access review found no published Terms of Use, legal notice, copyright/data-use notice,
or `robots.txt` rule prohibiting this small automated retrieval. The page exposes structured JSON
for the current week and calls a public same-origin aggregate endpoint:

```text
GET https://broadwaybusiness.com/grosses/api/week/stats/chart?uptodate=1
```

The project therefore classifies access as `AUTHORIZED_STRUCTURED` under the user's explicit
authorization. It makes two sequential requests per refresh, uses no browser emulation or bypass,
and stores no page HTML. Live headers exposed a 60-request rate limit; normal ingestion stays far
below it. Broadway Business attributes the underlying statistics to The Broadway League. The
tracker makes no automated request to The Broadway League and does not imply Broadway Business
grants rights on its behalf. This integration remains **provisional/private research** and its
licensing should be reassessed before public deployment.

The public aggregate endpoint currently exposes weekly gross, attendance, and capacity from
2019-06-02 onward. The current page additionally exposes show count, average ticket price,
performance count, and previews for the latest week. Historical navigation on the page indicates
older weeks exist, but the permitted public aggregate endpoint does not return the requested 2015
history; this implementation does not scrape or synthesize it.

Inspect and ingest with:

```bash
npm run broadwaybusiness:inspect
npm run ingest:broadwaybusiness
npm run ingest:broadwaybusiness -- --since=2019
```

`BroadwayMarketWeek` uses source plus week-ending date as deterministic identity. Repeat runs
update revised weeks without duplication. Raw fields remain source-published; WoW, season-week
YoY, 4- and 13-week rolling sums, per-show values, calendar YTD, and equivalent-period comparisons
are presentation-layer calculations. Rolling values require consecutive published weeks and do
not bridge shutdown or missing-week gaps. Equivalent YTD comparisons use the same Broadway season
week in the comparison year and require that year's January coverage. Because the endpoint begins
in June 2019, full 2019 calendar-YTD comparison remains unavailable rather than comparing a partial
2019 year.

Broadway gross is nominal revenue, not audience demand. The Theatre page therefore shows gross,
attendance, capacity, and average ticket context together. Broadway covers Broadway NYC only; it
does not represent all US theatre.

### Ticketmaster theatre supply

The Theatre page reuses persisted Ticketmaster `Arts & Theatre` events, venues, 30D/90D supply
snapshots, and append-only status transitions for AU, US, GB, and CA. It creates no second
Ticketmaster ingestion path and never queries Ticketmaster during page rendering. Current forward
events, active venues, calendar density, and comparable-snapshot changes are kept semantically
separate from realized Broadway demand. Missing listings or events aging out of a forward window
are not cancellations; `offsale` is also not cancellation. Insufficient comparable history is
shown explicitly rather than replaced with zero or a fabricated trend.

### Live Performance Australia

Australian realized theatre demand uses Live Performance Australia's public
[Attendance and Revenue Report archive](https://reports.liveperformance.com.au/) and the latest
[2024 static report](https://reports.liveperformance.com.au/ticket-survey-2024/). The access review
classifies this source as `PUBLIC_STATIC_REPORT`: the report host's `robots.txt` allows retrieval,
the main LPA [terms](https://liveperformance.com.au/terms/) contain no express automation ban for
the separately hosted report archive, and the public report delivers its chart arrays in an
ordinary same-origin static JavaScript asset. The integration makes three sequential requests per
inspection or ingestion (archive, report shell, static bundle), follows no redirects, uses no
browser automation, and stores no report HTML or JavaScript.

The current report's national chart data provides annual nominal revenue and attendance for
`Theatre` and `Musical Theatre` from 2004 through 2024. The categories remain separate in raw
persistence. A presentation-only combined view is available only for years where both mutually
exclusive category observations have compatible revenue and attendance. Average ticket price is
stored only where the report explicitly publishes it; the tracker does not derive it from total
attendance. Paid attendance, event count, and historical geography are not manufactured.

Inspect and ingest with:

```bash
npm run lpa:inspect
npm run ingest:lpa
npm run ingest:lpa -- --since=2019
```

`LPAPerformanceMarketYear` uses source, year, category, and national geography as deterministic
identity. Repeated runs update the same annual observations. The 2024 report notes that 2018 was
revised for a source-data error and that source coverage depends on participating ticketing
providers and events in market. Pandemic observations remain source-published and missing years
are never interpolated. Regional reporting introduced in 2024 is not presented as a historical
series. Revenue is nominal AUD and is shown alongside attendance and ticket-price context rather
than being interpreted as audience growth by itself.

LPA and Ticketmaster remain semantically distinct: LPA describes realized annual attendance and
revenue, while Ticketmaster describes forward listing and venue supply. Neither is a complete
census of Australian theatre and no combined Theatre score is produced.

### Screen Australia current box-office ingestion

Screen Australia's official
[Current Box Office widget page](https://www.screenaustralia.gov.au/insights-and-trends/research-widget/)
publishes the public `https://box-office-widget.twistedpear-wgp.workers.dev` widget. The tracker
retrieves that exact server-rendered HTML once per refresh and deterministically parses only its
four named current tables. This is not an API. Acquisition is classified as public widget HTML,
provisional private/non-commercial research use. No explicit automation prohibition was found for
the widget endpoint, but Screen Australia's broader
[Terms and Conditions](https://www.screenaustralia.gov.au/corporate-documents/terms-and-conditions/)
restrict copying, redistribution, derivative use, and commercial reuse. Permission, attribution,
and republication rights must be reassessed before public or commercial deployment.

The fetcher uses a bounded timeout, response-size limit, explicit research user agent, and no inline
retry. Every inspection, manual ingestion, or scheduled ingestion performs exactly one GET. It does
not crawl Screen Australia, enumerate archives, execute browser automation, or contact Box Office
Mojo or Numero. Screen Australia says title lists normally update weekly, usually Monday, so the
central scheduler checks once every seven days and never requests historical data.

The parser validates the exact view IDs, headings, date labels, table labels, row semantics, ranks,
and numeric data attributes. A changed layout fails the run rather than silently assigning the
wrong table. Four report views are persisted:

- Top 5 Films weekly: week-ending date, rank, title, weeks in release, weekly gross, cumulative gross.
- Top Australian YTD: as-at date, rank, title, release-period label, current-year gross, cumulative gross.
- Top 20 Films monthly: four-week-ending date, rank, title, weeks in release, four-week gross, cumulative gross.
- Top 50 Films YTD: as-at date, rank, title, current-year gross, cumulative gross.

`ScreenAustraliaBoxOfficeObservation` uses source, report date, view, rank, and normalized title as
deterministic identity. Repeated runs update the same observations, including revised gross values.
Only rank, title, source-published period/release label, period gross, cumulative gross, report date,
and provenance are stored. No full-market gross, release count, distributor, theatre count,
market-share denominator, or revision policy is invented.

Inspect and ingest with:

```bash
npm run screenaustralia:inspect
npm run ingest:screenaustralia
```

There is no historical endpoint or backfill. Local longitudinal history begins with the first
ingested snapshot, and rank or aggregate changes must wait until enough compatible local snapshots
exist. Retrieval freshness and the source report date remain separate: a successful HTTP request
does not make a stale published report current. The Film page shows the report date and a warning
when it is beyond the weekly publication tolerance. The original iframe has been removed.

Theatre Recent Developments continues to use the separate MediaArticle candidate layer. No
Broadway, Ticketmaster, or media values are combined into a Theatre Health or Industry Viability
score.

## Overview analytics phase I

The Overview now separates observed values, derived changes, source-level directions, and
cross-sector breadth. It does not calculate a 0–100 Industry Viability score. The current breadth
view uses only comparable changes from existing structured sources:

- **Music:** real BEA recorded-music PCE YoY for streaming/radio and owned media/downloads; MVT
  audience, employment, and venue-count changes. Census AIES has only one comparable observation
  and BEA ACPSA is historical, so neither is treated as a current direction.
- **Film:** equivalent-period YTD US provisional domestic gross and BFI UK reported gross versus
  the prior year. The US series remains explicitly provisional and Box Office Mojo-derived.
- **Theatre:** Broadway attendance and nominal gross YoY plus LPA combined Theatre + Musical
  Theatre attendance and nominal revenue versus the prior comparable year.
- **Gaming:** rolling 12-month IGDB release activity is displayed as an activity/supply proxy and
  is excluded from cross-sector economic-viability breadth. Steam samples are not used as a
  market-wide viability measure.
- **Ticketmaster:** 90-day supply direction contributes only after a comparable complete snapshot
  exists. Current listing counts remain context and never become realized demand.

Directions use symmetric neutral bands: ±2 percentage points for participation, real demand, and
Ticketmaster supply; ±3 points for nominal gross/revenue and rolling release counts. Each source is
classified as improving, stable, pressured, mixed, or insufficient. Sector and cross-sector states
aggregate that categorical breadth rather than averaging unrelated raw percentages. A stale or
recently failed source retains its last valid calculation with a degraded marker; it is never
silently converted to neutral or zero.

### AI creative disruption

AI Disruption is a deterministic rolling seven-day story-cluster indicator compared with the
preceding seven days. It reuses the existing conservative Culture Intelligence clustering and
creative-AI evidence rules. Syndicated articles contribute one cluster, with only a capped 5% per
additional publisher corroboration adjustment (maximum 15%). Each cluster's internal thresholding
weight is:

`importance × confidence × disruption type × recency × capped corroboration`

Confidence factors are 1.0 / 0.75 / 0.5 for high / medium / low. Labour displacement and union
disputes use a 1.5 disruption multiplier; copyright, licensing, rights, and policy use 1.25;
adoption and creator tools use 0.75; other qualifying creative-AI change uses 1.0. Recency declines
by 5% per day within the seven-day window, bounded at 0.7. Internal thresholds are `<4 LOW`,
`<10 MODERATE`, `<24 ELEVATED`, otherwise `HIGH`. A movement greater than ±20% against the prior
window is increasing/easing; smaller movement is stable. These thresholds organize evidence and
are not a scientifically calibrated economic score.

Human sector, event, legacy AI-impact, and importance corrections take precedence for this
existing AI analytical routing only. Signal direction is separate presentation and synthesis
context and does not determine AI eligibility or disruption weight. Machine classifications remain unchanged. Articles marked
`NOT_RELEVANT_TO_CULTURAL_INTELLIGENCE` are excluded before clustering. Conflicting corrections are
handled conservatively by the existing story-cluster layer. Media freshness is shown separately,
and a thin preceding-window AI corpus is labelled as a limited baseline.

### Middle-tier and future composite scope

Middle-Tier Health remains pending. Current data can describe events per Ticketmaster venue, BFI
title concentration, and IGDB publisher/developer release shares, but it cannot establish venue or
company scale, ownership/independence, or revenue/income distribution. Activation requires those
fields, comparable longitudinal distributions, and coverage across at least two sectors. The
Overview therefore says `Methodology defined · distribution data required` rather than inferring a
middle tier from event counts or release attribution.

The Culture Stress Index also remains pending. A future composite may consume Consumer Demand,
Industry Viability, Middle-Tier Health, Gaming activity, and AI Disruption only after each component
has adequate coverage and validation. No weights are assigned in this phase, and no weights should
be backsolved to produce a desired narrative.

## Current limitations

- ABS, ONS, BEA, FRED, Statistics Canada, Census AIES, GDELT, Ticketmaster, IGDB, Steam, TheNewsAPI, curated
  RSS, the provisional US box-office dataset, BFI, Music Venue Trust, Live Performance Australia,
  and provisional Broadway Business data are active sources;
  Eurostat remains enabled as the EU Structural Benchmark; every other provider remains
  unimplemented and disabled
- The central scheduler coordinates bounded refreshes, while provider adapters retain their own
  source-specific retry behavior; it remains optimized for local/private deployment
- No computed Culture Stress Index
- No authentication or user accounts
- No deployment configuration
- Persisted metrics include six from ABS, four from ONS, eight from BEA, four
  each from Eurostat and Statistics Canada
  plus seven FRED metrics; GDELT records remain article candidates, Ticketmaster records are
  structured forward event-supply observations, IGDB records are tracked releases, and Steam rows
  are point-in-time snapshots rather than reconstructed history
- `DataSource.countryCode` and `DataSource.sectorSlug` hold only unambiguous single-value metadata.
  The static catalogue remains authoritative for multi-country and multi-sector coverage during the
  MVP; join tables can be introduced later if database queries require them.

Consumer Demand uses indexed persisted observations. Industry Viability is an unscored categorical
breadth view, AI Disruption is a deterministic story-cluster evidence indicator, and Gaming reports
release activity rather than financial health. Culture Stress and Middle-Tier Health remain explicit
pending states; they do not contain fabricated data.

## Planned ingestion phases

1. Expand comparable consumer-spending series across the six markets.
2. Add source-specific scheduling and operational monitoring.
3. Accumulate recurring gaming and live-event snapshots.
4. Add news-derived industry events with provenance and confidence review.
5. Define and validate composite indicators only after source coverage is sufficient.

The recommended next task is scheduling recurring Steam and Ticketmaster snapshots with retention
and capture-completeness monitoring. No additional provider should be added until those
longitudinal evidence-quality foundations are established.

## Music sector data

The Music page keeps five analytically distinct concepts separate:

- **Recorded-music consumer demand:** BEA detailed PCE provides official monthly
  current-dollar and chained-dollar household spending for audio streaming and
  radio services (including satellite radio), plus audio discs, tapes, vinyl,
  and permanent digital downloads. These are consumer-spending measures rather
  than music-industry revenue. RIAA remains unimplemented.
- **Record-industry business activity:** Census AIES provides annual employer-
  firm revenue, payroll, March 12 employment, and operating expenses for NAICS
  `512250`, `Record production and distribution`. These business statistics do
  not reconcile directly to BEA household PCE.
- **Long-run national-accounting structure:** BEA ACPSA provides historical
  Sound Recording output, value added, employment, and employee compensation
  for 1998–2023. It is a structural benchmark, not a current live-market feed.
- **Live-event supply:** the existing Ticketmaster `Music` segment supplies
  persisted 30-day and 90-day forward-event, active-venue, calendar-density,
  status, and longitudinal snapshot measures for AU, US, GB, and CA. No second
  Ticketmaster ingestion path exists.
- **Grassroots viability:** Music Venue Trust annual reports provide official UK
  Grassroots Music Venue structural statistics. These do not represent all UK
  live music, arena/stadium touring, or global live music.

### Music Venue Trust

Access classification: `OFFICIAL_DOWNLOAD`. The tracker uses a small versioned
mapping of statistical fields published in official MVT annual-report PDFs:

- 2023: `https://www.musicvenuetrust.com/wp-content/uploads/2024/01/MVT_2023-Annual-Report_Digital.pdf`
- 2024: `https://www.musicvenuetrust.com/wp-content/uploads/2025/01/MVT_2024-Annual-Report.pdf`
- 2025: `https://www.musicvenuetrust.com/wp-content/uploads/2026/01/MVT_2025-Annual-Report_Digital-Spreads.pdf`

Only numeric/statistical fields are persisted; report text is not stored. The
versioned mapping is preferred over fragile PDF visual extraction. Each value
retains its official report and release URL. The current MVT edge protection
returns HTTP 401 to bounded automated HEAD requests, so the tracker does not
bypass that control. `mvt:inspect` reports live reachability and the registered
fields, while `ingest:mvt` upserts the reviewed mappings without fetching or
scraping report content.

```bash
npm run mvt:inspect
npm run ingest:mvt
npm run ingest:mvt -- --year=2025
```

Available annual fields vary and remain nullable: trading venue count,
permanent closures, venues no longer operating as GMVs, venues reporting a
loss/no profit, average profit margin, event and ticketed-event counts,
audience visits, sector revenue, live-music income, employment, jobs lost, and
towns without regular touring. Source gaps are preserved.

The 2023 and 2024 reports describe the percentage of venues reporting a loss;
the 2025 report describes venues reporting no profit. The application retains
that definition change and withholds a direct percentage-point comparison.
Likewise, the 2023 release headline and detailed membership-review closure
figures are preserved as distinct concepts rather than silently merged.

### Census AIES record production and distribution

The tracker uses official, no-key Census downloadable files rather than
scraping `data.census.gov` HTML or adding a Census API credential:

- `https://www2.census.gov/programs-surveys/aies/data/2023/AIES00BASIC.zip`
  supplies national employer-firm revenue, annual payroll, and March 12
  employment.
- `https://www2.census.gov/programs-surveys/aies/data/2023/AIES00EXP01.zip`
  supplies operating expenses for the same national industry row.

Both ZIPs contain official pipe-delimited tables. Monetary source values are in
USD thousands and are normalized to whole USD without changing their nominal
basis. The importer requires the exact United States, all-establishments row for
NAICS `512250` and its exact label, `Record production and distribution`.
Disclosure/status flags and coefficients of variation are retained. A
suppressed or unavailable value is stored as `null`, never zero.

Inspect and ingest with:

```bash
npm run census:music:inspect
npm run ingest:census:music
```

The 2023 AIES release is currently the only comparable annual AIES observation
in the public employer tables. AIES replaced the Service Annual Survey and six
other annual programs beginning with reference year 2023. The tracker does not
silently stitch predecessor SAS observations into AIES: survey integration,
linking, and operating-expense scope changes require a separate comparability
study. Until another comparable AIES year exists, the UI reports insufficient
history rather than fabricating YoY growth.

### BEA ACPSA Sound Recording history

The historical Music section uses BEA's official national Arts and Cultural
Production Satellite Account archive:

`https://apps.bea.gov/regional/zip/acpsanational.zip`

The ZIP contains 26 annual XLSX workbooks, `ACPSA_1998.xlsx` through
`ACPSA_2023.xlsx`. The importer discovers and validates these exact source
fields for the exact `Sound Recording` row:

- `Table2_Industry_Output_VA`: `ACPSA Output` and `ACPSA Value Added`, published
  in millions of current dollars.
- `Table4_Employment`: `ACPSA employment (thousands of employees)` and `ACPSA
compensation (millions of dollars)`.

Monetary values are normalized to whole nominal USD and employment to employee
counts. The tracker deliberately uses the ACPSA contribution columns rather
than the workbook's broader total-industry columns. Separate real value-added
and real commodity-output workbooks are not mixed into this nominal industry
series. Supply and consumption are also omitted because the source table is a
commodity account rather than the same industry concept.

Inspect and ingest the complete official archive with:

```bash
npm run bea:acpsa:music:inspect
npm run ingest:bea:acpsa:music
```

This subresource reuses the existing BEA provider identity. It is labelled
`Historical / structural`, with latest official observation `2023`. BEA states
that it will no longer regularly produce these statistics, so the terminal year
is not treated as a failed or stale live feed. The importer never extrapolates
post-2023 values and uses a deterministic `source + year` identity for
revision-safe idempotency.

ACPSA output is a national-accounting production concept, not Census AIES
business revenue. ACPSA value added is not output. ACPSA employment is not live
event supply, and ACPSA measures do not replace BEA household PCE. The long-run
chart presents nominal dollar levels plus descriptive 1998-indexed output and
employment; output/labor divergence is not attributed to AI, labor practices,
or industry health.

### Music methodology caveats

- MVT annual survey membership and definitions can change; YoY calculations
  require comparable adjacent fields.
- Ticketmaster coverage is not the complete live-music market, and events aging
  out of a forward window are not cancellations.
- Current Ticketmaster status counts differ from observed status transitions;
  `offsale` is not treated as cancellation.
- BEA recorded-music PCE is household spending, not creator income, royalties,
  label revenue, or venue profitability.
- Census AIES NAICS `512250` measures activity of classified employer
  businesses, not household consumption or an RIAA-equivalent retail market.
- BEA ACPSA is a discontinued historical national-accounting benchmark; its
  output and value-added concepts are not interchangeable with Census revenue.
- Establishment counts are not included because the selected official 2023
  AIES employer ZIPs do not publish that field for this row.
- Nominal sector revenue is affected by prices and activity mix.
- Monthly BEA household demand, annual Census business activity, historical BEA
  ACPSA structure, annual MVT viability, and current Ticketmaster supply data
  are never combined into a Music Health or Crisis score.

## Sector presentation methodology

Music, Film, Theatre, and Gaming share calendar-aware chart axes while retaining
their source-specific frequencies. Weekly one-year views use month/year ticks;
longer weekly views use annual ticks. Monthly one-year views use monthly ticks,
quarterly charts use annual axis labels with exact quarters in tooltips, and
annual charts use integer years only. Tick spacing follows real UTC dates rather
than observation indexes. Missing observations are not interpolated and future
periods are excluded from historical axes.

`2019` is the default current-market reference for indexed views. Music's BEA
indexed comparison therefore opens at `Since 2019`, while the ACPSA chart opens
at `2019 = 100` and retains the longer `1998 = 100` structural view. Nominal and
official real BEA Music growth rates are paired by consumption category; their
difference is labelled a nominal-real YoY growth divergence, not an inflation
estimate or a subtraction of current-dollar and chained-dollar levels.

Sparse datasets receive proportionate visual weight. Census AIES currently has
one comparable year and uses one section-level history note. The three annual
MVT observations use a compact chart. Ticketmaster transition panels collapse
to one `Collecting longitudinal history` state until comparable snapshots
exist; current source statuses remain visible and `offsale` remains distinct
from cancellation.

Gaming release-history charts include completed historical periods only. The
current partial month or quarter and future releases remain in the separate
30D/90D/180D upcoming-supply panel, so source completeness at longer horizons
cannot appear as a historical collapse. Quarterly counts use discrete bars.
Steam panels are explicitly sample statistics: concurrent-player sums,
concentration, reviews, and pricing describe only titles with captured Steam
observations, not the Steam market as a whole.

Sector media uses two deterministic presentation tiers without deleting or
reclassifying articles. `Industry Signals` contains articles with importance of
at least 2, medium/high confidence, a meaningful event/theme classification, or
an AI Intelligence classification, ordered by importance, confidence, and recency.
The remaining low-signal coverage appears in a denser `More from …` sector feed
ordered by publication time. Positive counter-signals remain eligible and no
sentiment or sector-health score is produced. Media and brief cards display the
general signal direction for every domain in place of the former AI-impact badge.

## Scheduler and freshness operations

The tracker uses one dedicated scheduler worker rather than starting timers in
Next.js. Application pages and API routes only read persisted state, so hot
reloads, page renders, and server requests cannot create duplicate scheduler
loops. This process model is intended for local/private deployment and can
later be moved unchanged behind OS cron, a dedicated container, cloud cron, or
a queue worker.

Development uses two terminals:

```bash
# Terminal 1
npm run dev

# Terminal 2 (.env must set SCHEDULER_ENABLED=true)
npm run scheduler
```

Operational commands:

```bash
# DB-backed cadence audit; makes no provider requests
npm run scheduler:inspect

# Execute each currently due automatic source once, then exit
npm run scheduler:once

# Explicitly execute one eligible automatic source
npm run scheduler:once -- --source=rss
```

The continuously polling worker is disabled by default. Configuration is kept
small: `SCHEDULER_ENABLED=false`, `SCHEDULER_CONCURRENCY=1`,
`SCHEDULER_POLL_MINUTES=5`, `MEDIA_REFRESH_HOURS=3`,
`TICKETMASTER_REFRESH_HOURS=24`, `GAMING_REFRESH_HOURS=24`, and
`LLM_RESEARCHER_ENABLED=false`. Concurrency is hard-limited to 1–2 jobs. Ticketmaster always runs
alone; RSS and TheNewsAPI are serialized. The research agent uses the same durable source lock and
runs only one internal task at a time. All timestamps and cadence arithmetic use UTC.

### Scheduling inventory

| Source                    | Class / cadence     | Routine action and request profile                                                             |
| ------------------------- | ------------------- | ---------------------------------------------------------------------------------------------- |
| ABS                       | Daily / 24h         | Recent monthly HSI plus eight completed real quarters; low volume                              |
| BEA                       | Daily / 24h         | Recent macro and detailed Music PCE; ACPSA archive explicitly excluded                         |
| FRED                      | Daily / 24h         | Four series over the latest twelve months; low volume                                          |
| ONS                       | Daily / 24h         | Latest eight official quarters; low volume                                                     |
| Eurostat                  | Structural/static   | No automatic run; manual structural refresh only                                               |
| Statistics Canada         | Daily / 24h         | Latest eight validated quarters; six low-volume vector requests                                |
| GDELT                     | Blocked             | No automatic retry while DOC 2.0 remains upstream HTTP 429 blocked                             |
| Ticketmaster              | Daily / 24h         | Seven-day forward snapshot only; 12 base country/segment partitions plus density pagination    |
| IGDB                      | Daily / 24h         | Trailing 90 days through upcoming 180 days; roughly nine monthly partitions plus pagination    |
| Steam                     | Daily / 24h         | Stable 100-title sample; up to three Valve requests per title, no catalog enumeration          |
| TheNewsAPI                | High frequency / 3h | Ten targeted requests per run, maximum 80/day under default cadence                            |
| Curated RSS               | High frequency / 3h | Enabled feeds sequentially, using a 24-hour entry window                                       |
| Copyright Office NewsNet  | Daily / 24h         | One official feed request, trailing 72 hours, maximum 50 accepted items                        |
| CFPB Newsroom             | Release-aware / 12h | One official feed request, trailing 72 hours, maximum 50 accepted items                        |
| FTC Competition           | Release-aware / 12h | One official feed request, trailing 72 hours, maximum 50 accepted items                        |
| FTC Consumer Protection   | Release-aware / 12h | One official feed request, trailing 72 hours, maximum 50 accepted items                        |
| NIST IT                   | Daily / 24h         | One official feed request, trailing 72 hours, maximum 50 accepted items                        |
| UK DSIT                   | Release-aware / 12h | One official Atom request, trailing 72 hours, maximum 50 accepted items                        |
| UK IPO                    | Release-aware / 12h | One official Atom request, trailing 72 hours, maximum 50 accepted items                        |
| UK CMA                    | Release-aware / 12h | One official Atom request, trailing 72 hours, maximum 50 accepted items                        |
| EU DG CONNECT             | Release-aware / 12h | One official feed request, trailing 72 hours, maximum 50 accepted items                        |
| Specialist feeds (12h)    | Release-aware / 12h | Tech Policy Press uses 72h/20-item bounds; Lawfare, Kluwer, and Blood in the Machine use 7d/30 |
| Specialist feeds (daily)  | Daily / 24h         | CSET, AI Now, Normal Technology, ChinAI, Authors Alliance, and Creative Commons use 7d/30      |
| US provisional box office | Daily / 24h         | Current calendar-year dataset rows only                                                        |
| BFI                       | Daily / 24h         | Current-year weekly reports and published structural tables                                    |
| Screen Australia          | Weekly / 7d         | One current public-widget HTML request; no archive, secondary request, or backfill             |
| Broadway Business         | Daily / 24h         | Recent 91-day structured query; no historical backfill                                         |
| LPA                       | Monthly / 30d       | Latest two report years from the official bundle                                               |
| MVT                       | Monthly / 30d       | Re-applies reviewed official-report mappings; it cannot discover an unregistered future report |
| Census AIES               | Monthly / 30d       | Two official configured-vintage ZIP files                                                      |
| DeepSeek Research Agent   | Release-aware / 12h | Shadow-only check; one 24h task, max one/cycle and two completed executions/rolling 24h        |
| Stats NZ                  | Disabled            | Not implemented; no scheduled action                                                           |
| Eventbrite                | Disabled            | Not implemented; no scheduled action                                                           |
| Mediastack                | Disabled            | Not implemented; no scheduled action                                                           |

All scheduled commands use ordinary bounded refresh modes. No scheduler policy
contains `--backfill`, a multi-year `--since` range, or an archive population.
BEA ACPSA remains a historical 1998–2023 benchmark and is never included in the
daily BEA job. Existing provider CLIs remain available for explicit backfills.

### Locking, failures, and restart behavior

`SchedulerSourceState` stores one durable row per provider. A database
compare-and-set lock records an active run UUID, acquisition time, and expiry.
An active lock prevents overlap; an expired lock can be recovered after a crash.
Successful or failed completion releases the lock. Scheduler state also retains
last attempt/success/failure, next scheduled time, last created/updated counts,
sanitized failure text, and consecutive failures. A later success resets the
failure count.

Provider adapters retain their own timeout/retry/backoff behavior. The scheduler
does not create retry storms: a failed run waits for the next cadence, 429s are
not repeatedly retried at scheduler level, and one failed source does not stop
other due sources. Child command output is not replayed into scheduler logs;
logs contain only source, lifecycle timestamps, duration, created/updated
counts, status, and sanitized failure state.

On restart, persisted `nextScheduledAt` is reused. Where scheduler state does
not yet exist, the worker derives the next run from the existing source's last
successful ingestion. A never-run source receives a deterministic 15–59 minute
initial delay instead of joining a startup refresh storm. Structural, blocked,
manual, disabled, unimplemented, or unconfigured sources never auto-run.

### Freshness states

- `CURRENT`: successful refresh is comfortably inside its cadence.
- `DUE_SOON`: at least 75% of the cadence has elapsed.
- `STALE`: the cadence has elapsed; the source is due.
- `OVERDUE`: at least two cadences have elapsed.
- `RUNNING`: a non-expired database lock is active.
- `FAILED_RECENTLY`: the latest scheduled attempt failed after the latest success.
- `BLOCKED`: external conditions intentionally exclude automatic execution.
- `MANUAL`: ingestion requires explicit operator action.
- `STRUCTURAL`: a historical benchmark is not expected to refresh routinely.
- `DISABLED`: disabled, unimplemented, or unconfigured.

Refresh freshness and observation freshness are deliberately separate. A source
can refresh successfully today while its latest valid published period remains
June 2026. Data Sources displays both, and annual or discontinued sources are
not falsely marked overdue because their observation period is old.

The paired DeepSeek/GLM shadow checker is enabled locally after fixed v3 protocol and
historical acceptance tests. GLM selects explicit evidence passages; deterministic code
checks fields. This is provided-text checking, **not independent source verification**.
See the [paired pipeline record](docs/deepseek-researcher.md#2026-09-11-paired-shadow-researcher-and-checker--v3-enabled).
`npm run research:verifier-status` reports readiness and budget gates without model calls.
`npm run research:developments` provides a read-only projection for the later redesign;
no research output has been added to the UI.
