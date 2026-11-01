# Pending tasks

1. **FOUNDATION-006 (in progress):** Identity migration is applied and live PostgreSQL authentication passed direct and proxied API lifecycle smoke. Add automated database transaction/concurrent-refresh tests; run browser E2E for refresh/session restoration; configure production email and shared rate limiting before production.
2. **FOUNDATION-007 (in progress):** Organization migration is applied. Add database-backed tenant isolation, invitation email binding/expiry/one-time acceptance and competing-acceptance tests, membership deactivation tests, and full HTTP route authorization tests.
3. **PROD-002 (in progress):** Record owner-provided provisional inventory/auth defaults. Still resolve target segment/brand, tax/invoice compliance, SaaS pricing and subscription limits before customer commitments.
4. **ARCH-001 (in progress):** Apply provisional no-negative, weighted-average, confirmation-reservation and immutable-ledger decisions; define complete state transitions and transaction invariants as inventory implementation is built.
5. **ARCH-002 (in progress):** Implement strict organization-scoped RBAC. Keep RLS and privileged support access as security review gates; don't relax tenant boundaries.
6. **FOUNDATION-008:** RBAC after FOUNDATION-007 tenant boundary verification; then FOUNDATION-009 branch/warehouse.
7. Then INV-001 onward for catalog and inventory; procurement and sales remain dependent on product/ledger foundations.

Full numbered task/status ledger: `docs/implementation/task-breakdown.md`.
