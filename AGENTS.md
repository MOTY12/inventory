# Inventory SaaS — Agent Operating Guide

## Purpose
Create an original, multi-tenant inventory operations SaaS for Nigerian businesses first, with a credible path to international use. Research and planning are complete as a first pass; application code is intentionally not started pending owner review/approval of product and architecture decisions. Never reproduce inFlow branding, assets, copy, or proprietary implementation.

## Current stack recommendation
TypeScript modular monolith; Next.js web UI; NestJS REST API; PostgreSQL + Prisma; Redis/BullMQ for asynchronous jobs; JWT access/refresh authentication; Docker Compose locally; S3-compatible object storage; GitHub Actions. See `docs/architecture/` for boundaries and unresolved choices. Do not scaffold or code until the owner approves the plan.

## Repository map
- `docs/research/`: REA setup/capability notes, sourced inFlow analysis, uncertainty labels.
- `docs/product/`: target users, requirements, stories, priorities, MVP boundary.
- `docs/architecture/`: system, database, ERD, API, security, tenancy, deployment.
- `docs/implementation/`: master plan, task ledger, milestones, dependencies, tests and acceptance criteria.
- `docs/progress/`: durable session state, decisions, blockers, next actions.
- `AGENTS.md`: this operating guide.

## Conventions and architecture rules
- Keep domain modules cohesive in a modular monolith; modules do not write another module's tables directly.
- Tenant scope is mandatory on every tenant-owned read/write. Derive tenant membership from authenticated context; never trust a tenant ID supplied in request bodies.
- Keep quantity as exact decimal or integer base units according to the approved UoM design; money uses PostgreSQL `numeric`/Prisma Decimal, never binary float.
- All stock-changing actions post immutable, auditable movement ledger entries inside the same database transaction as document state changes and balance updates.
- Use idempotency keys for externally retried critical commands; enforce uniqueness in the database.
- Enforce authorization server-side, branch/warehouse scope, and audit events for material changes.
- Validate at API boundaries; use explicit DTOs, stable error envelopes, pagination, filters and versioned `/api/v1` endpoints.
- Preserve user changes. Inspect `git status` and diffs before edits. Do not add secrets, generated artifacts, or unrelated refactors.
- New decisions that materially affect scope, accounting, legal compliance, or deployment must be documented and approved before implementation.

## Commands
No package manifests or application code exist yet. Do not represent these commands as currently runnable. After the approved foundation task establishes the workspace, record exact commands here. Planned command families: Docker Compose services; workspace package manager scripts for lint, typecheck, unit/integration/e2e tests, Prisma migration and seed; OpenAPI generation/check. Use only commands confirmed by the implemented manifests.

## Testing policy
Follow `docs/implementation/testing-strategy.md`. Run task-relevant checks when the user requests verification or when an approved implementation task requires them. Do not claim tests pass unless they were run and results recorded. Distinguish documentation consistency checks from application tests. Do not create application tests before application code and the relevant task are authorized.

## Mandatory startup procedure
At each new work session, read in this exact order:
1. `AGENTS.md`
2. `docs/progress/current-state.md`
3. `docs/progress/next-session.md`
4. `docs/implementation/master-plan.md`
5. `docs/implementation/task-breakdown.md`
6. Relevant architecture/module documentation.
Then inspect `git status`, repository files, and Git history. Verify status from code and artifacts; progress notes alone never prove completion.

## Mandatory progress update procedure
After each meaningful task: save changes, perform only authorized verification, update that task status and deliverables, append decisions/blockers, update current state and the next actionable task. Before ending, update `current-state.md`, `next-session.md`, and `session-log.md`. Keep paths and commands exact, and never invent test results.

## Resume interrupted work
Use the startup procedure. Compare the progress ledger with files and Git. Reopen the first incomplete task in `task-breakdown.md`; check prerequisites and approvals. Continue from the recorded next action, amend stale notes based on repository evidence, and record any discrepancy as a decision/blocker. Do not begin application coding before approval of the planning deliverables.
