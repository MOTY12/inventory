# Numbered task breakdown

Status: vocabulary: NOT_STARTED, IN_PROGRESS, BLOCKED, COMPLETED. DOC-001, PROD-001, FOUNDATION-001 through FOUNDATION-009, ARCH-001, INV-005, and INV-006 are COMPLETED; PROD-002, ARCH-002, INV-001, INV-002, INV-003, INV-007, and PROCUREMENT-001 through PROCUREMENT-003 are IN_PROGRESS; remaining tasks are NOT_STARTED. FOUNDATION-006/007/008/009 have automated PostgreSQL concurrency, tenant-isolation and scope coverage as recorded in progress documentation. Completed count: 14/47.

## Phase 0–2: research, product, architecture

### DOC-001: Research and planning baseline
**Files/modules affected:** docs/research/, docs/product/, docs/architecture/, docs/implementation/, docs/progress/, AGENTS.md.
**Description:** Review REA source documentation, public inFlow sources, current repository; create sourced product and architecture plans. **Priority:** P0. **Dependencies:** none. **Affected:** `docs/research/**`, `docs/product/**`, `docs/architecture/**`, `docs/implementation/**`, `AGENTS.md`, `docs/progress/**`. **Deliverables:** dated evidence ledger and detailed plan. **Acceptance:** all requested documents exist and separate evidence levels; source dates and access limits documented; application code not created. **Tests:** documentation link/path/consistency review. **Status:** COMPLETED.

### PROD-001: Validate target users and problem
**Files/modules affected:** docs/product/, docs/progress/decisions.md.
Description: Complete the initial product research and prepare user validation. Priority: P0. Dependencies: DOC-001. Affected product docs. Deliverables: research findings, target-segment hypotheses and interview guide (`docs/product/user-research-plan.md`). Acceptance: planning deliverables reviewed and owner authorizes implementation; interviews are explicitly deferred to pilot validation, with no participant findings claimed. Tests: research protocol/source review. Status: COMPLETED (owner-directed phase closure; interviews deferred).

### PROD-002: Approve MVP and business policies
**Files/modules affected:** docs/product/, docs/progress/decisions.md.
Description: Resolve open decisions: reservation point, negative stock, valuation, tax, scope, pricing assumptions. Priority: P0. Dependencies: PROD-001. Affected product and architecture docs. Deliverables: signed decision log. Acceptance: all architecture-blocking decisions have owner and value. Tests: scenario review. Status: IN_PROGRESS (core inventory/auth/tenancy assumptions supplied by owner as provisional in DEC-007; tax, pricing, segment and release commitments remain open).

### ARCH-001: Approve transaction and inventory semantics
**Files/modules affected:** docs/architecture/, docs/research/inflow-business-rules.md.
Description: Finalize on-hand/reserved/available/in-transit, transfer and reversal semantics. Priority: P0. Dependencies: PROD-002. Affected database, API, business rules. Deliverables: state diagrams and invariants. Acceptance: every stock transition has balanced ledger postings and rollback behavior. Tests: scenario matrix. Status: COMPLETED for the implementation contract (2026-11-02). Documented quantity definitions, stock transition flow, balanced movement/counterparty expectations, transaction rollback behavior, idempotency, reversal, concurrency and scenario acceptance matrix in `docs/architecture/inventory-semantics.md`, using owner-authorized provisional DEC-007 defaults. These are not validated accounting/customer requirements; PROD-002 remains open for release commitments and non-core business policies.

### ARCH-002: Approve tenant isolation/security model
**Files/modules affected:** docs/architecture/, docs/research/inflow-business-rules.md.
Description: Decide RLS, auth provider, MFA and support access. Priority: P0. Dependencies: PROD-002. Affected security/multi-tenancy docs. Deliverables: threat model and test plan. Acceptance: tenant boundary and support workflow accepted. Tests: threat-model review. Status: IN_PROGRESS (owner supplied provisional email/password, JWT access/rotating refresh, deferred MFA and strict organization-scope defaults; RLS/support access review remains open).

## Phase 3: foundation

### FOUNDATION-001: Repository and workspace foundation
**Files/modules affected:** workspace configuration, apps/web/, apps/api/, packages/shared/.
Description: Establish workspace package manager, web/API packages, shared schemas, lint/format/typecheck. Priority: P0. Dependencies: DOC-001 and explicit owner authorization to begin implementation. Owner-directed provisional policies in DEC-007 now authorize corresponding core auth, tenancy and inventory implementation; unapproved decisions remain release/customer-commitment gates. Affected root configs/apps/packages. Deliverables: reproducible workspace scripts. Acceptance: clean install/build/typecheck on supported Node; no business behavior yet. Tests: CI smoke/build checks. Status: COMPLETED.

### FOUNDATION-002: Local infrastructure and configuration
**Files/modules affected:** `compose.yaml`, `.env.example`, infrastructure/local/.
Description: Compose PostgreSQL, Redis and object storage; validated env schema and safe local defaults. Priority: P0. Dependencies: FOUNDATION-001. Deliverables: Docker Compose and `.env.example`. Acceptance: services start, health checks work, no secret committed. Tests: Compose config, env validation and startup/health smoke. Status: COMPLETED (2026-11-01; PostgreSQL, Redis and S3Mock are healthy in Docker Compose; env validation and Prisma validation pass; configured migrations are applied without resetting the database; host PostgreSQL on 5432 was preserved and project PostgreSQL uses 5433).

### FOUNDATION-003: API conventions and OpenAPI
**Files/modules affected:** apps/api/src/common/, apps/api/src/main.ts, OpenAPI configuration.
Description: Nest bootstrap, `/api/v1`, validation, error envelope, request IDs, Swagger. Priority: P0. Dependencies: FOUNDATION-001. Deliverables: API shell and spec endpoint. Acceptance: invalid DTO and unknown route return consistent errors. Tests: API contract tests. Status: COMPLETED (2026-10-31; 5 API checks including live HTTP smoke passed).

### FOUNDATION-004: Frontend shell/design tokens
**Files/modules affected:** apps/web/src/app/, apps/web/src/components/, apps/web/src/styles/.
Description: Next shell, routing, original design tokens, sidebar/topbar and state patterns. Priority: P1. Dependencies: FOUNDATION-001. Deliverables: responsive authenticated-layout shell. Acceptance: keyboard accessible nav and mobile reflow. Tests: component accessibility/smoke. Status: COMPLETED (2026-10-31; semantic navigation, skip link, visible keyboard focus, mobile menu/reflow; production build passed).

### FOUNDATION-005: CI, logs and health checks
**Files/modules affected:** .github/workflows/, apps/api/src/health/, apps/api/src/observability/.
Description: GitHub Actions CI, structured logs, health endpoints, dependency scanning. Priority: P0. Dependencies: FOUNDATION-001–003. Deliverables: workflow and operational baseline. Acceptance: CI blocks failed checks; logs carry request ID and omit secrets. Tests: CI workflow and log redaction checks. Status: COMPLETED (2026-10-31; CI YAML parses; request logs contain request IDs and omit URL/body; liveness passes and readiness accurately reports unconfigured service adapters).

## Phase 4: identity and locations

### FOUNDATION-006: User authentication and sessions
**Files/modules affected:** apps/api/src/identity/, apps/web/src/features/auth/, Prisma identity schema.
Description: Register/login/refresh/logout, verified email/session revocation per approved auth choice. Priority: P0. Dependencies: FOUNDATION-003, ARCH-002 (provisional baseline DEC-007 authorized). Deliverables: auth tables/API/UI. Acceptance: session lifecycle and rate limits work. Tests: auth integration/security tests. Status: COMPLETED (persistent auth migration applied; live PostgreSQL auth lifecycle and automated concurrency/reuse/rollback/expiry/logout tests pass; rate-limit behavior unit-tested. Same-origin proxy flow was previously smoke-tested. Production email, distributed rate limiting and interactive browser reload remain production/integration hardening, not claims of completion).

### FOUNDATION-007: Organization and membership
**Files/modules affected:** `apps/api/src/organizations/`, `apps/web/src/app/organizations/`, Prisma organization/membership schema.
Description: Create organizations, memberships, invite/accept/deactivate. Priority: P0. Dependencies: FOUNDATION-006. Deliverables: tenant context resolver. Acceptance: membership required for every organization-scoped route. Tests: tenant isolation tests. Status: COMPLETED (membership guard applies to organization-scoped routes; database-backed organization selection, cross-tenant denial, one-time concurrent invitation acceptance, email binding, expiry, deactivation and owner/member isolation tests pass. Authenticated organization management and invitation UI is present).

### FOUNDATION-008: RBAC and warehouse scope
**Files/modules affected:** apps/api/src/access/, apps/web/src/features/access/, Prisma RBAC schema.
Description: Roles/capabilities and per-warehouse grants. Priority: P0. Dependencies: FOUNDATION-007. Deliverables: guards/policy UI. Acceptance: deny by default and scope enforced in API. Tests: role × endpoint × scope matrix. Status: COMPLETED (role capability map covers every role/capability pair and denies unknown roles; organization routes declare required capabilities; member role and warehouse grant APIs/UI implemented; scoped warehouse list/detail endpoints use active membership and grant guards. PostgreSQL tests verify cross-organization grants fail, granted warehouses are visible, foreign/archived warehouses are denied, and grants are persisted. Full UI browser E2E remains pending).

### FOUNDATION-009: Branch and warehouse management
**Files/modules affected:** apps/api/src/locations/, apps/web/src/features/locations/, Prisma branch/warehouse schema.
Description: Branch/warehouse CRUD, active defaults, scope. Priority: P0. Dependencies: FOUNDATION-007–008. Deliverables: tables/API/settings screens. Acceptance: locations tenant-owned and referenced documents cannot cross tenants. Tests: CRUD/auth/integrity tests. Status: COMPLETED (additive Branch/AuditEvent schema and nullable composite-tenant warehouse-to-branch FK; tenant-scoped searchable/paginated APIs; RBAC and per-warehouse management guards; create/edit/archive/activate UI; transactional audit events. Migration `20261101150000_branches_and_location_audit` applied without reset; PostgreSQL integration suite passed 9/9, covering tenant integrity, lifecycle, audit and scope. Unit checks and manual Chrome registration/verification/login, organization setup, branch/warehouse creation and persistence passed. Fixed session restoration to retain the selected organization membership role so management controls render).

## Phase 5: catalog

### INV-001: Units and product categories
**Files/modules affected:** apps/api/src/catalog/, Prisma unit/category schema.
Description: Tenant units, product-specific base conversion and hierarchical categories. Priority: P0. Dependencies: FOUNDATION-009, ARCH-001. Deliverables: models/API/validation. Acceptance: valid conversion and same-tenant references enforced. Tests: unit conversion and tenant tests. Status: IN_PROGRESS. Added tenant-owned Unit and hierarchical Category models with tenant parent FK, unique keys, indexes and precision validation. Product-specific conversion APIs enforce positive factors, per-product/unit uniqueness and tenant-scoped references. Disposable PostgreSQL integration verifies conversion uniqueness and rejects a foreign-organization unit. Authenticated UI/browser workflow remains unverified.
**Files/modules affected:** apps/api/src/catalog/products/, Prisma product schema and migrations.
Description: Product type, normalized SKU, barcode, prices/cost, base unit, archive. Priority: P0. Dependencies: INV-001. Deliverables: Prisma migration and indexes. Acceptance: unique SKU policy; Decimal-safe money; no direct quantity field writes. Tests: schema and validation tests. Status: IN_PROGRESS. Disposable PostgreSQL integration verifies product create/list/detail/edit/archive, normalized SKU/barcode uniqueness, Decimal-safe cost/prices and conversions. Authenticated API and browser workflows remain unverified.

### INV-003: Product catalog APIs and table
**Files/modules affected:** apps/api/src/catalog/products/, apps/web/src/features/products/.
Description: Create/edit/archive/search/filter/paginate products. Priority: P0. Dependencies: INV-002, FOUNDATION-004. Deliverables: API/UI. Acceptance: search SKU/name/barcode and enforce tenant scope. Tests: API/filter/auth/UI tests. Status: IN_PROGRESS. Disposable PostgreSQL service integration verifies product lifecycle, search across name/SKU/barcode, uniqueness, and cross-organization denial. The authenticated `/products` and detail/conversion pages use real APIs; browser-level workflow remains unverified.

### INV-004: Product import/opening balance workflow
**Files/modules affected:** apps/api/src/imports/, apps/api/src/inventory/opening-balances/, apps/web/src/features/imports/.
Description: Preview CSV, validate duplicates and commit opening stock through ledger. Priority: P1. Dependencies: INV-003, INV-006. Deliverables: import job and preview screen. Acceptance: failed rows do not partially post; opening balances trace to source. Tests: file validation/idempotency/rollback tests. Status: NOT_STARTED.

## Phase 6: inventory engine

### INV-005: Inventory movement and audit schema
**Files/modules affected:** apps/api/src/inventory/ledger/, Prisma stock movement and audit schema.
Description: Immutable movements, document refs, actor, cost snapshot, idempotency and audit. Priority: P0. Dependencies: INV-002, ARCH-001. Deliverables: ledger migration/repository. Acceptance: posted movement cannot be edited/deleted; tenant composite constraints. Tests: append-only and integrity tests. Status: COMPLETED (2026-11-06). Disposable PostgreSQL integration deployed the migrations and confirmed movement UPDATE and DELETE are rejected by the database trigger; tenant-scoped references, document/cost data, idempotency, and outbox persistence were exercised through postings. The generated test schema was dropped after the run; owner data was not modified.

### INV-006: Balance projection and posting service
**Files/modules affected:** apps/api/src/inventory/balances/, apps/api/src/inventory/posting/, Prisma balance schema.
Description: Transactional balance update/reconciliation API, row locking and conflict policy. Priority: P0. Dependencies: INV-005. Deliverables: domain service and reconciliation query. Acceptance: projection equals ledger; duplicate idempotency returns same result. Tests: concurrency, rollback, reconciliation. Status: COMPLETED (2026-11-06). Disposable PostgreSQL integration verified opening stock, receipts, fulfillment, weighted-average cost, reservation-floor enforcement, idempotent replay and conflicting payload rejection, failed-outbox rollback, stale competing count safety, and balance-to-ledger reconciliation. Transfer batch posting and reservation lifecycle remain separate future tasks.

### INV-007: Stock adjustment/count
**Files/modules affected:** apps/api/src/inventory/adjustments.*, apps/web/src/app/inventory/.
Description: Draft count, delta preview, reason, post and movement history. Priority: P0. Dependencies: INV-006, INV-003. Deliverables: adjustment API/UI. Acceptance: never edit balance directly; permission and reason enforced. Tests: adjustment/auth/audit tests. Status: IN_PROGRESS. The additive schema stores count snapshots with tenant-composite references; APIs enforce inventory capability and warehouse scope, validate precision and reason, and atomically post through the ledger. UI supports count entry/history/posting and immutable movement history. Disposable PostgreSQL tests verify posting, stale snapshot safety, reserve floor, audit/outbox, rollback, reconciliation and movement history. Remaining: live authenticated API/browser workflow and explicit foreign-tenant/warehouse denial checks for adjustment endpoints.

### INV-008: Stock transfer lifecycle
**Files/modules affected:** apps/api/src/inventory/transfers/, apps/web/src/features/inventory/transfers/.
Description: Draft, dispatch, in-transit, receive/shortage reconciliation. Priority: P0. Dependencies: INV-006, FOUNDATION-009. Deliverables: transfer APIs and screens. Acceptance: source/outbound and destination/inbound ledger entries are atomic and idempotent. Tests: partial receipt, concurrency, rollback, scope. Status: IN_PROGRESS (2026-11-08). Added tenant-composite transfer/line/dispatch/receipt/history models and applied additive migrations `20261107130000_stock_transfers` and `20261108100000_stock_transfer_constraints`; database checks enforce distinct warehouses and positive quantities. API supports draft create, list/search/status/warehouse filter/pagination, detail/history, submit, pre-dispatch cancel, idempotent dispatch and partial/full idempotent receive. Posting engine owns transfer movement/balance changes and weighted-average cost. Added register, filters, document detail/history and actions. Isolated PostgreSQL suite verifies partial/full receive, over-receive rejection, dispatch replay, concurrent competing receipts and dispatches, outbox rollback, tenant denial and warehouse grants. Remaining: authenticated browser workflow is unverified (browser control disabled in Work settings) and final acceptance review. Do not mark complete until remaining acceptance is verified. Reservation lifecycle is part of SALES-002 (dependencies: SALES-001, INV-006, ARCH-001), not a separate inventory task.

### INV-009: Reorder rules and alerts
**Files/modules affected:** apps/api/src/inventory/reordering/, apps/web/src/features/inventory/reordering/, worker jobs.
Description: Per-warehouse thresholds, projected quantity and low-stock queue/email. Priority: P1. Dependencies: INV-006, PROCUREMENT-002. Deliverables: rules, list and job. Acceptance: formula visible, no duplicate alerts, no automatic PO submission. Tests: formula/cadence/tenant job tests. Status: NOT_STARTED.

### INV-010: Barcode-compatible workflows
**Files/modules affected:** apps/web/src/components/barcode/, apps/web/src/features/receiving/, apps/web/src/features/fulfillment/.
Description: Scanner keyboard input, barcode lookup and camera API feasibility for mobile web. Priority: P1. Dependencies: INV-003, PROCUREMENT-003, SALES-003. Deliverables: scan component/spec. Acceptance: same scanned product can be added repeatedly and quantity increments; keyboard operation works. Tests: component/browser workflow tests. Status: NOT_STARTED.

## Phase 7: procurement

### PROCUREMENT-001: Supplier directory
**Files/modules affected:** apps/api/src/procurement/, apps/web/src/features/procurement/, Prisma procurement schema.
Description: Supplier CRUD/search/contact/terms. Priority: P0. Dependencies: FOUNDATION-009. Deliverables: model/API/UI. Acceptance: tenant scope and referenced supplier archive rules. Tests: CRUD/auth tests. Status: IN_PROGRESS. Added tenant-owned Supplier model, tenant-unique normalized name, contact/email/phone/website/address and notes fields, additive migration `20261106190000_supplier_directory` applied to inventory_dev, CRUD/detail/search/pagination/archive/audit API, procurement capability guards, validated DTOs and `/suppliers` UI. PostgreSQL service integration verifies lifecycle, uniqueness, search, tenant denial and audit; DTO validation tests cover contact formats. Authenticated browser workflow remains unverified.

### PROCUREMENT-002: Purchase order lifecycle
**Files/modules affected:** apps/api/src/procurement/, apps/web/src/features/procurement/, Prisma procurement schema.
Description: Draft/submit/cancel with line prices, expected date and destination. Priority: P0. Dependencies: PROCUREMENT-001, INV-003. Deliverables: PO model/API/UI. Acceptance: valid state transitions, totals are Decimal and no stock posts before receipt. Tests: state/permission/tenant tests. Status: IN_PROGRESS. Added additive tenant-composite PO/line schema, atomic organization-scoped PO numbering, Decimal totals and unit-cost conversion snapshots, warehouse-scoped CRUD/search/pagination, draft update, submit/cancel transitions, audit history, DTO validation, and responsive list/create/detail/edit UI. Isolated PostgreSQL integration verifies draft editing, unique sequence progression, tenant denial, submission, cancellation and no stock posting before receipt. Authenticated browser workflow and additional role/warehouse denial UI checks remain pending.

### PROCUREMENT-003: Goods receiving and partial deliveries
**Files/modules affected:** apps/api/src/procurement/, apps/web/src/features/procurement/, Prisma procurement schema.
Description: Post one or more receipts, quantities/date/UoM, update outstanding PO line. Priority: P0. Dependencies: PROCUREMENT-002, INV-006. Deliverables: receipt API/UI. Acceptance: duplicate receive idempotent; cannot over-receive unless approved policy; movement atomic with receipt status. Tests: partial, duplicate, concurrency, rollback. Status: IN_PROGRESS. Added receipt document/line schema with tenant-composite FKs, quantity checks and idempotency; PO-locked over-receive checks; transaction-composable inventory posting; partial/full status updates; ledger/balance/cost/audit/outbox posting; receipt history and receive UI with retry-stable idempotency key. Isolated PostgreSQL integration verifies partial/full receive, duplicate replay, excess rejection, competing concurrent receives, outbox-failure rollback, cost/balance movements and audit state. Authenticated browser and live API workflow remain unverified.

### PROCUREMENT-004: Supplier payment records
**Files/modules affected:** apps/api/src/procurement/, apps/web/src/features/procurement/, Prisma procurement schema.
Description: Record payable/payment evidence and balances. Priority: P2. Dependencies: PROCUREMENT-002. Deliverables: finance record model/API. Acceptance: allocations reconcile and cannot silently erase posted payment. Tests: allocation/Decimal/audit tests. Status: NOT_STARTED.

## Phase 8: sales

### SALES-001: Customer directory
**Files/modules affected:** apps/api/src/sales/, apps/web/src/features/sales/, Prisma sales schema.
Description: Customer records, addresses and terms. Priority: P0. Dependencies: FOUNDATION-009. Deliverables: customer model/API/UI. Acceptance: tenant scope and archive constraints. Tests: CRUD/access tests. Status: IN_PROGRESS (2026-11-08). Added customer type/status, addresses, normalized optional email and tenant-scoped uniqueness, additive migration `20261108090000_customer_directory`, CRUD/search/pagination/archive/audit APIs with sales capability guards, customers register/create/detail/edit/archive UI, and isolated PostgreSQL lifecycle/tenant/uniqueness tests. Integration and quality checks pass; authenticated browser workflow remains unverified because browser control is disabled in Work settings.

### SALES-002: Sales order and reservation lifecycle
**Files/modules affected:** apps/api/src/sales/, apps/web/src/features/sales/, Prisma sales schema.
Description: Draft/confirm/cancel, lines, pricing snapshots and inventory reservations. Priority: P0. Dependencies: SALES-001, INV-006, ARCH-001. Deliverables: API/model/UI. Acceptance: policy prevents oversell under race; cancellation releases reservation once. Tests: two simultaneous last-unit orders, state transitions, tenant scope. Status: NOT_STARTED.

### SALES-003: Pick and partial fulfillment
**Files/modules affected:** apps/api/src/sales/, apps/web/src/features/sales/, Prisma sales schema.
Description: Pick/fulfill quantities; preserve backorder; commit stock outflow. Priority: P0. Dependencies: SALES-002, INV-010. Deliverables: fulfillment records and workflow. Acceptance: shipped <= picked <= ordered; movements exactly once. Tests: partial, retry, rollback, authorization. Status: NOT_STARTED.

### SALES-004: Invoice and payment records
**Files/modules affected:** apps/api/src/sales/, apps/web/src/features/sales/, Prisma sales schema.
Description: Invoice numbering/rendering and manual full/partial/multiple payment allocations. Priority: P0. Dependencies: SALES-002. Deliverables: invoice/payment APIs and printable PDF. Acceptance: totals and balances use Decimal; paid amount cannot exceed due without credit/refund workflow. Tests: rounding/allocation/audit tests. Status: NOT_STARTED.

### SALES-005: Returns and credits
**Files/modules affected:** apps/api/src/sales/, apps/web/src/features/sales/, Prisma sales schema.
Description: Return inspection/restock/discard and refund/credit documents. Priority: P2. Dependencies: SALES-003, SALES-004, INV-006. Deliverables: returns workflow. Acceptance: reversal movement and credit link to original sale. Tests: returns after partial fulfillment/payment. Status: NOT_STARTED.

## Phase 9: reporting

### REPORT-001: Inventory and movement reports
**Files/modules affected:** apps/api/src/reporting/, apps/web/src/features/reports/, worker exports.
Description: Stock summary, movement, valuation and low-stock reports. Priority: P0. Dependencies: INV-006, INV-009. Deliverables: query APIs/screens/export. Acceptance: tenant/location scoped, report totals reconcile to ledger cutoff. Tests: fixture reconciliation/performance. Status: NOT_STARTED.

### REPORT-002: Purchase and sales reports/dashboard
**Files/modules affected:** apps/api/src/reporting/, apps/web/src/features/reports/, worker exports.
Description: KPIs and purchase/sales summaries by date, branch, status, customer/supplier. Priority: P0. Dependencies: PROCUREMENT-003, SALES-004. Deliverables: report pages. Acceptance: documented metric definitions and stable filters. Tests: report fixtures/query scope. Status: NOT_STARTED.

### REPORT-003: Async CSV export
**Files/modules affected:** apps/api/src/reporting/, apps/web/src/features/reports/, worker exports.
Description: Queue scoped report exports and securely serve expiring download. Priority: P1. Dependencies: FOUNDATION-002, REPORT-001. Deliverables: export job. Acceptance: formula injection neutralized, tenant access checked at download, retry-safe. Tests: job failure/retry/access tests. Status: NOT_STARTED.

## Phase 10: quality and release

### QUALITY-001: End-to-end operational workflow
**Files/modules affected:** tests/e2e/, tests/security/, docs/operations/.
Description: Test receive → stock → transfer → sale → fulfill/payment → report. Priority: P0. Dependencies: report and workflow tasks. Deliverables: E2E suite. Acceptance: deterministic scenario and audit/ledger reconciliation. Tests: named E2E scenario. Status: NOT_STARTED.

### QUALITY-002: Security and tenant isolation review
**Files/modules affected:** tests/e2e/, tests/security/, docs/operations/.
Description: Threat review, cross-tenant tests, dependency scan, authorization audit. Priority: P0. Dependencies: all core modules. Deliverables: report and resolved findings. Acceptance: no unresolved critical/high findings before pilot. Tests: security suite. Status: NOT_STARTED.

### QUALITY-003: Backup/restore and operational runbooks
**Files/modules affected:** tests/e2e/, tests/security/, docs/operations/.
Description: Backup, restore, queue recovery and incident guide. Priority: P0. Dependencies: FOUNDATION-002, FOUNDATION-005. Deliverables: measured restore drill/runbook. Acceptance: restore RPO/RTO targets demonstrated. Tests: restore rehearsal. Status: NOT_STARTED.

### RELEASE-001: Pilot deployment and user acceptance
**Files/modules affected:** deployment configuration, docs/operations/, pilot feedback backlog.
Description: Deploy isolated pilot and validate actual user workflows/device/network. Priority: P0. Dependencies: QUALITY-001–003, PROD-002. Deliverables: pilot checklist and feedback backlog. Acceptance: named pilot users sign off on workflows; no unresolved data integrity issue. Tests: UAT. Status: NOT_STARTED.

### RELEASE-002: Production readiness and launch
**Files/modules affected:** deployment configuration, docs/operations/, pilot feedback backlog.
Description: Legal/accounting review, support/privacy/incident processes, subscription and production monitoring. Priority: P0. Dependencies: RELEASE-001. Deliverables: production runbook and release approval. Acceptance: owner approval and all release gates met. Tests: deployment/recovery/security signoff. Status: NOT_STARTED.

## Phase 11–12: later roadmap

### P2-001: Traceability, returns and approvals
**Files/modules affected:** apps/api/src/inventory/traceability/, apps/api/src/sales/returns/, apps/api/src/procurement/approvals/.
Description: Add approved lot/serial/expiry, returns, PO approvals and enhanced costing. Priority: P2. Dependencies: RELEASE-001, PROD-001. Affected inventory/procurement/sales. Deliverables: chosen vertical slice. Acceptance: selected workflow has approved domain rules, traceable ledger postings and role-scoped UI. Tests: define unit, transaction, tenant-isolation and workflow cases after selecting the vertical slice. Status: NOT_STARTED.

### P2-002: Accounting and local payment integrations
**Files/modules affected:** apps/api/src/integrations/accounting/, apps/api/src/integrations/payments/, outbox workers.
Description: Build outbox-based connector(s) selected by pilot/customer demand. Priority: P2. Dependencies: P2-001, RELEASE-001. Deliverables: connector with sync dashboard/replay. Acceptance: idempotent, reconcilable and operator-visible failures. Tests: sandbox integration/replay. Status: NOT_STARTED.

### P2-003: E-commerce/shipping integrations
**Files/modules affected:** apps/api/src/integrations/ecommerce/, apps/api/src/integrations/shipping/, outbox workers.
Description: Integrate prioritized storefronts/carriers. Priority: P2. Dependencies: P2-002. Deliverables: connector(s). Acceptance: inventory/order conflict policy explicit. Tests: contract/replay/rate-limit tests. Status: NOT_STARTED.

### P3-001: Manufacturing BOM and work orders
**Files/modules affected:** apps/api/src/manufacturing/, apps/web/src/features/manufacturing/, Prisma BOM/work-order schema.
Description: Component issue, build/complete, labor/material costing. Priority: P3. Dependencies: P2 traceability, stable ledger. Deliverables: approved BOM/work-order entities, APIs and operator workflow. Acceptance: BOM quantities and completed output reconcile. Tests: unit and transaction coverage for component issue, output, scrap and reversal. Status: NOT_STARTED.

### P3-002: B2B customer portal
**Files/modules affected:** apps/api/src/portal/, apps/web/src/app/portal/, customer authorization policies.
Description: Customer identity, authorized catalog/prices, cart/order submission. Priority: P3. Dependencies: Sales, auth hardening, pricing rules. Deliverables: customer portal identity, catalog/order UI and scoped API. Acceptance: customer cannot access another customer's terms/orders. Tests: portal isolation and order tests. Status: NOT_STARTED.

### P3-003: Offline/mobile workflow
**Files/modules affected:** apps/web/src/features/mobile-sync/, apps/api/src/sync/, offline conflict/idempotency services.
Description: Evaluate queued mobile receive/count/pick and conflict resolution. Priority: P3. Dependencies: stable API/inventory events. Deliverables: approved offline command protocol, sync UI and conflict-resolution flow. Acceptance: sync is idempotent and conflicts are visible. Tests: duplicate, out-of-order and replayed command tests across network recovery. Status: NOT_STARTED.
