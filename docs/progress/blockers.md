# Blockers and constraints

## Implementation follow-ups

- **Browser E2E:** Browser automation is unavailable in this session. Auth API/proxy behavior and RBAC database behavior were tested, but browser reload and role/grant settings interactions remain unverified.
- **Docker observability:** A non-escalated Docker socket check was denied. The local PostgreSQL integration suite connected and passed; Compose container health was not rechecked during this session.
- **Production email:** Only the development/test delivery adapter is configured. Production email provider and operational delivery behavior remain open.
- **Distributed rate limits:** Authentication throttling is process-local and does not coordinate multiple API replicas. Add shared storage before horizontal production operation.
- **FOUNDATION-009:** Branch/warehouse CRUD, branch relationships, and location UI are not implemented yet. They are the next roadmap task.
- **Build artifacts:** `apps/web/next-env.d.ts` and `apps/web/tsconfig.tsbuildinfo` are modified generated files in the worktree. Inspect before cleanup; preserve unrelated user changes.

## Planning constraints

- **REA CDP unavailable:** Browser target discovery at `127.0.0.1:9222` was unavailable. Public official pages and visible browser evidence were used as documented; no Chrome reconfiguration was done.
- **Material decisions pending:** target segment/brand, tax and statutory invoice scope, subscription pricing/limits, production data residency/hosting commitments, MFA enforcement, RLS and privileged support access remain open in `decisions.md`. Owner defaults are provisional assumptions, not validated requirements.
- **Interview evidence deferred:** the protocol exists; interviews are deferred to pilot validation and no participant findings are claimed.
