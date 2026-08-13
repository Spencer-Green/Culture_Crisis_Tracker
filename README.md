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
`STEAM_WEB_API_KEY`. All three values remain server-only.
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

- ABS, ONS, BEA, FRED, Statistics Canada, GDELT, Ticketmaster, IGDB, and Steam are active sources;
  Eurostat remains enabled as the EU Structural Benchmark; every other provider remains
  unimplemented and disabled
- No scheduled jobs or general retry framework; ONS, GDELT, Ticketmaster, IGDB, and Steam use
  source-specific bounded retries
- No computed Culture Stress Index
- No authentication or user accounts
- No deployment configuration
- Persisted metrics include six from ABS, four each from ONS, BEA, Eurostat, and Statistics Canada
  plus seven FRED metrics; GDELT records remain article candidates, Ticketmaster records are
  structured forward event-supply observations, IGDB records are tracked releases, and Steam rows
  are point-in-time snapshots rather than reconstructed history
- `DataSource.countryCode` and `DataSource.sectorSlug` hold only unambiguous single-value metadata.
  The static catalogue remains authoritative for multi-country and multi-sector coverage during the
  MVP; join tables can be introduced later if database queries require them.

Consumer Demand uses indexed persisted observations. Industry Viability remains unscored while
GDELT collects candidate evidence and Ticketmaster accumulates forward supply snapshots. Other
composite indicators remain explicit empty states; they do not contain fabricated data.

## Planned ingestion phases

1. Expand comparable consumer-spending series across the six markets.
2. Add source-specific scheduling and operational monitoring.
3. Accumulate recurring gaming and live-event snapshots.
4. Add news-derived industry events with provenance and confidence review.
5. Define and validate composite indicators only after source coverage is sufficient.

The recommended next task is scheduling recurring Steam and Ticketmaster snapshots with retention
and capture-completeness monitoring. No additional provider should be added until those
longitudinal evidence-quality foundations are established.
