# Next session checkpoint

**Updated:** 2026-11-25 (Africa/Lagos)

## Resume facts

- Repository `/Users/newuser/Documents/GitHub/inventory`, branch `develop`, HEAD `b520e51` (`Update the md`). Worktree has uncommitted QA tool and progress changes; preserve and inspect them. Changed/new paths: `.gitignore`, `package.json`, `scripts/qa/{api-client,manifest,safety,seed,verify,workflow,workflow.test}.mjs`, `docs/operations/qa-fixture-guide.md`, `docs/progress/{current-state,next-session,session-log}.md`, `docs/implementation/{master-plan,task-breakdown}.md`, `docs/operations/quality-001-acceptance.md`.
- No commit, push, deploy, migration, reset, deletion or QA business mutation. Source-only generated `apps/web/tsconfig.tsbuildinfo` was restored.
- Roadmap: **30/47 completed**. SALES-004 and REPORT-002 remain IN_PROGRESS. QUALITY-001 is IN_PROGRESS for harness work, but its named operational scenario is NOT RUN and remains dependency-gated.
- Docker services PostgreSQL/Redis/S3Mock are healthy. API readiness and frontend `/login` returned HTTP 200 on ports 4000 and 3002. API and web dev processes were started; port 3000 was untouched. Prisma status: 22 migrations found and current.
- CLI target inputs are absent: no QA organization ID/name and no QA email/password are configured in the ignored `.env`. Seed was attempted with explicit development mode and stopped safely at the missing organization UUID before authentication or mutation. No manifest was produced.

## Implemented

- Local commands: `npm run qa:seed`, `npm run qa:resume`, `npm run qa:verify`, `npm run qa:test`.
- API client authenticates with the existing login and refresh-cookie/CSRF flow, selects a membership-validated organization, sends request IDs, times out, surfaces safe error codes, and only retries GET or commands with stable idempotency keys.
- Local safety rejects non-development/test modes, non-loopback/wrong-port API, remote/non-dev database, missing/mismatched organization target, missing credentials, non-member accounts, and non-owner roles.
- Atomic mode-0600 manifests in gitignored `.qa-runs` store run ID, environment/organization, current stage, resource IDs, expected quantities/money, stable idempotency keys and completed/failed operations without auth secrets.
- Seed path uses supported APIs to build run-scoped branch/warehouse/catalog/supplier/customer records and execute the deterministic NGN PO receive → transfer → sale reserve/pick/fulfill → invoice → partial payment/reversal/replacement scenario. Verify reads documents, balances, ledger reconciliation, allocations and sales/purchase product reports.
- Explicit limitations: no alternate document states, USD scenario, separate tenant/restricted user, export fixture or performance data generator yet. Those remain part of the unclosed acceptance work.

## Verification completed

- `npm run qa:test`: **6 passed, 0 failed, 0 skipped**.
- `npm test`: API/shared **59 passed, 0 failed, 3 opt-in PostgreSQL skipped**; web **2 passed, 0 failed**.
- `npm run typecheck`, `npm run lint`, `npm run format:check`, `npm run build` (Webpack; 29 routes), `npm run db:validate --workspace=@inventory/api`, Prisma migration status (22/22 current), QA syntax checks, and `git diff --check` passed.
- QA seed attempts exited 1 before authentication/mutation: plain command lacked `NODE_ENV`/`QA_ENVIRONMENT`; explicit development mode then stopped at missing `QA_ORGANIZATION_ID`. This is not a generator runtime pass. No populated data, browser workflow, CSV download or quality E2E is claimed.
- Prior session's opt-in 16/16 PostgreSQL suite results are prior evidence only; no PostgreSQL integration suite was rerun specifically for the QA script.

## Exact next steps

1. Add to ignored `.env`: `NODE_ENV=development`, `QA_ENVIRONMENT=development`, `QA_API_BASE_URL=http://localhost:4000/api/v1`, local development `DATABASE_URL`, `QA_ORGANIZATION_ID=<approved UUID>`, `QA_ORGANIZATION_NAME=Quality 001 QA Workspace`, `QA_EMAIL=<active OWNER email>`, and `QA_PASSWORD=<existing password>`. Do not alter credentials or share the password in chat.
2. Run `npm run qa:test`; then `npm run qa:seed`. Record the emitted run ID. Resume with `QA_RUN_ID=<id> npm run qa:resume`; verify with `QA_RUN_ID=<id> npm run qa:verify`. Stop if identity or reconciliation fails.
3. Extend fixtures for all required states, NGN+USD, role/tenant scope and all four export types; run browser invoice/PDF/payment and report/filter/CSV acceptance on the generated run.
4. Capture safe representative EXPLAIN ANALYZE evidence on a sufficiently populated disposable schema. Do not use production customer data.
5. Only once SALES-004 and REPORT-002 criteria pass, run `COMPLETE_INVENTORY_BUSINESS_LIFECYCLE` and reconcile every expected amount, movement, reservation, balance, report and retry.
6. Update task statuses, task count and progress docs from actual evidence. Keep QUALITY-001 IN_PROGRESS and **30/47** until full criteria are satisfied. Do not commit or push unless separately directed.
