# Master implementation plan

## Current phase

**REPORT-001, REPORT-003 and INV-010 delivered; SALES-004 and REPORT-002 remain IN_PROGRESS; QUALITY-001 is IN_PROGRESS for fixture tooling, with operational acceptance NOT RUN; QUALITY-002/003 remain open — updated 2026-11-25.** Completed count remains **30/47**. This turn's QA suite passed 18/18; typecheck, lint, and formatting passed. Default `npm test` passed 60 API/shared and 2 web tests; its 3 opt-in PostgreSQL suites were skipped. Explicit isolated PostgreSQL suites passed 10/10, 13/13 and 3/3 (26/26). The QA harness now has document-state invoice variants, multi-currency fixture/report verification, financial-export queue/download/CSV reconciliation, and an unexecuted authorization probe path. These authenticated fixtures have NOT been executed. Docker reports PostgreSQL, Redis and S3Mock healthy. API readiness returned HTTP 200 with a database fingerprint; existing Next server returned HTTP 200 on port 3000. QA configuration and verified restricted member/foreign-tenant identities are missing; membership/grant revocation and export-download authorization remain uncovered. Browser invoice/download acceptance and export file capture are not claimed. No roadmap task became complete.

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
