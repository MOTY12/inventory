# Decisions log

## Confirmed for planning
- **DEC-001 (2026-10-31):** Start with a TypeScript modular monolith, Next.js + NestJS + PostgreSQL/Prisma; Redis/BullMQ for jobs; Docker/AWS-compatible runtime. Rationale: requested preferred stack and simpler transactional inventory MVP.
- **DEC-002 (2026-10-31):** No application code before owner plan review/approval. Explicit initial task is research/planning only.
- **DEC-003 (2026-10-31):** REA webpage inspection blocked by unreachable default CDP endpoint. Use official public docs and label fallback; do not reconfigure Chrome.
- **DEC-004 (2026-10-31):** PROD-001 is the first eligible incomplete task; prepare an interview protocol but do not fabricate participant evidence or proceed to dependent policy approval without interviews.

## Proposed, not approved
- MVP NGN base currency and Africa/Lagos timezone defaults.
- Strict prevention of negative available stock by default.
- Moving weighted average costing in MVP.
- Confirmed sales order reserves stock; dispatch/fulfillment posts outflow.
- Shared Postgres with organization ID, composite constraints and optional RLS.

## Open decisions
See numbered owner approvals in `docs/product/product-requirements.md` and task dependencies. Record owner, date, alternatives, rationale and consequences when resolved.
