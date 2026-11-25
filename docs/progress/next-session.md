# Next session checkpoint

**Updated:** 2026-11-25 (Africa/Lagos)

## Resume facts

- Repository `/Users/newuser/Documents/GitHub/inventory`, branch `develop`. Session began at `5ab2723`; preserve current uncommitted implementation. Completed roadmap count remains **30/47**.
- Changed/new paths: `apps/api/src/health/{health.controller.ts,database-identity.ts}`, `apps/api/test/api-contract.test.mjs`, `packages/shared/src/index.ts`, `scripts/qa/{database-target.mjs,manifest.mjs,workflow.mjs,workflow.test.mjs}`, `docs/architecture/purchase-sales-reporting.md`, `docs/operations/{qa-fixture-guide.md,quality-001-acceptance.md}`, `docs/implementation/{master-plan.md,task-breakdown.md}`, `docs/progress/{blockers.md,completed-tasks.md,current-state.md,next-session.md,pending-tasks.md,session-log.md}`.
- No commit/push/deploy/migration/reset/deletion occurred. No QA fixture records or manifest were created.
- SALES-004 and REPORT-002 remain IN_PROGRESS; QUALITY-001 is IN_PROGRESS for harness code only, and its operational scenario is NOT RUN. No task newly completed.

## Implemented this session

- Read-only local QA target verification directly checks database/schema, exact organization, and active OWNER membership; compares the API's non-production readiness fingerprint to the CLI database connection before login or mutation.
- Baseline recovery now uses manifest IDs and exact scenario attributes, pages candidate documents and fails on ambiguity/mismatch. Corrected transfer line matching to `requestedQuantity`. Quantity reconciliation uses signed scaled `BigInt` rather than JS `Number`.
- Added atomic shape validation for schema-v1 manifests, 0600 manifest files/0700 directory, strict safe relative manifest directory, and per-run exclusive locking with safe stale-PID recovery.
- Baseline invoice lifecycle now expects NGN 100,000 + 60,000 gross, reverses the 60,000 payment, then replaces it. Verification now checks gross/reversed/effective amounts, 100,000 cost of goods, reservation consumption, movements and document counts in addition to balances/WAC/customer/report/ledger invariants.
- Added `QA_SCENARIO=baseline`; unsupported selectors fail closed. Other requested scenario datasets (document states, USD, restricted/second tenant and exports) remain to be implemented.

## Verification results

- `npm run qa:test`: **11 pass, 0 fail, 0 skipped**.
- `npm test`: **60 API/shared pass, 0 fail, 3 opt-in PG skipped; web 2 pass, 0 fail**.
- Opt-in PG suites individually passed: `postgres.integration.test.mjs` **10/10**; `inventory.postgres.integration.test.mjs` **13/13**; `sales-invoices.postgres.integration.test.mjs` **3/3**. Total **26/26**, no skips. They used temporary schemas; no dev data reset/deleted.
- `npm run typecheck`, `npm run lint`, `npm run format:check`, API build, isolated-copy Next Webpack production build (**29 routes**), Prisma validation, read-only migration status (**22/22 current**), and `git diff --check` passed.
- Docker Compose showed PostgreSQL, Redis and S3Mock healthy. API readiness returned HTTP 200; a live database identity fingerprint matched the CLI DB identity. API process was stopped after this verification. The existing Next dev process on port 3000 was left untouched; port 3002 was unavailable due the existing `apps/web` lock. No browser workflow was run.
- `.env` variable names missing: `NODE_ENV`, `QA_ENVIRONMENT`, `QA_API_BASE_URL`, `QA_ORGANIZATION_ID`, `QA_ORGANIZATION_NAME`, `QA_EMAIL`, `QA_PASSWORD`. `DATABASE_URL` is set. Do not print or share its credentials.
- `qa:seed` was not run because explicit QA mode/account/organization are missing; no login or mutation was attempted. No CSV download, browser PDF, multi-currency scenario, EXPLAIN plan, or QA acceptance completion is claimed.

## Exact next actions

1. Add the seven missing QA variable names in ignored `.env` with values for the approved existing QA organization and OWNER account. Never alter existing passwords or create unauthorized accounts.
2. Start API with `NODE_ENV=development npm run dev:api`; verify readiness is 200 and API/CLI database fingerprints match. Keep port 3000 untouched. Resolve Next dev lock before attempting port 3002.
3. Run `npm run qa:test`, then `QA_SCENARIO=baseline npm run qa:seed`; record the run ID. Run `QA_RUN_ID=<id> npm run qa:resume` and `QA_RUN_ID=<id> npm run qa:verify`; inspect whether the completed resume leaves record/movement/allocation counts unchanged.
4. Extend the fixture generator with documented supported scenarios for document states, NGN/USD reporting, separate authorization sessions, and four report exports. Add isolated integration and parser/reconciliation tests; do not claim scenarios before they execute.
5. Use a populated disposable DB schema for performance measurements. Complete authenticated SALES-004 browser/PDF/payment and REPORT-002 filter/security/browser-download acceptance. Then run `COMPLETE_INVENTORY_BUSINESS_LIFECYCLE` and update IDs/evidence.
6. Keep SALES-004, REPORT-002 and QUALITY-001 open and count at **30/47** until all required criteria pass. Do not push/deploy. No new commit was created in this session.
