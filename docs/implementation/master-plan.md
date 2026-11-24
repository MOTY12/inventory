# Master implementation plan

## Current phase

**REPORT-001, REPORT-003 and INV-010 delivered; SALES-004 is blocked on owner financial-policy approval; QUALITY-002 and QUALITY-003 remain open — updated 2026-11-24.** Completed count is **30/47**. The latest default `npm test` passed 52 API/shared and 2 web tests; two opt-in PostgreSQL suites were skipped. Explicit integration was attempted but blocked by sandbox `EPERM` to configured PostgreSQL port 5433. Docker daemon access is denied. `npm audit --omit=dev --audit-level=high` failed because npm registry DNS returned `ENOTFOUND`. No current clean dependency audit or database integration result is claimed. Previous 2026-11-23 PostgreSQL, build, lint, format and migration evidence remains in the checkpoint below and progress docs. SALES-004's financial policy proposal is in `docs/progress/decisions.md`; the execution brief's recommended MVP is not approval. No invoice/payment implementation or migration has begun. See `docs/progress/next-session.md`.

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
