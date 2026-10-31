# Pending tasks

1. **FOUNDATION-002 (blocked at runtime):** Start Docker; verify PostgreSQL, Redis and S3Mock health. Compose/config/env checks already pass.
2. **FOUNDATION-006 (in progress):** Apply and verify the identity migration against PostgreSQL; add database integration tests for transaction/concurrent refresh and database failures; configure production email delivery; replace/augment process-local auth throttling with shared rate limiting before horizontal production use; add browser E2E coverage. Stable Prisma 7.10.1 schema/provider, auth routes and pages, development mail interface, and unit/API contract tests exist.
3. **PROD-002 (in progress):** Record owner-provided provisional inventory/auth defaults. Still resolve target segment/brand, tax/invoice compliance, SaaS pricing and subscription limits before customer commitments.
4. **ARCH-001 (in progress):** Apply provisional no-negative, weighted-average, confirmation-reservation and immutable-ledger decisions; define complete state transitions and transaction invariants as inventory implementation is built.
5. **ARCH-002 (in progress):** Implement strict organization-scoped RBAC. Keep RLS and privileged support access as security review gates; don't relax tenant boundaries.
6. **FOUNDATION-007 (in progress):** Apply and verify the organization migration; run PostgreSQL tenant isolation, invitation acceptance/concurrency and membership deactivation tests; add full HTTP route authorization tests. Schema, API, guards, invitations and web organization management are implemented; current tenant checks are fake-backed only.
7. FOUNDATION-008 RBAC; FOUNDATION-009 branch/warehouse, in dependency order after FOUNDATION-007 verification.
8. Then INV-001 onward for catalog and inventory; procurement and sales remain dependent on product/ledger foundations.

Full numbered task/status ledger: `docs/implementation/task-breakdown.md`.
