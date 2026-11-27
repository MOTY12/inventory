# Next session — resume SALES-004 acceptance

Updated: 2026-11-27 (Africa/Lagos)

## Repository checkpoint

- Repository: `/Users/newuser/Documents/GitHub/inventory`; branch `develop`; HEAD `13157b6` (`UPdate the payment redisign`). No commit or push was made.
- Roadmap: **30/47 complete**. SALES-004 remains **IN_PROGRESS**. Do not count it complete until browser-based authenticated invoice/payment workflow acceptance and PDF file capture are recorded.
- Preserve the uncommitted source and documentation edits from this session. The build-generated tracked files `apps/web/next-env.d.ts` and `apps/web/tsconfig.tsbuildinfo` were restored to their clean-at-start state.

## Completed this session

- Improved invoice creation retry behavior with a stable logical idempotency key and guarded asynchronous organization/order/tax-rate loads against stale responses.
- Guarded invoice detail, audit and tax-rate loads against stale organization responses.
- Added web unit coverage for stable idempotency keys (2 tests).
- Extended `apps/api/test/sales-invoices.postgres.integration.test.mjs` with a controlled real-PostgreSQL scenario covering partial/full payment, reversal/replacement, invoice/customer totals, tax rounding/snapshot stability, PDF contents, and inventory non-mutation.
- Explicit opt-in SALES-004 PostgreSQL integration suite: **4 passed, 0 failed, 0 skipped** against an isolated randomized schema. Existing data was not used for mutation.
- Full verification: `npm run typecheck`, `npm run lint`, `npm run format:check`, `npm test` (**62 API/shared + 4 web passed; 3 opt-in PostgreSQL suites skipped in default run**), `npm run qa:test` (**18/18**), and `npm run build` (31 Next routes) passed. `git diff --check` passed before progress documentation edits; rerun after this checkpoint is written.
- Docker Compose: PostgreSQL, Redis, S3Mock healthy. `npx prisma migrate status --config prisma.config.ts`: **22 migrations found; schema up to date**. No migration applied.
- Authenticated Chrome showed an existing sales order and issued paid invoice. `/invoices/new` had no eligible orders. These are persistent user/business records; none were changed or used for a browser workflow.

## Files changed

- `apps/api/test/sales-invoices.postgres.integration.test.mjs`
- `apps/web/src/app/invoices/new/page.tsx`
- `apps/web/src/app/invoices/[invoiceId]/page.tsx`
- `apps/web/src/features/sales/idempotency.ts` (new)
- `apps/web/test/idempotency.test.mjs` (new)
- `docs/implementation/master-plan.md`
- `docs/implementation/task-breakdown.md`
- `docs/progress/current-state.md`
- `docs/progress/next-session.md`
- `docs/progress/pending-tasks.md`
- `docs/progress/blockers.md`
- `docs/progress/session-log.md`
- `docs/design/ui-acceptance-results.md`

## Blocker and remaining acceptance

The QA fixture tool refused to run before mutation because `NODE_ENV` is unset. Also absent: `QA_ORGANIZATION_ID`, `QA_ORGANIZATION_NAME` (must be `Quality 001 QA Workspace`), `QA_EMAIL`, `QA_PASSWORD`, and optional authorization actor values `QA_AUTH_OWNER_EMAIL/PASSWORD` plus restricted/foreign identities. `QA_ENVIRONMENT=development` and `DATABASE_URL` are present; `QA_API_BASE_URL` defaults to `http://localhost:4000/api/v1`. Do not create or change accounts, invent credentials, seed without the required safety settings, or mutate existing business data.

## Exact next steps

1. Inspect `git status --short` and the relevant diffs; preserve all existing edits. Confirm HEAD remains `13157b6` and roadmap count 30/47.
2. Obtain owner-provided disposable QA workspace and owner login values through the project’s existing local configuration process. Set `NODE_ENV=development`, exact workspace name/ID, `QA_EMAIL`, and `QA_PASSWORD` in ignored `.env`; do not print secrets. Configure `QA_AUTH_*` only if running authorization scenarios.
3. Run `QA_SCENARIO=document-states npm run qa:seed` only after safety validation succeeds. Confirm the seed reports disposable QA resources before proceeding.
4. In authenticated Chrome, create/verify an eligible order in that QA workspace, issue an invoice, inspect its detail and audit history, record partial and multiple payments, verify balance/status, download and inspect the PDF, exercise retries and reversal where the scenario permits, and verify tenant/warehouse role denials.
5. Verify invoice/payment operations do not alter stock ledger movements or warehouse balances. Save exact browser/API evidence and any QA run/resource IDs, without exposing passwords.
6. Run `npm run typecheck`, `npm run lint`, `npm run format:check`, `npm test`, `npm run qa:test`, `npm run build`, `git diff --check`; explicitly run relevant `RUN_POSTGRES_INTEGRATION=1` suites and report skipped suites separately.
7. Update task status only against SALES-004 acceptance criteria. Recalculate count from unique task entries. If SALES-004 is accepted, advance to the next dependency-ready roadmap task (likely SALES-005); do not start REPORT-002 or another feature before this acceptance pass.

No commit, push, production deployment, database reset, or persistent-record mutation occurred in this session.
