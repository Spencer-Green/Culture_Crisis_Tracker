# Culture Crisis Tracker

Culture Crisis Tracker is a foundation for monitoring the economic health of cultural and
entertainment sectors across Australia, the United States, the United Kingdom, Canada, New
Zealand, and the European Union.

The product is intended to distinguish between broad demand weakness, a shrinking industry
middle tier, normal cyclical conditions, and increasing concentration around superstar artists,
franchises, and platforms. Active current integrations ingest Australian, UK, and US
household-demand data from ABS, ONS, BEA, and Statistics Canada, plus US consumer-credit and
credit-card stress data from FRED. Eurostat annual EU data is retained separately as a structural
benchmark.

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
database state. ABS, ONS, BEA, FRED, Eurostat, and Statistics Canada are implemented. Eurostat is
classified as a structural benchmark rather than an active current source. All other adapters remain inert
placeholders whose metric discovery and observation methods throw a clear `NotImplementedError`.

## Source states

Source status uses four independent concepts:

- **Implemented** means a functioning adapter exists. ABS, ONS, BEA, FRED, Eurostat, and Statistics
  Canada are implemented.
- **Configured** means the required base URL is valid and all declared credentials are present.
  It does not verify credentials against a provider.
- **Enabled** is mutable database state that explicitly permits ingestion. New ABS, ONS, BEA,
  FRED, Eurostat, and Statistics Canada records use enabled defaults; routine seed reruns preserve
  existing manual enablement and sync timestamps.
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

The real comparison uses ONS recreation and culture CVM, BEA real recreation services in chained
2017 dollars SAAR, and Statistics Canada recreation and culture at 2017 constant prices. The
current ABS integration has no comparable real recreation and culture metric, so Australia is
shown as unavailable rather than estimated. Nominal and real series remain separate.

Native frequencies are preserved. Australia and the United States remain monthly, the United
Kingdom and Canada remain quarterly. The chart places published observations on a shared time axis.
It does not interpolate, forward-fill, resample, or manufacture quarterly values for intervening
periods. Tooltips retain the native period, frequency, source value, source unit, price basis, and
SAAR status.

BEA monthly PCE values are seasonally adjusted annual rates. SAAR is the annualized spending pace
implied by a month, not the amount spent during that month; values are not divided by twelve for
display. Headline values therefore include `annualized` and retain current-dollar or chained-2017
dollar labels.

Source values published in millions use compact presentation when the resulting number is easier to
read: USD uses `$`, AUD uses `A$`, GBP uses `£`, CAD uses `C$`, and EUR uses `€`; million, billion, and trillion
suffixes use sensible magnitude-based precision. Persisted values and source units remain unchanged
and visible in supporting information and chart tooltips.

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

- ABS, ONS, BEA, FRED, and Statistics Canada are active current sources; Eurostat remains enabled
  as the EU Structural Benchmark; every other provider remains unimplemented and disabled
- No scheduled jobs or general retry framework; ONS has only a bounded 429 retry
- No computed Culture Stress Index
- No authentication or user accounts
- No deployment configuration
- Persisted metrics include four each from ABS, ONS, BEA, Eurostat, and Statistics Canada plus seven
  FRED metrics; no industry events are ingested
- `DataSource.countryCode` and `DataSource.sectorSlug` hold only unambiguous single-value metadata.
  The static catalogue remains authoritative for multi-country and multi-sector coverage during the
  MVP; join tables can be introduced later if database queries require them.

Consumer Demand now uses indexed persisted observations. Other Overview charts and composite
indicators remain explicit empty states; they do not contain fabricated data.

## Planned ingestion phases

1. Expand comparable consumer-spending series across the six markets.
2. Add source-specific scheduling and operational monitoring.
3. Add entertainment event and gaming sources.
4. Add news-derived industry events with provenance and confidence review.
5. Define and validate composite indicators only after source coverage is sufficient.

The recommended next task is validating a small, explicitly selected set of Statistics Canada
cultural-detail vectors—starting with cinemas and other cultural services—without adding another
provider.
