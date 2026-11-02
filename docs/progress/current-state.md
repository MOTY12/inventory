# Current state

**Updated:** 2026-11-02 (Africa/Lagos) — catalog lifecycle implemented; ledger/balance schemas started

## Repository and roadmap

- Workspace: `/Users/newuser/Documents/GitHub/inventory`; branch `develop`; base HEAD `bb3ed64 the catalogue build` (ahead of origin by one). This session's catalog/inventory changes are uncommitted; preserve them and the generated `apps/web/tsconfig.tsbuildinfo`; do not stage `.env` or secrets.
- Completed roadmap count: **12/47**. INV-001, INV-002, INV-003, INV-005, and INV-006 have implementation underway; none gained a completed status because new database migrations and integration checks are pending. FOUNDATION-009 remains complete based on its prior migration and live PostgreSQL evidence.
- Current runtime check: `docker compose ps` was denied by the Docker socket; `pg_isready -h localhost -p 5433` reported no response; API readiness connection to `localhost:4000` was refused. No migration from this session was applied and no existing records were changed.

## ARCH-001 and INV-001

- Completed the provisional inventory semantics implementation contract in `docs/architecture/inventory-semantics.md`, with quantity definitions, state flow, transaction/rollback matrix, invariants and scenario acceptance cases. This resolves ARCH-001 for reversible core implementation; it does not close PROD-002 or validate accounting/customer assumptions.
- Started INV-001. Added tenant-owned Unit and hierarchical Category schema, composite tenant parent FK, indexes/uniqueness/status, unit precision validation, organization-scoped read/create APIs, capability authorization and transactional audit writes. Added authenticated catalog setup UI at `/catalog` with create/list flows for categories and units, parent category selection, role-aware controls, loading/error/success states, and responsive layout. Migration `20261102082437_catalog_units_categories` was created and applied to existing `inventory_dev` without reset/deletion.
- Existing unit tests cover tenant filters, category parent isolation, unit normalization/audit, duplicate conflicts and DTO validation. A prior `npm test` run passed 32 with 1 opt-in PostgreSQL suite skipped. No tests were run for the current product/inventory work per the acceleration instruction. Conversion list/create API and UI are implemented, but database integration remains pending; INV-001 is not claimed complete.
- Continued into INV-002: added tenant-owned Product and ProductUnitConversion Prisma models, composite tenant references, uniqueness/indexes and Decimal monetary columns, plus unapplied migration `20261102113000_products_and_unit_conversions`. Added tenant-scoped product list/detail/create/edit/archive and conversion APIs with capability checks, DTO validation, active same-tenant category/unit checks, normalized identifiers and transactional audit records. Product list/detail/edit/archive and conversion UI are now implemented as recorded below. Database migration and runtime verification remain pending.
- Continued catalog lifecycle: added product detail, edit, archive, conversion listing APIs, UUID path validation and conversion UI. Added `/products` searchable/paginated create/edit/archive table and `/products/[productId]` details with per-product unit conversions, loading/empty/error states and authenticated requests. Base-unit changes are blocked when conversions exist. Product flows are implemented but not DB/browser verified.
- Began INV-005 with additive StockMovement, organization-scoped IdempotencyRecord, and OutboxEvent schema/migration. Movement references are organization-scoped for warehouse, product, reversal, and actor membership. SQL trigger rejects stock movement updates/deletes; cost/quantity/key constraints and indexes are included. Began INV-006 with InventoryBalance schema/migration and nonnegative/reservation constraints. Migrations `20261102143000_inventory_ledger_schema` and `20261102150000_inventory_balance_projection` are not applied. Added warehouse-grant-scoped balance and ledger reconciliation read endpoints plus internal single-warehouse posting for opening, receipt, sale fulfillment, and adjustment deltas. Posting locks the balance row, enforces the reserved floor, consumes matching reservations on fulfillment, updates weighted-average receipt cost, and writes movement/audit/outbox/idempotency atomically with payload-hash replay/conflict handling and bounded serialization retries. Transfer batch posting and database/concurrency verification remain outstanding.
- Current verification after these changes: Prisma schema validation/generation, typecheck, lint, format check, production build, and `git diff --check` passed. Automated tests were not run per the accelerated-development instruction. Docker/PostgreSQL/API were unavailable in this check, so migrations and end-to-end flows remain unverified.

## FOUNDATION-009 and local account

- Branch and warehouse schema, tenant-scoped APIs, role/location scope checks, transactional audit events, lifecycle controls, edit forms, pagination/search, and location page are implemented.
- Applied additive migration `20261101150000_branches_and_location_audit` to existing `inventory_dev`; no reset or deletion occurred. PostgreSQL integration suite passed 9/9.
- Chrome also surfaced a cramped Organizations settings page. Added a wide, responsive settings layout with distinct sections, organization cards, member controls, and properly grouped forms in `apps/web/src/app/organizations/page.tsx` and `apps/web/src/app/globals.css`; verified the signed-in page visually in Chrome. Typecheck, lint, format check, and `git diff --check` passed after this UI update.
- Chrome surfaced an authorization UI bug: session restoration loaded the selected organization without its membership role, hiding management controls. Fixed `apps/web/src/features/auth/session-provider.tsx` by joining the active organization to the loaded membership role. A screenshot also exposed cramped location forms; added responsive location-specific filters, field, form, and list styles in `apps/web/src/app/globals.css` and `apps/web/src/app/locations/page.tsx`.
- Manual Chrome workflow passed: register, read local verification message, verify email, sign in, reach dashboard, create/select organization, create branch and warehouse, and reload locations while retaining the selected organization and saved records.
- Development account email: `inventory.owner.20261101@example.test`. Its password was shared with the user in the chat and is intentionally not stored here. The local demo organization is `Local Demo Workspace` (`local-demo-workspace-20261101`) with `Main Branch` and `Main Warehouse` (`MAIN-01`).

## Earlier verification (not a current runtime claim)

- `npm run validate:env`, `npm run db:validate --workspace=@inventory/api`, and `npm run db:migrate:deploy --workspace=@inventory/api` passed; migration deploy reported no pending migrations on the final check.
- `RUN_POSTGRES_INTEGRATION=1 node --test apps/api/test/postgres.integration.test.mjs`: 9 passed, 0 failed.
- `npm run typecheck`, `npm run lint`, `npm run format:check`, and `npm run build` passed.
- `npm test`: 27 passed, 0 failed, 1 opt-in PostgreSQL suite skipped (run separately as noted above).
- API readiness direct and through the web proxy returned HTTP 200; frontend `/login` returned HTTP 200. Docker Compose showed all three containers healthy.
- After final role and location styling changes, typecheck, lint, format check, and production build passed. Production build temporarily interrupted the API watch process because build and dev share `apps/api/dist`; API was restarted and readiness returned 200. Recheck after future builds.

## Exact next steps

1. Restore/authorize local Docker/PostgreSQL access. Confirm database `inventory_dev` and migration history without reset. Apply in order the additive migrations `20261102113000_products_and_unit_conversions`, `20261102143000_inventory_ledger_schema`, and `20261102150000_inventory_balance_projection`; verify no existing records were lost.
2. Run migration status/schema checks and minimal API smoke for catalog/product endpoints; inspect product create/edit/archive, conversion list/create, tenant isolation, and immutability trigger. Keep results pending until actually run.
3. Verify INV-006 posting/reconciliation against PostgreSQL (idempotency replay/conflict, negative available, currency/weighted cost, rollback, row-lock race, ledger mismatch). Add atomic transfer-batch and reservation posting before claiming complete.
4. Continue INV-007 stock adjustment draft/count/reason/post history and UI through the internal posting service, then follow `task-breakdown.md` dependencies.
5. Update all task/progress docs after each verified milestone. Review current uncommitted changes before any staging/commit; do not stage secrets or unrelated files.
