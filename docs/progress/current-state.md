# Current state

**Updated:** 2026-11-25 (Africa/Lagos)

## Repository and roadmap

- Repository: `/Users/newuser/Documents/GitHub/inventory`; branch `develop`; HEAD at this UI pass start `237107a` (`update customer design`). Worktree was clean at pass start. This pass has uncommitted frontend and UI documentation edits; no pre-existing changes were overwritten.
- Roadmap remains **30/47**. SALES-004, REPORT-002 and QUALITY-001 remain IN_PROGRESS. No task became complete; fixture code and mocked verification do not meet operational acceptance.
- No commit, push, deployment, migration application, database reset, deletion, or credential change occurred.

## UI redesign slice (2026-11-25)

- Added initial UI tokens in `apps/web/src/styles/tokens.css` and reusable `PageHeader`, `DataTable`, `StatusBadge`, `Drawer` and `ConfirmDialog` components under `apps/web/src/components/ui/`.
- Updated `/customers` and `/suppliers` to use consistent headers, debounced server-side filters, table layout, statuses and pagination. Existing form payloads/endpoints were preserved; create/edit forms are organized into sections inside a shared drawer. Supplier archive now asks for confirmation before the existing archive API call.
- Updated user-facing shell labels from Workspace to Business where appropriate; API paths and organization terminology remain unchanged.
- Added audit, system, information architecture, journey, component, progress and acceptance docs under `docs/design/`. The full 34-route inventory is captured, but detailed audit/redesign remains pending for other routes. No backend roadmap task was marked complete; count remains **30/47**.
- Chrome showed populated customer/supplier lists. Customer page briefly displayed an Unauthorized banner while rows remained visible; it disappeared on route revisit and its cause is unresolved. A 390×844 customer-list viewport had `document.documentElement.scrollWidth === 390`. Initial mobile form review found cramped fields; the editor was moved to the shared drawer and its CSS corrected, but hot reload returned Chrome to sign-in before the corrected drawer could be rechecked. No form was submitted and no business data was changed. No screenshot files were saved.
- No database, API contract, credentials, business records, authorization rules or financial behavior were changed.
- Final checks after the debounce and drawer changes: `npm run typecheck`, `npm run lint`, `npm run format:check`, `npm test`, `npm run build`, and `git diff --check` all passed. `npm test`: 60 API/shared passed, 0 failed, 3 opt-in PostgreSQL suites skipped; web tests 2 passed, 0 failed. The build generated 29 routes. No new UI-specific component tests were added.

## UI standardization follow-up (2026-11-25)

- Git evidence confirms the prior customer/supplier redesign was committed at `237107a`; it was not an uncommitted slice at this pass start. Current changes remain uncommitted as requested by the pasted brief.
- Applied existing `PageHeader`, `DataTable`, and `StatusBadge` to Products, Reorder Rules, Low Stock, Transfers, the Sales Orders list and the Purchase Orders list. Product add/edit and reorder-rule add/edit now use the existing Drawer; product archive uses the existing confirmation dialog. Existing API calls and role predicates were retained. PO editor remains inline.
- Browser review in Chrome: populated Products listing (one existing item) and Add Product drawer; Reorder Rules page with 0 current records and shared empty table. No form submission or business-data mutation. Responsive breakpoints, editing, archiving, user permissions and other transaction flows were not exercised.
- Added `docs/design/customer-module-reference.md` and `docs/design/ui-consistency-matrix.md`; replaced the redesign checkpoint with an accurate module-by-module status. Branch/Warehouse screens, Stock Counts, PO detail and complex document forms remain largely unstandardized. The requested nine-module redesign is not complete.
- No backend files, API contracts, schema, credentials, permissions, migrations or records changed. Roadmap remains **30/47**.
- Final sequential checks after the latest source edits: typecheck, lint, format check, `npm test` (60 API/shared + 2 web passed, 0 failed, 3 opt-in PostgreSQL skipped), production build (29 routes) and `git diff --check` passed. A first parallel build/test attempt conflicted during Prisma Client generation and is excluded. Generated `apps/web/next-env.d.ts` and `apps/web/tsconfig.tsbuildinfo` were restored from HEAD.

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
