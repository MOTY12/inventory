# Master implementation plan

## Current phase

**REPORT-001, REPORT-003 and INV-010 delivered; SALES-004 and REPORT-002 remain IN_PROGRESS; QUALITY-001 is IN_PROGRESS for fixture tooling, with operational acceptance NOT RUN; QUALITY-002/003 remain open — updated 2026-11-28.** Completed count remains **30/47**. QA tests passed 18/18; the SALES-004 isolated PostgreSQL suite passed 4/4 in the previous acceptance run; typecheck, lint, formatting, default tests and production build results are recorded in the task ledger. Docker reports PostgreSQL, Redis and S3Mock healthy; Prisma reports 22 migrations and schema up to date. The documented disposable QA workspace exists and has one active OWNER membership. Its ID, exact name, `NODE_ENV=development`, and API base URL are now set in ignored `.env`; `QA_EMAIL` and `QA_PASSWORD` remain unset. The QA seed stopped safely at that credential check. API readiness returned HTTP 200 after starting Nest with local DB access; Next is available at port 3001, and Chrome is at sign-in. No business record was changed. Browser invoice/payment workflow and actual PDF capture remain unverified. No task became complete. REPORT-002 remains dependency-gated on SALES-004.

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
