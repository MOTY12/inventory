# Pending tasks

1. **FOUNDATION-009 (next):** Implement tenant-safe branch and warehouse CRUD, location settings UI, and PostgreSQL scope/integrity tests. Dependencies FOUNDATION-007 and FOUNDATION-008 are complete.
2. **PROD-002 (in progress):** Confirm target segment/brand, tax/invoice compliance, SaaS pricing and subscription limits before customer commitments. Provisional inventory/auth defaults are not validated business requirements.
3. **ARCH-001 (in progress):** Define complete inventory state transitions and transaction invariants before ledger implementation.
4. **ARCH-002 (in progress):** Resolve RLS and privileged support access. Tenant-scoped RBAC baseline is implemented; MFA enforcement remains a later policy decision.
5. **FOUNDATION-006 production hardening:** Configure production email and shared/distributed rate limiting; run browser E2E for restore and session behavior.
6. Continue with INV-001 catalog and inventory tasks only after FOUNDATION-009 and applicable architecture gates are satisfied.

Full numbered task/status ledger: `docs/implementation/task-breakdown.md`.
