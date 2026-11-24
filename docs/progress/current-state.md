# Current state

**Updated:** 2026-11-24 (Africa/Lagos)

## Repository and roadmap

- Repository: `/Users/newuser/Documents/GitHub/inventory`, branch `develop`, HEAD `cf45670` (`the reporting updated`). Worktree began clean; this session's changes are uncommitted. No commit, push, deployment, or database reset was made.
- Completed tasks remain **30/47**, counted from completed task entries. SALES-004 and REPORT-002 remain IN_PROGRESS. QUALITY-001 remains NOT_STARTED because REPORT-002 is a dependency.
- Local `inventory_dev` PostgreSQL at `localhost:5433`: 22 migrations found, schema up to date. No migration was applied this session.

## Work this session

- Expanded the isolated reporting PostgreSQL fixture to create a supplier, PO for 10 × NGN 2.50, and partial/full receipts of 4 and 6. It now asserts exact purchase product/supplier metrics and processes/downloads all four detail CSV types through the real worker and S3Mock.
- Verified customer performance after a payment reversal: NGN 47,250 issued, NGN 37,250 effective payments, NGN 10,000 outstanding, zero overdue.
- Added real PostgreSQL due-date boundary cases for today, 1, 30, 31, 60, 61, 90 and 91 days overdue, and missing due date. All buckets reconcile to NGN 900 outstanding.
- Fixed aging output that counted missing-due invoices but omitted their value. It now returns `no_due_date_outstanding` alongside the count. Fixed customer analytics to return exact numeric zero for absent invoice/payment/balance aggregates rather than NULL/blank export cells.
- Hardened the worker crash-recovery integration test to wait for the child readiness handshake before queueing work, removing a startup-listener race.
- Browser acceptance was attempted in Chrome on `localhost:3002`, but the available session was logged out. No credentials or password were changed; interactive acceptance is not claimed.

## Verification

- Opt-in PostgreSQL: `RUN_POSTGRES_INTEGRATION=1 node --test apps/api/test/inventory.postgres.integration.test.mjs apps/api/test/postgres.integration.test.mjs apps/api/test/sales-invoices.postgres.integration.test.mjs` — **26 passed, 0 failed, 0 skipped**. These tests use isolated disposable schemas.
- Default `npm test`: API/shared **59 passed, 0 failed, 3 opt-in PG suites skipped**; web **2 passed, 0 failed**.
- Passed: `npm run typecheck`, `npm run lint`, `npm run format:check`, `npm run db:validate --workspace=@inventory/api`, and `npm run build` (Next Webpack production build, 29 routes).
- Read-only `npx prisma migrate status --config prisma.config.ts`: **22 migrations found; database schema up to date**.
- `git diff --check` passed before the final documentation edits; rerun before handoff.

## Remaining task status

- **SALES-004 — IN_PROGRESS:** database and authenticated API acceptance, including PDF response and accounting edge cases, passes. Invoice/payment/PDF/customer-history browser workflow is unverified because Chrome is logged out.
- **REPORT-002 — IN_PROGRESS:** populated purchase metrics, exact export worker values, reversal-adjusted customer metrics and aging boundaries now have isolated PostgreSQL evidence. Remaining: full filter/security matrix, multi-currency pagination, EXPLAIN ANALYZE/performance evidence, and authenticated browser filters/export workflows.
- **QUALITY-001 — NOT_STARTED:** blocked by the unfinished REPORT-002 prerequisite; do not begin its end-to-end scenario until dependencies are complete.
- Completed count remains **30/47**; no task newly completed.
