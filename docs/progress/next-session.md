# Next session — unblock SALES-004 acceptance

Updated: 2026-11-28 (Africa/Lagos)

## Checkpoint

- Repository: `/Users/newuser/Documents/GitHub/inventory`; branch `develop`; start HEAD `568938b`. The worktree has uncommitted QA automation and documentation changes. Preserve them; do not commit, push, or deploy.
- Roadmap remains **30/47**. SALES-004 is **IN_PROGRESS**. REPORT-002 depends on SALES-004 and PROCUREMENT-003; do not mark it complete or advance past the dependency graph.
- Docker Desktop 28.5.1 is running. PostgreSQL, Redis and S3Mock Compose containers report healthy. Existing API readiness is HTTP 200. Existing Next app responds HTTP 200 on port 3001; port 3000 belongs to another local app. Prisma status reports 22 migrations and schema up to date.
- Added `npm run qa:preflight`, Playwright commands/config, and a finance invoice browser test. The browser test is discoverable (`npm run qa:e2e -- --list`) but has not been executed. No invoice/payment QA fixture was seeded and no business record was changed.

## QA preflight evidence

`npm run qa:preflight` returned **FAILED**. Passed: safe local target, API live/readiness, PostgreSQL/API database fingerprint and exact QA workspace identity, Redis authenticated PING, S3Mock bucket, frontend `/login`, and Prisma migration status. The configured login authenticates, but the account is not an active OWNER of the exact `Quality 001 QA Workspace`; the separate DB OWNER-membership check and authenticated workspace authorization check failed. Preflight returned the corrective action to set the existing active OWNER credentials and logged out the session. Credential values were not printed.

`QA_EMAIL`, `QA_PASSWORD`, `QA_ORGANIZATION_ID`, `QA_ORGANIZATION_NAME`, and `QA_WEB_BASE_URL` are set in ignored `.env`; only presence was checked. Do not print them. The configured login is not eligible; replace it locally with the existing active OWNER credentials for this workspace. The owner selected this path. Do not reset or modify the OWNER's password. No `QA_RUN_ID` is currently configured.

## Files changed in this session

- Root `package.json` (lint/format coverage for the E2E test).
- `scripts/qa/preflight.mjs`, `scripts/qa/preflight.test.mjs`, `scripts/qa/safety.mjs`, `scripts/qa/workflow.test.mjs`, `scripts/qa/scenarios/invoice-states.mjs`, `playwright.config.mjs`.
- Extended existing `tests/e2e/finance/invoices.spec.mjs`. Existing Playwright artifact ignore rules were reused.
- Added `docs/testing/local-qa-preflight.md`, `docs/testing/finance-browser-acceptance.md`, `docs/testing/report-acceptance.md`; updated `docs/design/ui-acceptance-results.md`, `docs/implementation/master-plan.md`, `docs/implementation/task-breakdown.md`, `docs/progress/blockers.md`, `docs/progress/current-state.md`, `docs/progress/next-session.md`, `docs/progress/pending-tasks.md`, and `docs/progress/session-log.md`.
- `.env` is ignored local configuration; its `QA_WEB_BASE_URL` now targets port 3001.

## Checks run

- `npm run qa:test`: **27 passed, 0 failed, 0 skipped**.
- `npm run qa:e2e -- --list`: found 1 finance invoice test; this is discovery only, not browser acceptance.
- `npm run typecheck`, `npm run lint`, and `npm run format:check`: passed. `npm test`: 62 API/shared passed, 0 failed, 3 opt-in PostgreSQL suites skipped; web tests 4/4 passed. The SALES-004 isolated PostgreSQL suite was explicitly run: 4 passed, 0 failed, 0 skipped. `npm run build` passed and generated 31 routes.
- `npm run qa:preflight`: failed for the active OWNER identity mismatch described above; all infrastructure checks passed.
- `npm run qa:test`: 27 passed, 0 failed, 0 skipped. Playwright discovery found one test; no browser test was executed. `git diff --check` passed after final progress updates.
- The repository already pins `@playwright/test@1.65.1`; it was reused. npm's install/audit output reported 13 dependency advisories (10 moderate, 3 high) across the audited tree. This does not identify which package introduced them; review separately before release.

## Exact resume steps

1. Check `git status --short` and `git diff`; preserve all existing changes.
2. The owner selected the existing OWNER path. Update `QA_EMAIL` and `QA_PASSWORD` in ignored `.env` to the existing active OWNER of this exact QA workspace. Never print the password or modify the user's password. Ensure `QA_WEB_BASE_URL=http://localhost:3001` while that is the Stockroom web port.
3. Run `npm run qa:preflight`. Do not seed unless every check returns READY.
4. Run `QA_SCENARIO=document-states npm run qa:seed`; record its printed run ID. Inspect/resume that manifest and run `QA_RUN_ID=<run-id> npm run qa:verify` before any rerun.
5. Run `QA_RUN_ID=<run-id> npm run qa:e2e:finance`. It exercises invoice draft/issue/PDF, 30k + 50k payments, reversal/replacement, customer history, exact database reconciliation and inventory non-mutation. Artifacts remain under ignored `.qa-artifacts/`.
6. If browser acceptance fails, investigate the specific defect; preserve the run manifest and use stable QA notes/payment references to recover without duplicates. Do not run against non-QA business records.
7. Run `npm run qa:test`, `npm test`, `npm run typecheck`, `npm run lint`, `npm run format:check`, `npm run build`, Prisma validation if relevant, and `git diff --check`. Explicitly run affected opt-in PostgreSQL suites; list skips separately.
8. Close SALES-004 only after all mandatory acceptance, actual PDF inspection, financial reconciliation, inventory non-mutation and security checks have evidence. Then inspect REPORT-002 remaining criteria; its existing tests/features do not by themselves satisfy browser/report acceptance. Recalculate task count from task entries.

## Remaining blockers and next milestone

- Authenticated browser workflow is blocked by the currently configured user not being an active OWNER of the approved QA workspace. Browser test cannot safely execute without correct identity and a seeded run.
- Actual invoice PDF download/inspection, payments and reversal in the browser, customer UI reconciliation, and browser/database inventory non-mutation remain unverified.
- REPORT-002 remains dependency-gated by SALES-004 and PROCUREMENT-003. No task count increase is justified; **30/47** remains current.
- Exact next milestone: complete SALES-004 authenticated browser acceptance after the QA OWNER access issue is resolved; advance to REPORT-002 only when SALES-004's ledger criteria pass.
