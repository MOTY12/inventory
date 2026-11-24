# Next session checkpoint

**Updated:** 2026-11-24 (Africa/Lagos)

## Repository and stage

- Workspace: `/Users/newuser/Documents/GitHub/inventory`; branch `develop`; HEAD at checkpoint: `0483ea9` (`update md`). Worktree contains uncommitted SALES-004 source, migration, test, and progress-document changes; preserve them and inspect `git status` before editing.
- No commit, push, or deployment was made. The SALES-004 additive database migration was applied locally; no reset or delete was run.
- Roadmap is **30/47 completed**. SALES-004 is **IN_PROGRESS** (DEC-010 policies approved). Do not count it complete until acceptance gaps below are closed.

## Completed this session

- Added tenant-scoped invoice numbering/tax/invoice/payment/reversal schema and additive migration `20261124120000_sales_invoices_payments`; applied successfully to `inventory_dev`, status 21/21.
- Implemented Nest services/controllers/DTOs for draft create/edit, issue/void, invoice list/detail/summary/PDF/audit, tax-rate CRUD and activation, manual payments, reversals, payment list/detail, and customer invoice/payment/financial summary.
- Enforced Decimal arithmetic, line discounts, configurable tax-exclusive rates, currency precision rounding, database immutability and allocation integrity triggers, transactional audit/idempotency, organization scope, and warehouse grants including replay authorization.
- Built invoice listing/create/detail and draft edit, payment list, tax-rate management, PDF/print, and customer financial history pages; nav remains role-aware.
- Fixed defects discovered by isolated PostgreSQL testing: Prisma nested invoice-line create included a redundant parent-supplied tenant field; payment idempotency replay did not recheck warehouse grants. Added an allocation trigger that serializes on invoice rows and prevents effective over-allocation.

## Checks and results

- `RUN_POSTGRES_INTEGRATION=1 node --test apps/api/test/sales-invoices.postgres.integration.test.mjs`: **2 passed, 0 failed, 0 skipped** using a unique temporary schema. Covered invoice create/replay, Decimal tax/discount example, issue number/replay, multiple payments, rejected overpayment, concurrent attempts, reversal balance, tenant denial, warehouse grant denial on idempotent retry, audit, customer summary, and zero extra inventory movements.
- `npm test`: **57 passed, 0 failed, 3 opt-in PostgreSQL suites skipped**, plus web tests **2 passed, 0 failed**. The new SALES-004 opt-in suite was run explicitly and passed separately.
- Passed: `npm run typecheck`, `npm run lint`, `npm run format:check`, `npm run db:validate --workspace=@inventory/api`, `npx prisma migrate status --config prisma.config.ts` (21/21), `npm run build`, `git diff --check`.
- `npm run db:migrate:deploy --workspace=@inventory/api` passed after sandboxed migration deployment failed with a schema-engine error. No destructive migration command was run.
- No browser UAT or authenticated HTTP/controller acceptance run. Build success is not counted as UI workflow verification.

## Remaining acceptance work / blockers

- SALES-004 remains IN_PROGRESS. Browser-based authenticated workflow acceptance is outstanding; local browser control was unavailable in the earlier environment and must be checked again.
- Add or run API/controller authentication, DTO validation, OpenAPI and permission matrix checks.
- Extend PostgreSQL verification for concurrent numbering on separate orders, void conditions, tax-rate edits/deactivation preserving issued snapshots, payment-reversal replay/conflict behavior, and direct database triggers.
- Check invoice/customer/payment filters, pagination and loading/empty/error UX against `docs/implementation/acceptance-criteria.md`.
- Accountant/legal review is required before any statutory invoice compliance claim or production use.
- Independent QUALITY-002 npm advisory review remains blocked by npm registry DNS; QUALITY-003 production recovery policy and broader QUALITY-001 authenticated page UAT remain open.

## Exact next steps

1. Run `git status --short` and inspect diffs, preserving all SALES-004 work.
2. Start the local API/web/database if available, log in using the existing account, and exercise invoice draft create/edit → issue → partial/multiple payment → reversal → PDF/print; test tax-rate update and void rules.
3. Verify owner/admin/finance versus sales/warehouse and ungranted warehouse denial via live authenticated HTTP/UI; test cross-organization denial.
4. Extend `apps/api/test/sales-invoices.postgres.integration.test.mjs` for concurrent independent invoice numbering, tax snapshots, void rules, reversal replay/conflict, and database triggers; run with `RUN_POSTGRES_INTEGRATION=1`.
5. Add focused controller/API contract assertions and inspect OpenAPI route/DTO validation coverage.
6. Re-run `npm test`, typecheck, lint, format, Prisma validation/status and production build after any changes.
7. Update `task-breakdown.md`, `master-plan.md`, `current-state.md`, `next-session.md`, `session-log.md`, and blocker/pending summaries. Keep SALES-004 IN_PROGRESS until every mandatory criterion is verified. Then, and only then, count 31/47 and select the next dependency-ready roadmap task.
