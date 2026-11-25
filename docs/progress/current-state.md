# Current state

**Updated:** 2026-11-25 (Africa/Lagos)

## Repository and roadmap

- Repository: `/Users/newuser/Documents/GitHub/inventory`; branch `develop`; session began at `5ab2723` (prior QA harness commit). No task newly completed; completed count remains **30/47**.
- SALES-004 and REPORT-002 remain IN_PROGRESS. QUALITY-001 is IN_PROGRESS for fixture harness implementation only; its named operational workflow remains NOT RUN and dependency-gated.
- No database reset/deletion, migration application, credential change, commit, push, or deployment occurred.

## QA fixture hardening delivered

- Existing commands remain: `npm run qa:seed`, `npm run qa:resume`, `npm run qa:verify`, `npm run qa:test`. `QA_SCENARIO=baseline` is the only implemented selector; unsupported scenario names fail closed before connecting.
- Before authentication, the runner connects read-only to `DATABASE_URL`, checks the exact QA organization and active OWNER membership, and compares the live database/schema/server fingerprint with `/api/v1/health/ready`. The fingerprint is included only outside production and contains no credentials.
- Resource recovery for PO, sales order and transfer uses recorded IDs and exact supplier/customer, warehouse, currency, product, unit, quantity, price/cost and run-marker attributes. It pages all matches and stops on ambiguity/mismatch. Fixed transfer recovery to compare the API's `requestedQuantity` field.
- Quantity and money comparison uses scaled `BigInt`, including negative stock deltas. Per-run lock blocks concurrent seed/resume and recovers stale lock only when its PID no longer exists. Schema-v1 manifests are shape-validated, atomically written with 0600 file/0700 directory permissions, secret-key screened and backward compatible.
- Baseline payment fixture now records NGN 100,000 plus NGN 60,000, reverses NGN 60,000 and replaces it. Verifier checks NGN 220,000 gross, NGN 60,000 reversed, NGN 160,000 effective, NGN 100,000 fulfillment cost, reservation consumption, receipt/pick/fulfillment counts, movement quantities, warehouse balances, WAC value, customer totals, reports and ledger reconciliation.
- More extensive document-state, multi-currency, authorization-account and financial-export fixture scenarios remain unimplemented. The baseline generator was not authenticated or seeded in this session.

## Environment verification

- `docker compose ps`: PostgreSQL, Redis and S3Mock healthy. `pg_isready` accepted connections.
- Read-only direct PostgreSQL query reached `inventory_dev.public`. `npx prisma migrate status --config prisma.config.ts`: **22 migrations, schema up to date**.
- API started with `NODE_ENV=development`; readiness returned **HTTP 200**, and the API fingerprint matched the direct CLI database identity. The API process was stopped after verification to run builds.
- Existing Next dev server holds the `apps/web` development lock on port 3000. A read-only request identified its page title as Stockroom; it was left untouched. Port 3002 returned no connection and a second `next dev` could not start because of the existing lock. No browser workflow was run.
- Required configuration presence was checked without printing values. `DATABASE_URL` is set. Missing variables: `NODE_ENV`, `QA_ENVIRONMENT`, `QA_API_BASE_URL`, `QA_ORGANIZATION_ID`, `QA_ORGANIZATION_NAME`, `QA_EMAIL`, `QA_PASSWORD`.
- QA seed cannot be executed until those settings are supplied. No QA manifest or business record was created.

## Checks completed

- `npm run qa:test`: **11 passed, 0 failed, 0 skipped**.
- `npm test`: **60 API/shared passed, 0 failed, 3 opt-in PostgreSQL suites skipped; web 2 passed, 0 failed**.
- Opt-in PostgreSQL suites run individually: auth/organization **10/10**, inventory/procurement/sales/transfers **13/13**, SALES-004/reporting **3/3**. Total **26/26**, no skips/failures.
- `npm run typecheck`, `npm run lint`, `npm run format:check`, API production build, isolated Next Webpack production build (29 routes), `npm run db:validate --workspace=@inventory/api`, read-only migration status, and `git diff --check` passed.
- The ordinary workspace production build was not run because a live Next development process owns `apps/web/.next`; instead the production web build ran from a disposable copy under `apps/`, leaving the running dev server's output untouched.
- No fixture end-to-end run, browser invoice/payment acceptance, CSV download capture or performance EXPLAIN was executed. No successful UI acceptance is inferred from builds/tests.

## Exact next steps

1. In the ignored `.env`, set `NODE_ENV=development`, `QA_ENVIRONMENT=development`, `QA_API_BASE_URL=http://localhost:4000/api/v1`, the existing local `DATABASE_URL`, approved `QA_ORGANIZATION_ID`, `QA_ORGANIZATION_NAME=Quality 001 QA Workspace`, and existing active OWNER `QA_EMAIL`/`QA_PASSWORD`. Do not share password values in chat.
2. Start API with `NODE_ENV=development npm run dev:api`; verify `/api/v1/health/ready` returns HTTP 200 with a database fingerprint matching `DATABASE_URL`. Start the frontend on port 3002 only after resolving the existing Next dev lock without stopping unrelated processes.
3. Run `npm run qa:test`; then `QA_SCENARIO=baseline npm run qa:seed`. Save the run ID. Exercise `QA_RUN_ID=<id> npm run qa:resume` and `QA_RUN_ID=<id> npm run qa:verify`; compare resource counts and financial/stock invariants.
4. Implement and test document-state, multi-currency, separate-session authorization, and four-type export fixture scenarios. Capture actual browser download/PDF evidence and populate `EXPLAIN (ANALYZE, BUFFERS)` results on a sufficiently populated disposable schema.
5. Complete SALES-004 and REPORT-002 mandatory acceptance. Only then execute and record the named QUALITY-001 workflow. Keep count **30/47** until individual task criteria pass; do not begin QUALITY-002 as a replacement for these dependency-gated tasks.
