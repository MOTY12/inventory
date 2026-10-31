# Pending tasks

1. **FOUNDATION-002 (blocked at runtime):** Start Docker; verify PostgreSQL, Redis and S3Mock health. Compose/config/env checks already pass.
2. **FOUNDATION-006 (blocked):** Obtain an allowed stable Prisma CLI/Client installation path, add PostgreSQL identity/session schema and migrations, implement persisted registration/login/email verification/access token/refresh rotation/logout, then integration/security tests. Argon2id, JWT and opaque refresh-token primitives exist and have focused tests.
3. **PROD-002 (in progress):** Record owner-provided provisional inventory/auth defaults. Still resolve target segment/brand, tax/invoice compliance, SaaS pricing and subscription limits before customer commitments.
4. **ARCH-001 (in progress):** Apply provisional no-negative, weighted-average, confirmation-reservation and immutable-ledger decisions; define complete state transitions and transaction invariants as inventory implementation is built.
5. **ARCH-002 (in progress):** Implement strict organization-scoped RBAC. Keep RLS and privileged support access as security review gates; don't relax tenant boundaries.
6. FOUNDATION-007 organization/membership; FOUNDATION-008 RBAC; FOUNDATION-009 branch/warehouse, in dependency order.
7. Then INV-001 onward for catalog and inventory; procurement and sales remain dependent on product/ledger foundations.

Full numbered task/status ledger: `docs/implementation/task-breakdown.md`.
