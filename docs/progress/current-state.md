# Current state

**Updated:** 2026-11-24 (Africa/Lagos)

## Verified checkpoint

- Repository: `/Users/newuser/Documents/GitHub/inventory`, branch `develop`, HEAD `0483ea9` (`update md`). No commit, push, or deployment was made in this session. Existing user changes were preserved.
- Roadmap: **30/47 tasks complete**. SALES-004 remains **IN_PROGRESS**, not complete: implementation and meaningful database acceptance exist, but required browser workflows and some API/UI acceptance are still outstanding. Task count does not increase until all required criteria are met.
- SALES-004 owner-approved provisional MVP policy is DEC-010 in `docs/progress/decisions.md`; the financial-policy blocker is removed for this scope. Statutory compliance remains an accountant/legal release review.
- Implemented invoice/payment Prisma models, tenant-composite constraints, additive migration, invoice/tax/payment APIs and services, immutable financial document/payment triggers, idempotency, warehouse grants, audit events, printable PDF, and frontend invoice, payment, tax-rate, draft-edit, and customer financial-history workflows.
- Found and fixed two defects through PostgreSQL acceptance: nested invoice-line creation passed a redundant `organizationId` rejected by Prisma; idempotent payment replay omitted warehouse-grant revalidation. Added database-side allocation overpayment protection and audit/history UI.
- Migration `20261124120000_sales_invoices_payments` was inspected and applied additively to local `inventory_dev` through `npm run db:migrate:deploy --workspace=@inventory/api`. Prisma reports **21 migrations, database up to date**. No reset or data deletion occurred; migration contains only new objects and triggers.

## Verification evidence

- Isolated PostgreSQL SALES-004 integration: **2 passed, 0 failed, 0 skipped**. Exercises draft creation/replay, discounted and taxed Decimal totals, issue numbering/replay, multiple payments, overpayment rejection, competing payments, reversal, tenant denial, warehouse grant denial on replay, audit records, customer balance summary and inventory-ledger non-mutation. Test uses a uniquely named temporary schema and drops it afterward.
- `npm test`: **57 passed, 0 failed, 3 opt-in PostgreSQL suites skipped**; web: **2 passed, 0 failed**. The SALES-004 opt-in suite was explicitly run separately and passed.
- Typecheck, lint, format check, Prisma validation, migration status, full production build and `git diff --check` passed. Migration deployment passed. An initial build overlapped with the test runner's Prisma client generation and failed; the sequential full build passed afterward.
- No interactive browser workflow was completed. UI is typecheck/build verified, not browser-accepted. API/controller flows were not exercised through an authenticated live HTTP session.

## Outstanding SALES-004 acceptance gaps

1. Run authenticated browser UAT for create/edit/issue invoice, tax configuration updates, payments/reversals, PDF download/print, customer history, and permission-denied roles.
2. Add/verify authenticated HTTP/controller DTO and OpenAPI tests for invoice, payment, tax-rate, PDF, and customer-financial routes.
3. Add focused PostgreSQL verification for simultaneous invoice numbering across multiple orders, tax-rate update/deactivation snapshots, void eligibility, reversal replay/conflicts, and direct database immutability/overpayment triggers.
4. Review whether API query filters and interface affordances meet all task acceptance (customer/date/status/currency filtering, pagination, and error/retry states); invoice/payment filters are implemented for currently exposed fields.
5. Do not claim statutory invoice compliance; accountant/legal review is a production gate.

## Next task

Continue SALES-004 verification and close the acceptance gaps above. When its acceptance criteria and dependencies are satisfied, mark SALES-004 complete (roadmap 31/47) and proceed to REPORT-002 only if the dependency map confirms readiness. Do not start unrelated major features during acceptance closure.
