# Local QA fixture generator

The generator uses the authenticated versioned API and ordinary organization-scoped business routes. It does not add a fixture endpoint and never writes business tables directly. It is development/test only.

## Requirements and configuration

- Node.js >=24 and installed repository workspaces.
- Local API on `http://localhost:4000/api/v1`, local PostgreSQL with a database name containing `dev`, `development`, `test` or `testing`; Redis and S3Mock may be started using the repository Compose configuration.
- An active **OWNER** account that is an active member of the existing `Quality 001 QA Workspace`.
- Set `QA_ENVIRONMENT=development` (or `test`), `NODE_ENV=development` (or `test`), `QA_API_BASE_URL=http://localhost:4000/api/v1`, the local `DATABASE_URL`, `QA_ORGANIZATION_ID` (UUID), `QA_ORGANIZATION_NAME=Quality 001 QA Workspace`, `QA_EMAIL`, and `QA_PASSWORD` in the local ignored `.env` or shell environment. The organization ID is deliberately required; the generator does not select/create an organization implicitly.
- Implemented scenarios are `baseline` (default) and `document-states`. The registry rejects unsupported selectors before connection or mutation. Multi-currency, authorization and financial-export scenarios remain unimplemented.
- Before login, the runner opens a read-only local PostgreSQL session, verifies the exact organization and active OWNER account, then compares its live server/database/schema fingerprint with the development API readiness fingerprint. This guards against a local API pointed at a different database. Production readiness omits the fingerprint.
- Never put credentials in this guide, manifests, shell command arguments, source control or logs. The client uses the application login and refresh-cookie/CSRF flow; API calls carry request IDs. Access/refresh tokens remain in process memory only.

## Commands

- `npm run qa:test`: safety, manifest, retry and reconciliation-helper tests; does not connect to the app or mutate data.
- `npm run qa:seed`: create a new unique run. The API target, database, organization ID/name and OWNER membership are checked before business mutations.
- `QA_SCENARIO=baseline npm run qa:seed`: explicitly select the implemented baseline workflow.
- `QA_SCENARIO=document-states npm run qa:seed`: create a run-scoped lifecycle matrix through the normal APIs. It includes six purchase orders (draft 2/0, submitted 2/0, partial 2/1, received 10/10, cancelled 2/0, stock receipt 10/10; ordered/received units) and five sales orders (draft 1/0/0, confirmed 1/0/0, partial 2/1/1, fulfilled 2/2/2, cancelled 1/0/0; ordered/picked/fulfilled units). The partially fulfilled order remains available for inspection.
- `QA_RUN_ID=qa-... npm run qa:resume`: resume the ignored `.qa-runs/<run-id>.json` manifest. It reselects and revalidates the authorized organization before loading mutations. Critical operations reuse persisted idempotency keys. Unkeyed create operations use run-unique names/codes/SKUs and lookup before creating.
- `QA_RUN_ID=qa-... npm run qa:verify`: independently fetch documents, balances, invoice allocations and sales/purchase reports; returns nonzero when a reconciliation check fails.

New manifests use schema version 2 with scenario-specific results and export resource collection; valid schema-version-1 baseline manifests remain resumable. Credentials remain excluded. Files are atomically replaced with owner-only permissions. A per-run exclusive lock blocks concurrent execution and removes a stale lock only when its recorded PID no longer exists. The manifest directory is gitignored. Runs are additive and have no cleanup command. Do not post or alter the pre-existing draft stock count or prior product.

## Generated data and current limitations

Each run adds two branches, three warehouses, two units, three categories, six products, two suppliers and three customers. The deterministic operational path purchases 100 EACH at NGN 5,000, receives 60 then 40, transfers 30, sells/fulfills 20 at NGN 8,000, issues an invoice, records NGN 100,000 and NGN 60,000 payments, reverses the NGN 60,000 payment and replaces it. Expected final balances are 70 in source, 10 in destination, 80 total; expected WAC valuation is NGN 400,000, cost of fulfilled inventory is NGN 100,000, gross payments NGN 220,000, reversals NGN 60,000, effective collections/invoice value NGN 160,000 and receivables zero.

The `document-states` scenario currently covers purchase-order and sales-order states only. It verifies statuses and exact ordered/received/picked/fulfilled quantities using scaled integers, but does not create invoice-state variants (draft, issued, partial/paid/reversed, overdue, no due date or void), USD transactions, restricted members or a second tenant, and does not queue CSV exports. Those remain explicit acceptance gaps; scenario code/tests are not evidence of an executed authenticated scenario. Browser PDF/download acceptance must be run separately with populated data.

To avoid touching unrelated data, every master record is labeled by the QA run ID and existing objects are only reused when their run-unique identifier matches. Purchase orders, transfers and sales orders recover by manifest IDs and exact scenario attributes; API recovery pages all matching results and fails on ambiguity. Critical transactions use the application's submit/receive/dispatch/confirm/pick/fulfill/invoice/payment APIs and persisted idempotency keys. Non-idempotent transitions are never automatically retried. The verifier independently reads documents, reservation state, stock movements, WAC balances, ledger reconciliation, payment reversal allocations and reports; it is read-only.
