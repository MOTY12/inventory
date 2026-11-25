# Current state

**Updated:** 2026-11-25 (Africa/Lagos)

## Repository and roadmap

- Repository: `/Users/newuser/Documents/GitHub/inventory`; branch `develop`; HEAD at session start `b97445d` (`update registrrry`). Worktree was clean at session start. Current changes are uncommitted QA scenario code and progress documentation.
- Roadmap remains **30/47**. SALES-004, REPORT-002 and QUALITY-001 remain IN_PROGRESS. No task became complete; fixture code and mocked verification do not meet operational acceptance.
- No commit, push, deployment, migration application, database reset, deletion, or credential change occurred.

## QA implementation in this session

- Fixed document-state recovery: purchase-order recovery scans bounded pages; exact quantity comparisons use scaled BigInt; manifest IDs are checked against expected fixture identity; ambiguous candidates fail closed. Verification requires exact result counts/labels, unique resource IDs, organization/warehouse/product relationships, expected statuses and exact quantities.
- Picking and fulfillment are reconciled independently from reloaded order state. A regression simulates interruption after the pick has posted but before fulfillment; resume completes fulfillment without a duplicate pick.
- Added nine invoice states through the existing invoice/payment API paths: draft, unpaid, partial, paid, reversed payment, overdue, overdue partial, no due date and eligible void. Expected NGN 80,000 totals/payment balances use BigInt-scaled exact arithmetic and reversal allocations.
- Added `multi-currency`: separate NGN/USD purchase, receipt, sale, fulfillment, invoice and payment flows. Verifier checks currency-specific summary/detail/aging/valuation reports; no conversion is applied.
- Added `financial-exports`: queues the four supported detail CSV types for NGN and USD, polls bounded export pages, downloads via the authenticated API, parses quoted CSV and reconciles each row to the filtered report API page.
- Added an `authorization` scenario path for configured finance, sales, warehouse-clerk and foreign-organization identities. It probes financial-report access, granted/ungranted warehouse scope, branch-filter scope, financial export denial, foreign product denial and foreign-user organization selection denial. It records only status evidence. Membership/grant revocation and actual identity execution remain unverified; the scenario requires disposable approved identities and IDs through `QA_AUTH_*` variables.
- Registry rejects inherited property names. Schema-v2 manifests support scenario resources; v1 baseline manifests remain accepted.

Changed source files: `scripts/qa/manifest.mjs`, `scripts/qa/workflow.mjs`, `scripts/qa/workflow.test.mjs`, `scripts/qa/scenarios/registry.mjs`, `scripts/qa/scenarios/document-states.mjs`, new `scripts/qa/scenarios/invoice-states.mjs`, new `scripts/qa/scenarios/multi-currency.mjs`, new `scripts/qa/scenarios/financial-exports.mjs`, and new `scripts/qa/scenarios/authorization.mjs`. QA guide, acceptance record, architecture reporting note, master plan, task ledger and progress files are also updated.

## Environment and verification

- Docker Compose reports PostgreSQL, Redis and S3Mock healthy. The API dev server is currently running and `/api/v1/health/ready` returned **HTTP 200** with a development database fingerprint. Existing Next at port **3000** returned HTTP 200 for `/login`; a second dev-server attempt exited because the existing process owns the Next development lock on port 3000. The existing server was left untouched.
- `DATABASE_URL` is set. `NODE_ENV`, `QA_ENVIRONMENT`, `QA_API_BASE_URL`, `QA_ORGANIZATION_ID`, `QA_ORGANIZATION_NAME`, `QA_EMAIL`, and `QA_PASSWORD`, and `QA_AUTH_*` actor/fixture values remain missing; presence-only check printed no secret values. No authenticated QA scenario was seeded.
- Final `npm run qa:test`: **18 passed, 0 failed**. It covers scenario selection, pathological registry names, PO/SO interruption recovery, invoice amount/reversal reconciliation, NGN/USD report-shape reconciliation, authorization-evidence completeness and CSV parser behavior. Scenario tests use API fakes; they are not live operational evidence.
- `npm test` passed **60 API/shared, 2 web; 0 failures**, with **3 opt-in PostgreSQL suites skipped** in the default command. The three PostgreSQL suites were separately executed against isolated/randomized schemas and passed **10/10**, **13/13**, and **3/3** (26 total, no skips). The inventory suite took about 64 seconds. These are existing business integration suites, not executions of the new QA scenarios.
- Final `npm run lint`, `npm run typecheck`, `npm run format:check`, `npm run build`, `npm run db:validate --workspace=@inventory/api`, and `git diff --check` passed. An unprivileged default `npm test` first failed because its HTTP contract test could not bind localhost (`EPERM`); the local-permission rerun passed. Production build generated 29 routes. Generated `apps/web/tsconfig.tsbuildinfo` and `apps/web/next-env.d.ts` changes were restored to their clean-at-start contents.
- Read-only `npx prisma migrate status --config prisma.config.ts` returned 22 migrations found and schema up to date. No migration was needed or applied.

## Blockers and acceptance gaps

- QA account and organization configuration is missing; do not invent users or modify credentials. API and web processes are running, but cross-tenant, warehouse-role and finance-role checks cannot be run without configured identities and foreign-tenant fixture data.
- Authorization scenario code is implemented but has not been executed; membership/grant revocation, export download revocation and actual multi-user identity coverage remain unverified. Cross-currency payment-allocation denial is untested; payment currency is inherited from the invoice and the API does not accept a payment currency field.
- New invoice, multi-currency and financial-export fixtures have no real authenticated API/PostgreSQL execution. CSV rows are only verified by mocked API-level tests. Browser invoice/PDF and export file capture, report filters, performance EXPLAIN, and SALES-004/REPORT-002 acceptance remain open.

## Exact next steps

1. Inspect `git status` and all diffs; preserve the uncommitted work. Do not commit or push.
2. Do not run QA mutations until approved QA OWNER/org values are available in ignored `.env`; do not print values or change credentials.
3. Complete isolated authorization integration coverage for membership/grant revocation and export download scope, then provide approved disposable QA actor values (`QA_AUTH_*`) without changing existing credentials.
4. With valid settings, run `QA_SCENARIO=document-states npm run qa:seed`, then verify and resume/verify; compare invoice/payment/allocation, stock movement and inventory balances before/after replay.
5. Run `QA_SCENARIO=multi-currency` and `QA_SCENARIO=financial-exports`; save run IDs, expected/actual report totals, job IDs/status, CSV rows and resume counts. Do not claim results from fake tests.
6. Complete authenticated browser SALES-004/REPORT-002 acceptance, verified CSV downloads, role/tenant denial checks and representative disposable-schema EXPLAIN. Then run `COMPLETE_INVENTORY_BUSINESS_LIFECYCLE` for QUALITY-001.
7. Recalculate roadmap count from individual task entries. Keep **30/47** until mandatory acceptance passes. Do not commit or push.
