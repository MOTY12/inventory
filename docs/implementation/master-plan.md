# Master implementation plan

## Current phase

**REPORT-001, REPORT-003 and INV-010 delivered; QUALITY-002 and QUALITY-003 remain open — updated 2026-11-23.** Completed count is **30/47**. QUALITY-002 review added baseline API/Next response security headers and verified isolated PostgreSQL auth/tenant workflows (10/10) and inventory/report workflows (13/13); current default tests passed (52 API/shared, 2 web, 2 opt-in suites skipped), with typecheck, lint, format, Prisma validation, migration status, and production build passing. No confirmed critical/high application authorization bypass was found in reviewed paths. Dependency audit remains unresolved because registry DNS blocked npm audit and prior install reported 3 high advisories without details; QUALITY-002 remains IN_PROGRESS. INV-010 rendered Chrome acceptance passed for native Enter, repeat/rapid scans, unknown-code feedback, recovery, focus and no parent submit. Authenticated full-page UAT for the new sales order, PO receiving and picking is retained under QUALITY-001. QUALITY-003 local PostgreSQL, queue-restart, pending-dispatch, and private object backup/missing/restore drills passed; local recovery timings are recorded in `docs/operations/backup-restore.md`. Production off-host configuration and approved RPO/RTO/retention/residency/key policy remain open. See `docs/security/tenant-isolation-review.md`.

## Phases

0. Research: inspect REA docs/capabilities; review public official inFlow sources; distinguish verified/documented/inferred/unknown. (Draft complete; some direct UI research remains unknown.)
1. Product: interview target users, approve requirements/personas/stories, confirm MVP. (Draft complete; owner validation pending.)
2. Architecture: approve data semantics, transaction/tenant/security/API design. (Draft complete; key policy approvals pending.)
3. Foundation: monorepo, toolchain, Docker, CI, observability, API/web shells.
4. Identity & locations: users, organizations, roles, branches, warehouses.
5. Catalog: SKU, units, categories, products and responsive screens.
6. Inventory engine: movements, balances, adjustments, concurrency, transfers, reorder.
7. Procurement: suppliers, PO, receipt, partial delivery.
8. Sales: customers, order, reservation, fulfillment, invoices/payment records.
9. Reporting: dashboard, exports, purchase/sales/inventory reports.
10. Quality & launch: security/reliability, pilot, legal/accounting review, deployment and operations.
11. Phase 2: approved traceability, returns, integrations and advanced workflow.
12. Phase 3: manufacturing, B2B portal, offline/mobile and broader ecosystem.

## Estimation method and complexity

Relative engineering estimate is **XL** for a production-ready multi-tenant MVP, with 47 discrete tasks across the phases (task ledger). Assuming a small experienced team and user decisions delivered promptly, early delivery planning range is roughly 4–7 months to a controlled pilot and longer for production-grade regional support. This is a planning estimate, not a commitment; user research, compliance and integration decisions can move it materially. Complexity is highest in ledger/reservations/concurrency, tenant isolation, receiving/fulfillment state machines, valuation and migration/recovery.

## Exit gates

Each task's criteria and tests must pass before status COMPLETED. No phase marked shipped based on documentation alone. Product/security/legal decisions and production release gates in `mvp-scope.md` and `acceptance-criteria.md` remain mandatory.
