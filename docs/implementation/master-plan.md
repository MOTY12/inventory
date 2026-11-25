# Master implementation plan

## Current phase

**REPORT-001, REPORT-003 and INV-010 delivered; SALES-004 and REPORT-002 remain IN_PROGRESS; QUALITY-001 is IN_PROGRESS for QA fixture tooling, with its operational scenario NOT RUN; QUALITY-002/003 remain open — updated 2026-11-25.** Completed count remains **30/47**. This session's default tests passed 60 API/shared, 2 web, and skipped 3 opt-in PG suites. All three opt-in PostgreSQL suites passed 26/26. QA tests passed 14/14; typecheck, lint, format check, API build, isolated web production build (29 routes), Prisma validation, and read-only 22/22 migration status passed. Docker reports PostgreSQL/Redis/S3Mock healthy. Started API/web dev servers and left them running; readiness returned HTTP 200 and CLI database identity matched the API fingerprint. Chrome rendered `/login`, but no credentials were entered and no workflow was performed. QA fixture execution is blocked by missing local QA organization/account variables. A document-state scenario now covers PO and sales-order states but has only API-shaped mock test coverage; invoice-state, multi-currency, authorization and financial-export scenarios remain. REPORT-002 still lacks multi-currency populated browser/export evidence and performance plans; SALES-004 lacks authenticated browser acceptance. No end-to-end scenario result or newly completed task is claimed.

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
