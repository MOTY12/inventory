# Next session checkpoint

**Updated:** 2026-11-24 (Africa/Lagos)

## Repository and verified stage

- Workspace: `/Users/newuser/Documents/GitHub/inventory`; branch `develop`; current HEAD at session start: `dfd26fe` (`update the mds`), ahead of the prior checkpoint's `4a6dbde`. Worktree was clean at start. No source code, schema or migration was changed in this session; only progress/roadmap documentation was updated. No commit, push, deployment, migration, database reset or data deletion occurred.
- Roadmap: **30/47 completed**, recalculated from the 47 task entries. SALES-004 is now explicitly **BLOCKED** pending policy approval; it is not counted complete. PROD-002, ARCH-002, QUALITY-002 and QUALITY-003 remain IN_PROGRESS. REPORT-002 remains gated by SALES-004. QUALITY-001 remains NOT_STARTED and dependency-gated by REPORT-002.
- Read the task ledger, acceptance criteria, dependency map, inventory semantics, decisions and current checkpoint. SALES-004 and SALES-003 dependencies are complete, but PROD-002 financial/tax approval is not. The provided SALES-004 execution brief itself says to request approval; its recommended MVP scope is not interpreted as approval.

## SALES-004 policy proposal awaiting owner approval

See `docs/progress/decisions.md` under “SALES-004 owner decision proposal”. It asks the owner to decide:

1. Invoice timing, sequential organization numbering, and any fiscal-year reset/prefix.
2. One immutable invoice currency inherited from the order; currency/price basis.
3. Tax treatment and statutory fields after Nigerian accountant/legal review, discount scope and rounding.
4. Manual payments, supported methods, allocation, same-currency rule, overpayment and unallocated-credit scope.
5. Issued invoice void/credit policy and payment reversal rules.
6. Confirmation that this is an operational subledger, not a general ledger or tax-compliance certification.

No financial schema, behavior, tax calculation or migration has been implemented. Await explicit approval/answers before starting SALES-004. Once approved, record decisions, then implement/test the vertical slice against task acceptance.

## Verification in this session

- `npm test`: passed; 52 API/shared passed, 0 failed, 2 opt-in PostgreSQL tests skipped; web 2 passed, 0 failed. The test script built shared/API packages before running tests.
- `RUN_POSTGRES_INTEGRATION=1 node --test apps/api/test/inventory.postgres.integration.test.mjs`: did not execute acceptance; failed connecting to configured PostgreSQL port 5433 with `EPERM`. No integration pass is claimed.
- `docker compose ps`: blocked by permission denied on Docker daemon socket. No container health is claimed.
- `npm audit --omit=dev --audit-level=high`: failed because registry lookup returned `ENOTFOUND registry.npmjs.org`; no audit result is claimed.
- Browser inventory showed the existing in-app tab at `http://localhost:3002/verify-email?...` with “This site can't be reached”. No authenticated browser workflow could be exercised. Docker Desktop appears running in the app inventory, but the CLI cannot access its daemon socket; app-level presence is not container health.
- `pg_isready` at default `/tmp:5432` returned no response; a local postgres process was observed listening on loopback 5432, distinct from configured integration endpoint 5433. Do not infer configured DB health from that process.
- Prior 2026-11-23 checks are historical evidence only: isolated PostgreSQL tests, Prisma status, typecheck/lint/format, production build and Chrome scanner component acceptance are recorded in `current-state.md` and `session-log.md`. They do not resolve this session's Docker/DB/audit blockers.

## Exact next steps

1. Obtain the explicit owner decisions listed in `docs/progress/decisions.md`. Until then, do not implement SALES-004 financial semantics or its migration.
2. If policy approval arrives: update the decision log and dependent task criteria if needed; design additive tenant-composite invoice/payment schema; implement APIs, idempotent transactional manual allocations/reversals and UI; add focused unit/API/PostgreSQL tests; verify invoice/payment actions never post inventory movements; run migration only after inspecting it and confirming the configured database target.
3. While policy is pending, continue only independent QUALITY-001 work: check whether the normal browser/local app and authenticated account are available; run actual PO receiving, transfer and sales picking workflows including warehouse-scope denial and organization switching. Record evidence precisely; do not claim full QUALITY-001 until REPORT-002 and all required workflows are ready.
4. Retry the isolated PostgreSQL integration suites only when the configured endpoint is reachable; they create/drop random test schemas, not the configured application schema. Retry dependency audit when npm registry DNS works. Preserve prior and current failures as separate evidence.
5. Maintain SECURITY/backup open items: QUALITY-002 dependency-advisory review; QUALITY-003 owner-approved RPO/RTO, retention/residency/key-management and production off-site recovery drill. Do not reimplement local recovery features already verified.
6. Update `task-breakdown.md`, `master-plan.md`, `current-state.md`, `next-session.md`, `session-log.md`, and blocker/pending summaries after each meaningful milestone. Recount tasks only from individual statuses.

## Current blockers

- SALES-004/REPORT-002: owner approval for tax, numbering, currency, discount/rounding, payment allocation/overpayment, correction and accounting-boundary policy is pending.
- Configured PostgreSQL integration endpoint on port 5433 rejected sandbox connection (`EPERM`); Docker daemon socket access denied.
- npm advisory endpoint unavailable (`ENOTFOUND registry.npmjs.org`); QUALITY-002 remains open.
- QUALITY-003 production recovery targets/configuration and QUALITY-001 authenticated full-page workflow UAT remain open.

No commit or push was created.
