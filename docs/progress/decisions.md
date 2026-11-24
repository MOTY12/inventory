# Decisions log

## Confirmed for planning
- **DEC-001 (2026-10-31):** Start with a TypeScript modular monolith, Next.js + NestJS + PostgreSQL/Prisma; Redis/BullMQ for jobs; Docker/AWS-compatible runtime. Rationale: requested preferred stack and simpler transactional inventory MVP.
- **DEC-002 (2026-10-31):** No application code before owner plan review/approval. Explicit initial task is research/planning only.
- **DEC-003 (2026-10-31):** REA webpage inspection blocked by unreachable default CDP endpoint. Use official public docs and label fallback; do not reconfigure Chrome.
- **DEC-004 (2026-10-31):** PROD-001 is the first eligible incomplete task; prepare an interview protocol but do not fabricate participant evidence or proceed to dependent policy approval without interviews.
- **DEC-005 (2026-10-31):** Owner explicitly authorized implementation based on the existing plan. FOUNDATION-001 may proceed as isolated toolchain scaffolding after DOC-001; unresolved product/security policies remain gates for business-domain implementation. Use npm workspaces for the initial monorepo unless a concrete project constraint appears; this does not change the approved modular-monolith architecture.
- **DEC-006 (2026-10-31):** Owner stated the research/planning phase is complete and authorized implementation. Pre-pilot interviews are deferred to pilot validation; no interview findings are claimed. This closes PROD-001 planning deliverables without claiming interviews occurred.
- **DEC-007 (2026-10-31):** Owner authorized provisional implementation defaults for core behavior: moving weighted-average costing; negative available stock disabled by default; reserve stock when an order is confirmed; immutable stock movement records; email/password with JWT access tokens and rotating refresh sessions; design for MFA but defer enforcement; strict organization isolation and organization-scoped RBAC; cloud-ready configurable region/storage; no fixed production region. These are implementation assumptions, not validated customer requirements. Keep currency/tax, pricing, segment fit, data-residency commitments, MFA enforcement and production security claims subject to validation/review.
- **DEC-008 (2026-10-31):** Begin persistence on the approved PostgreSQL/Prisma architecture. Keep tenant scope explicit in command/query context and enforce composite organization keys/foreign keys; do not introduce a new database or identity provider. Database-level RLS and privileged support access remain deferred for security review; application queries must fail closed and never infer tenant scope from request bodies.
- **DEC-009 (2026-11-01, provisional implementation default):** When a non-admin member with location-management capability creates a warehouse, automatically grant that creator access to the new warehouse only. The API stores the grant in the same transaction as warehouse creation and audit logging. This allows scoped location managers to use what they create without broadening access to other warehouses. It is an implementation default, not a validated business requirement; revisit before pilot if the owner-approval workflow requires a different assignment rule.

## Provisional implementation assumptions (not validated business requirements)
- Moving weighted-average costing, strict no-negative-available default, and reservation on order confirmation per DEC-007.
- Email/password, JWT access and rotating/revocable refresh sessions; MFA designed for but enforcement deferred.
- Organization-scoped data with composite constraints and mandatory tenant context. RLS/support access are deferred review items.
- Configurable deployment region; no production data-residency claim.

## Open decisions
Remaining material decisions: initial customer segment, product name/branding, tax/invoice compliance, pricing/subscription limits, production hosting/data-residency commitments, MFA enforcement, RLS and support access. Use the defaults above only for reversible implementation; flag changes before customer commitments or changes to the security boundary.

## SALES-004 owner decision proposal (2026-11-24; approval pending)

The recommended MVP scope in the SALES-004 execution brief is not itself approval of financial or statutory policy. Before implementation, please approve or specify:

1. **Invoice timing and numbering:** issue manually from an eligible sales order; organization-wide sequential `INV-000001` numbering, no reuse after issue; confirm any fiscal-year reset/prefix requirement.
2. **Currency and price basis:** one immutable currency per invoice inherited from the order; confirm whether line prices are tax-exclusive and whether multi-currency payment is disallowed.
3. **Tax, discounts and rounding:** do not assume a statutory rate. Confirm supported tax types/inclusive-vs-exclusive treatment, invoice-level/line discounts, and the required currency rounding rule after accountant/legal review.
4. **Payments:** manual records only (no gateway), exact-decimal positive amounts, multiple partial payments, explicit invoice allocation, same-currency only, reject overpayment; confirm supported payment methods and whether unallocated customer credits are out of scope.
5. **Issued documents and corrections:** issued invoice snapshots are immutable; cancellation uses a void/credit-note policy and never recycles a number; payment corrections use an audited reversal entry, never edit/delete. Confirm whether only unpaid invoices may be voided and what document is required after payment.
6. **Accounting/compliance boundary:** invoice/payment records are operational subledger evidence, not a general ledger or tax-compliance certification. Confirm this MVP boundary and require Nigerian accountant/legal review of statutory invoice fields before pilot use.

Until these decisions are approved, SALES-004 and dependent REPORT-002 remain blocked. No invoice/payment schema, tax calculation, numbering, or financial behavior has been implemented on the basis of this proposal.
