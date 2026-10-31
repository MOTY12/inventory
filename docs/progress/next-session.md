# Next session handoff

## Current checkpoint (2026-10-31, Africa/Lagos)
Branch `develop`, HEAD `e8fe304` (`feat(auth): add password and token primitives`), one commit ahead of `origin/develop`. Preserve uncommitted checkpoint corrections in `current-state.md`, `next-session.md` and `session-log.md`, plus pre-existing changes in `apps/web/next-env.d.ts` and `completed-tasks.md`. No resets or branch changes.

## Task state
- Completed: DOC-001, PROD-001 (interviews explicitly deferred to pilot), FOUNDATION-001, FOUNDATION-003, FOUNDATION-004, FOUNDATION-005.
- Blocked: FOUNDATION-002 runtime health; Docker socket `/Users/newuser/.docker/run/docker.sock` remains unavailable. Compose definition/config and environment validation were already verified earlier. FOUNDATION-006 persistence is blocked on stable Prisma CLI installation and PostgreSQL verification.
- In progress: PROD-002, ARCH-001 and ARCH-002. Owner supplied provisional behavior in DEC-007. FOUNDATION-006 has tested security primitives only; there are no auth endpoints or persistence yet.
- 47 roadmap tasks total: 6 complete, 2 blocked, 3 in progress, 36 not started.

## Owner-directed provisional defaults
See DEC-007/008 in `docs/progress/decisions.md`: weighted-average costing, no negative stock by default, reservation on sales-order confirmation, immutable ledger, email/password, JWT access/rotating refresh, MFA planned but deferred, strict organization scoping/RBAC, configurable cloud region/storage, no production region assumption. These are assumptions, not validated customer requirements. Tax/invoice compliance, pricing, target segment/brand, data residency commitments, RLS and support access remain release/security review items.

## Exact next steps
1. Read startup docs and inspect `git status --short --branch`, `git diff --check`, `git log -5 --oneline`. Preserve current changes.
2. Retry `docker info --format '{{.ServerVersion}}'` and `docker compose ps`; if Docker starts, run `docker compose up -d`, verify all three services healthy, and complete FOUNDATION-002. If unavailable, keep it blocked.
3. Resume FOUNDATION-006. Stable Prisma CLI 7.9.1 was selected from official release status, but its install escalation was rejected by the approval gate. No Prisma dependency is currently present. Prisma 8 RC and the unused mismatched Client were removed. Do not use an RC or invent a storage fallback. Obtain an allowed stable ORM install path, then add schema/migrations, Prisma service, and PostgreSQL-backed user/session repositories.
4. Wire Argon2id/JWT/refresh-token utilities into registration, login, verify-email, refresh rotation and logout endpoints; configure secret loading/rate limits/cookies and add integration tests. Access JWT TTL is 15 minutes; refresh persistence/expiry/rotation still need implementation.
5. Complete FOUNDATION-006 tests and update task docs. Then implement FOUNDATION-007 organizations/membership, FOUNDATION-008 RBAC, FOUNDATION-009 locations, followed by catalog and inventory in dependency order.
6. For Git commits, commit only verified milestones and only the files changed for that milestone; preserve unrelated existing work. Current `.git` writes may require an approval-gated command.

## Files changed in the auth milestone commit
- `apps/api/package.json`, `package-lock.json`: added `argon2` and `@nestjs/jwt`; attempted ORM install, then removed Prisma preview/client after stable CLI install was rejected. Inspect exact diff before continuing.
- `apps/api/src/identity/password-hasher.ts`: Argon2id hashing/verification using OWASP minimum config.
- `apps/api/src/identity/access-token.service.ts`: 15-minute HS256 tokens with issuer/audience, required 32-byte secret, subject/session/optional org claims.
- `apps/api/src/identity/refresh-token.ts`: 256-bit opaque refresh token generation and SHA-256 digest for storage.
- `apps/api/test/api-contract.test.mjs`: auth primitive tests in addition to existing API contract tests.
- `docs/progress/decisions.md`, `task-breakdown.md`, `blockers.md`, `pending-tasks.md`: provisional defaults and task blocker state are included in commit `e8fe304`. New checkpoint hash corrections in `current-state.md`, `next-session.md` and `session-log.md` are uncommitted.
- Existing uncommitted `apps/web/next-env.d.ts` came from prior Next tooling; preserve unless confirmed generated and safe to restore.

## Verification
- This continuation: `npm run build`, typecheck, lint, format, env validation passed; 10 non-listener tests passed, including Argon2id, JWT claims/secret scoping and refresh-token digest. Full `npm test` approval was rejected; sandbox listener test returned EPERM.
- Earlier foundation results are recorded in current state: 8-test complete suite and live API smoke passed before the auth-only changes.
- Docker health not verified. Stable Prisma CLI install request was rejected; no migration/schema has been created. Dependency audit must be rerun after final auth/ORM dependency selection.
