# Blockers and constraints

## Active implementation blocker
- **FOUNDATION-002 runtime verification:** `docker compose config --quiet` passes, but Docker commands cannot connect to `unix:///Users/newuser/.docker/run/docker.sock`; the Docker daemon is not running. The Compose files cannot be marked complete until all service health checks are confirmed. Start the configured Docker engine and run the exact commands in `docs/progress/next-session.md`.
- **FOUNDATION-006 persistence tooling:** stable Prisma CLI 7.9.1 was selected from official release documentation. The approval-gated install request was rejected, so no stable Prisma CLI is installed. Prisma 8 RC and the mismatched Client were removed; no persistence fallback was substituted. The stable package install needs an allowed path before schema/migrations/repositories can be built and verified.
- **FOUNDATION-006 verification:** an approval-gated rerun of `npm test` was also rejected. Ten non-listener tests passed; live API integration had passed on the previous implementation before auth-only changes. Re-run the complete suite when the port-binding command is allowed.
- **Dependency audit:** the prior full audit applied to an earlier lockfile. Authentication packages and attempted ORM installs changed the tree; rerun full and production audits after selecting the final stable ORM dependencies. Do not use Prisma 8 RC for transaction-critical inventory work.

## Active planning constraints
- **REA CDP unavailable:** `list_browser_targets` to `127.0.0.1:9222` returned endpoint unreachable. This blocks REA live DOM/screenshot/network evidence. Public official pages and visible browser homepage provided fallback; no Chrome reconfiguration was done.
- **Material decisions still pending:** target segment/brand, tax and statutory invoice scope, subscription pricing/limits, production data residency/hosting commitments, MFA enforcement, RLS and support access. Owner's approved defaults are recorded as provisional assumptions, not validated customer requirements.
- **Interview evidence deferred:** the protocol is ready, but 5–8 interviews across at least two segments have not occurred. Owner directed phase closure and deferred these interviews to pilot validation; no participant findings are claimed.
