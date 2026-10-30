# Decisions log

## Confirmed for planning
- **DEC-001 (2026-10-31):** Start with a TypeScript modular monolith, Next.js + NestJS + PostgreSQL/Prisma; Redis/BullMQ for jobs; Docker/AWS-compatible runtime. Rationale: requested preferred stack and simpler transactional inventory MVP.
- **DEC-002 (2026-10-31):** No application code before owner plan review/approval. Explicit initial task is research/planning only.
- **DEC-003 (2026-10-31):** REA webpage inspection blocked by unreachable default CDP endpoint. Use official public docs and label fallback; do not reconfigure Chrome.
- **DEC-004 (2026-10-31):** PROD-001 is the first eligible incomplete task; prepare an interview protocol but do not fabricate participant evidence or proceed to dependent policy approval without interviews.
- **DEC-005 (2026-10-31):** Owner explicitly authorized implementation based on the existing plan. FOUNDATION-001 may proceed as isolated toolchain scaffolding after DOC-001; unresolved product/security policies remain gates for business-domain implementation. Use npm workspaces for the initial monorepo unless a concrete project constraint appears; this does not change the approved modular-monolith architecture.
- **DEC-006 (2026-10-31):** Owner stated the research/planning phase is complete and authorized implementation. Pre-pilot interviews are deferred to pilot validation; no interview findings are claimed. This closes PROD-001 planning deliverables without claiming interviews occurred.

## Proposed, not approved
- MVP NGN base currency and Africa/Lagos timezone defaults.
- Strict prevention of negative available stock by default.
- Moving weighted average costing in MVP.
- Confirmed sales order reserves stock; dispatch/fulfillment posts outflow.
- Shared Postgres with organization ID, composite constraints and optional RLS.

## Open decisions
See numbered owner approvals in `docs/product/product-requirements.md` and task dependencies. Record owner, date, alternatives, rationale and consequences when resolved.
