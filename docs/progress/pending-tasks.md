# Pending tasks

1. **PROD-002 (in progress):** Confirm target segment/brand, tax/invoice compliance, SaaS pricing and subscription limits before customer commitments. Provisional inventory/auth defaults are not validated business requirements.
2. **ARCH-002 (in progress):** Resolve RLS and privileged support access. Tenant-scoped RBAC baseline is implemented; MFA enforcement remains a later policy decision.
3. **FOUNDATION-006 production hardening:** Configure production email and shared/distributed rate limiting; add automated browser E2E for session restore and role/grant workflows.
4. **INV-001 (implementation present; verification pending):** Product-specific conversion list/create and UI are implemented. Apply `20261102113000_products_and_unit_conversions` safely and verify PostgreSQL tenant/integrity behavior and conversion validation before completion.
5. **INV-002/003 (implementation present; verification pending):** Product create/list/detail/edit/archive and searchable paginated UI/APIs are implemented. Apply migration and verify authenticated end-to-end behavior, constraints, and tenant isolation.
6. **INV-005 (schema present; verification pending):** Apply ledger/idempotency/outbox migration `20261102143000_inventory_ledger_schema`; verify composite references and immutable movement trigger.
7. **INV-006 (implementation present; verification and extensions pending):** Apply `20261102150000_inventory_balance_projection`; verify posting/idempotency/reconciliation on PostgreSQL; add atomic transfer-batch and reservation posting before completion.

Full numbered task/status ledger: `docs/implementation/task-breakdown.md`.
