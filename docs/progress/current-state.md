# Current state

**Updated:** 2026-11-25 (Africa/Lagos)

## Repository and roadmap

- Repository: `/Users/newuser/Documents/GitHub/inventory`; branch `develop`; HEAD `b520e51` (`Update the md`). The worktree now contains this QA tool implementation and its documentation; see `git status`. No application-domain source or Prisma schema/migration was changed. No commit, push, deployment, database reset or business-record deletion occurred.
- Completed tasks: **30/47**. SALES-004 and REPORT-002 remain IN_PROGRESS. QUALITY-001 is IN_PROGRESS for fixture-harness implementation; its named operational acceptance scenario is NOT RUN and remains gated by SALES-004/REPORT-002 acceptance.
- Architecture and task dependencies are unchanged. No product, financial, security or hosting decisions were altered.

## QA fixture generator delivered

- Added local-only commands `npm run qa:seed`, `npm run qa:resume`, `npm run qa:verify`, and `npm run qa:test`.
- Added API client with application login, organization selection, rotating refresh-cookie/CSRF support, timeouts, request IDs, safe structured errors, and retry policy limited to GET/idempotency-key commands.
- Added safety gates for explicit development/test mode, loopback API on port 4000, local development/test database URL, required organization UUID and exact name, credentials, active membership, and OWNER role. Mutations use supported tenant-scoped APIs only.
- Added atomic, mode-0600, gitignored `.qa-runs` manifests with stable run IDs/idempotency keys, stage, target, resource IDs, expected values and completion/failure records. Resume reconciles run-unique resources before creating and replays idempotent critical commands.
- Seed path creates 2 branches, 3 warehouses, 2 units, 3 categories, 6 products, 2 suppliers, 3 customers, then a deterministic NGN procurement → transfer → fulfilled sale → invoice → partial payments/reversal/replacement lifecycle. `qa:verify` reads the resulting orders, balances, ledger reconciliation, invoice allocations and sales/purchase product reports.
- Added safety, organization-authorization, manifest/resume, secret-exclusion, retry-safety and verification-failure tests; added [qa-fixture-guide.md](/Users/newuser/Documents/GitHub/inventory/docs/operations/qa-fixture-guide.md).
- Execution is **blocked before authentication/mutation** because local `.env` lacks QA mode and QA target/login settings. Plain `npm run qa:seed` exited 1 at the development/test mode guard; a second attempt with `NODE_ENV=development QA_ENVIRONMENT=development` exited 1 at the missing `QA_ORGANIZATION_ID` guard. Both stopped before API calls. No manifest or business records were created. The generator is not claimed operationally verified against a live account.
- Known fixture scope gaps are recorded in the guide: alternate open/partial/cancelled documents, USD records, restricted user/separate-tenant fixtures, exports, and representative performance plans are not yet generated. Those gaps prevent SALES-004, REPORT-002 and QUALITY-001 acceptance closure.

## Verification and runtime

- `npm run qa:test`: **6 passed, 0 failed, 0 skipped**.
- Passed: `npm test` (API/shared 59 passed, 3 opt-in PostgreSQL suites skipped; web 2 passed), `npm run typecheck`, `npm run lint`, `npm run format:check`, `npm run build` (Webpack production build; 29 routes), `npm run db:validate --workspace=@inventory/api`, and read-only Prisma migration status (**22 migrations; schema current**).
- Passed: `git diff --check`; QA script syntax checks. Generated `apps/web/tsconfig.tsbuildinfo` from verification was restored to the clean HEAD version.
- Docker Compose reports PostgreSQL, Redis and S3Mock healthy. API readiness returned HTTP 200 at `http://127.0.0.1:4000/api/v1/health/ready`; frontend `/login` returned HTTP 200 at port 3002. Both local development processes were started for this session. The unrelated port 3000 was not contacted.
- No opt-in PostgreSQL integration run was needed for these script-only changes. The previous run's 16 isolated DB passes and 26/26 earlier run remain prior-session evidence, not a fixture-generator acceptance result.
- Browser workflow acceptance was not run this session because reusable CLI credentials and approved organization ID are absent. No browser login/session or credential was changed.

## Exact next steps

1. In the ignored local `.env`, set `NODE_ENV=development`, `QA_ENVIRONMENT=development`, `QA_API_BASE_URL=http://localhost:4000/api/v1`, the local dev `DATABASE_URL`, exact `QA_ORGANIZATION_NAME=Quality 001 QA Workspace`, its `QA_ORGANIZATION_ID`, and `QA_EMAIL`/`QA_PASSWORD` for an active OWNER. Do not share the password in chat.
2. Run `npm run qa:test`, then `npm run qa:seed`; save the printed run ID. If interrupted, set `QA_RUN_ID` and run `npm run qa:resume`. Run `QA_RUN_ID=<id> npm run qa:verify` and record the independent report. Stop on any target-identity or reconciliation failure.
3. Before task closure, extend the fixture generator for the remaining documented dataset variants and exports, then complete populated SALES-004 browser acceptance and REPORT-002 multi-currency/export/security/performance acceptance. Do not touch the prior draft stock count or prior product.
4. Only after those dependencies pass, execute `COMPLETE_INVENTORY_BUSINESS_LIFECYCLE` from `docs/operations/quality-001-acceptance.md`; record exact IDs, values, retries, browser/download evidence and balance/ledger results. Keep count **30/47** until a task meets its full acceptance criteria.
