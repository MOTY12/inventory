# Next session checkpoint

**Updated:** 2026-11-23 (Africa/Lagos)

## Repository state

- Workspace: `/Users/newuser/Documents/GitHub/inventory`, branch `develop`.
- Base HEAD at start: `b1719d2 report csv`; worktree was clean at start. No commit, push, or deploy this session.
- Completed roadmap: **29/47**. REPORT-003 is COMPLETED; INV-010 remains IN_PROGRESS. Counts are from the 47 unique entries in `docs/implementation/task-breakdown.md`.
- Current modified code/test files: `apps/api/src/reporting/report-export.processor.ts`, `apps/api/src/reporting/reporting.service.ts`, `apps/api/test/inventory.postgres.integration.test.mjs`, `apps/api/test/postgres.integration.test.mjs`.
- Current operations files: `scripts/backup-postgres.sh`, `scripts/restore-postgres.sh`, `docs/operations/backup-restore.md`.
- No database reset or migration occurred. Prisma status is 20/20 and up to date.
- QUALITY-003 is IN_PROGRESS (FOUNDATION-002 and FOUNDATION-005 are complete). Safe backup/restore scripts and runbook were added; final local PostgreSQL 18 restore drill passed with a 285,871-byte archive, measured 1-second backup and restore, 20/20 migrations and restored counts of 18 organizations/36 movements. Temporary archive and newly created scratch database were removed. RPO/RTO, off-host encryption, object-storage recovery and queue recovery remain open.

## Work completed and verified

### REPORT-003 — completed

- Fixed movement export pagination so it queries the full saved authorized warehouse scope and preserves the report API's global `occurredAt DESC, id DESC` order. `ReportingService.movementsAt` intersects the export's saved warehouse list with current authorization before querying.
- Expanded isolated integration test to run actual BullMQ/Redis and S3Mock for Summary, Movements, Valuation, and Low Stock; download each through `ReportExportsService.download`; compare row counts and values with the report APIs; verify movement order over two warehouses; verify current and historical WAC, exact decimal values, NGN/USD currency separation, low-stock minimum/target/suggestion; inject one temporary S3 upload failure and verify queue retry completes on attempt 2; expire a completed export and verify its stored object is deleted and download returns 404.
- Verified organization listing code filters active memberships; added database integration assertion that a user in Organization A lists only Organization A. Existing tenant selection test denies Organization B.
- REPORT-003 task acceptance passes: formula injection, authenticated tenant-scoped download, retry safety, all export formats, expiry. UI/browser UAT and large-tenant benchmark remain broader QUALITY/security/performance hardening and are not claimed.

### INV-010 — still in progress

- Existing exact tenant barcode lookup, sales-order/receiving/picking integrations and scanner submit queue remain. Unit regression verifies one submit is processed once, empty input ignored, and repeated rapid scans run sequentially. PostgreSQL integration verifies catalog tenant isolation and workflow test suite remains green.
- No browser control was available: REA could not reach Chrome CDP at `127.0.0.1:9222`. Native Enter-key event, quantity increment in live component state, unknown-code UI feedback, workspace-switch clearing, receive/pick limits in the UI, and no-auto-post UI acceptance remain unverified. Do not mark INV-010 complete until browser or equivalent component-level interaction coverage is added and passes.
- Camera scanning stays deferred; manual/USB/Bluetooth keyboard input remains the fallback due inconsistent browser/device support.

## Verification evidence

- `npm run build`: passed (shared, API, and production Next.js Webpack build).
- `npm run typecheck`: passed.
- `npm run lint`: passed.
- `npm run format:check`: passed.
- `git diff --check`: passed before final progress-document edits; rerun after docs edits.
- `npm run db:validate --workspace=@inventory/api`: passed.
- `npx prisma migrate status --config prisma.config.ts`: 20 migrations found, database schema up to date.
- `npm test`: **51 passed, 0 failed, 2 opt-in PostgreSQL suites skipped** in that invocation; web tests **2 passed, 0 failed**. This run used local loopback permission; API contract smoke passed, so the previous `listen EPERM` is not an active blocker when run with that permission.
- `RUN_POSTGRES_INTEGRATION=1 node --test apps/api/test/inventory.postgres.integration.test.mjs`: **13 passed, 0 failed, 0 skipped**, including all four report export types, live queue/storage, retry, expiry and deletion.
- `RUN_POSTGRES_INTEGRATION=1 node --test apps/api/test/postgres.integration.test.mjs`: **10 passed, 0 failed, 0 skipped**, including refresh rotation, organization tenant isolation/listing, warehouse grants and catalog isolation.
- API readiness `http://127.0.0.1:4000/api/v1/health/ready` returned HTTP 200 and `{"service":"inventory-api","status":"ok"}`. Local Next.js frontend was already listening on port 3000. API process started by this session remains running in exec session 28533.
- Docker daemon socket query itself is permission-denied, so no current `docker compose ps` claim is made. PostgreSQL, Redis, and S3Mock endpoints were reachable and successfully used by explicit integration tests.

## Next exact steps

1. Re-read `AGENTS.md`, current-state, this checkpoint, master plan and task ledger; inspect `git status` and preserve these four code/test modifications.
2. Run `git diff --check` after the progress edits and verify generated Next build files remain absent from status.
3. Continue INV-010 acceptance: establish a usable authenticated browser session or add a component interaction harness; verify Enter exactly once, one and three repeated scans, unknown barcode feedback, cross-workspace stale response clearing, receiving outstanding limits, picking reservation/unpicked limits, and that scanning never posts inventory.
4. Once INV-010 criteria have sufficient evidence, mark it complete only if its documented keyboard acceptance is actually covered. Recount task entries.
5. Continue **QUALITY-003**: add a safe queue-restart recovery rehearsal and object-storage backup/restore coverage, plus incident steps. The local database backup/restore slice is implemented and its isolated drill passed, but RPO/RTO targets are unapproved, so keep the task IN_PROGRESS.
6. Keep SALES-004 and REPORT-002 gated by the unresolved statutory invoice/tax/accounting policy in `docs/progress/decisions.md`. Do not start those while the policy remains unapproved.
7. Update task ledger, current state, next-session, completed/pending task lists, blockers, session log, master plan and report export design with final evidence. No commit/push/deploy was made.

## Blockers and open decisions

- Real browser scanner interactions are unverified because the Chrome CDP endpoint was unavailable and no existing browser automation package is installed.
- Large-export performance/load benchmark and registry-backed npm audit remain pending. The dependency advisory endpoint was unavailable in prior work; no clean audit is claimed.
- Docker CLI socket is inaccessible in this environment, despite its PostgreSQL/Redis/S3Mock endpoints being available for tests.
- RPO/RTO targets, target-segment validation, tax/invoice obligations, pricing, production data residency/hosting, MFA enforcement, and RLS/support access remain open in `docs/progress/decisions.md`.
