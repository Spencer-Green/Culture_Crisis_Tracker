# Culture Crisis Tracker

Culture Crisis Tracker is a foundation for monitoring the economic health of cultural and
entertainment sectors across Australia, the United States, the United Kingdom, Canada, New
Zealand, and the European Union.

The product is intended to distinguish between broad demand weakness, a shrinking industry
middle tier, normal cyclical conditions, and increasing concentration around superstar artists,
franchises, and platforms. This initial version provides the application, database, and adapter
architecture only. It does not ingest live data.

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
database state. Individual adapters do not make external requests; metric discovery and observation
methods throw a clear `NotImplementedError`.

## Source states

Source status uses four independent concepts:

- **Implemented** means a functioning adapter exists. No source is implemented yet.
- **Configured** means the required base URL is valid and all declared credentials are present.
  It does not verify credentials against a provider.
- **Enabled** is mutable database state that explicitly permits ingestion. Every source is disabled.
- **Healthy** is runtime connectivity state. External APIs are not checked during the foundation
  phase, so every source reports `not-checked`.

ABS, ONS, Eurostat, Statistics Canada, and GDELT are intended as public/no-key sources. They can be
configured when their public base URL is present. Authenticated providers require both their base
URL and all declared credentials before becoming configured. Configuration never implies that a
source is implemented, enabled, or healthy.

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

- No live API or news ingestion
- No scheduled jobs, retries, or rate-limit handling
- No computed Culture Stress Index
- No authentication or user accounts
- No deployment configuration
- No real charts or charting dependency
- No observed metrics or industry events until ingestion is implemented
- `DataSource.countryCode` and `DataSource.sectorSlug` hold only unambiguous single-value metadata.
  The static catalogue remains authoritative for multi-country and multi-sector coverage during the
  MVP; join tables can be introduced later if database queries require them.

Dashboard charts and indicators are explicit empty states; they do not contain fabricated data.

## Planned ingestion phases

1. Implement one public macroeconomic adapter and persist a narrowly defined metric.
2. Add ingestion-run auditing, idempotency, pagination, and source-specific rate limiting.
3. Expand comparable consumer-spending series across the six markets.
4. Add entertainment event and gaming sources.
5. Add news-derived industry events with provenance and confidence review.
6. Define and validate composite indicators only after source coverage is sufficient.

The recommended first source is the Australian Bureau of Statistics (ABS): it is public,
credential-free, and provides a contained path for validating the adapter, normalisation, database,
and ingestion-run boundaries without secret-management complexity. External API integration begins
in that next development phase; this foundation does not contact any provider.
