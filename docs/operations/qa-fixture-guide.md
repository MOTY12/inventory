# Local QA fixture generator

The generator uses the authenticated versioned API and ordinary organization-scoped business routes. It does not add a fixture endpoint and never writes business tables directly. It is development/test only.

## Requirements and configuration

- Node.js >=24 and installed repository workspaces.
- Local API on `http://localhost:4000/api/v1`, local PostgreSQL with a database name containing `dev`, `development`, `test` or `testing`; Redis and S3Mock may be started using the repository Compose configuration.
- An active **OWNER** account that is an active member of the existing `Quality 001 QA Workspace`.
- Set `QA_ENVIRONMENT=development` (or `test`), `NODE_ENV=development` (or `test`), `QA_API_BASE_URL=http://localhost:4000/api/v1`, the local `DATABASE_URL`, `QA_ORGANIZATION_ID` (UUID), `QA_ORGANIZATION_NAME=Quality 001 QA Workspace`, `QA_EMAIL`, and `QA_PASSWORD` in the local ignored `.env` or shell environment. The organization ID is deliberately required; the generator does not select/create an organization implicitly.
- Never put credentials in this guide, manifests, shell command arguments, source control or logs. The client uses the application login and refresh-cookie/CSRF flow; API calls carry request IDs. Access/refresh tokens remain in process memory only.

## Commands

- `npm run qa:test`: safety, manifest, retry and reconciliation-helper tests; does not connect to the app or mutate data.
- `npm run qa:seed`: create a new unique run. The API target, database, organization ID/name and OWNER membership are checked before business mutations.
- `QA_RUN_ID=qa-... npm run qa:resume`: resume the ignored `.qa-runs/<run-id>.json` manifest. It reselects and revalidates the authorized organization before loading mutations. Critical operations reuse persisted idempotency keys. Unkeyed create operations use run-unique names/codes/SKUs and lookup before creating.
- `QA_RUN_ID=qa-... npm run qa:verify`: independently fetch documents, balances, invoice allocations and sales/purchase reports; returns nonzero when a reconciliation check fails.

Manifests are atomically replaced with owner-only file permissions and exclude credentials. They include the target/environment, stage, resource IDs, command keys, expected values, completed and failed operations. The manifest directory is gitignored. Runs are additive and have no cleanup command. Do not post or alter the pre-existing draft stock count or prior product.

## Generated data and current limitations

Each run adds two branches, three warehouses, two units, three categories, six products, two suppliers and three customers. The deterministic operational path purchases 100 EACH at NGN 5,000, receives 60 then 40, transfers 30, sells/fulfills 20 at NGN 8,000, issues an invoice, records two partial payments, reverses one and replaces it. Expected final balances are 70 in source, 10 in destination, 80 total; expected WAC valuation is NGN 400,000, invoice/payment value NGN 160,000 and receivables zero.

This first executable version does not yet generate every requested alternate document state (open/cancelled PO, open/partial sales order, draft/unpaid/overdue/no-due-date/void invoice, USD transactions), a restricted member or a separate tenant. It also does not queue CSV exports. Those remain explicit acceptance gaps; generator success alone is not a SALES-004, REPORT-002 or QUALITY-001 completion claim. Browser PDF/download acceptance must be run separately with populated data.

To avoid touching unrelated data, every master record is labeled by the QA run ID and existing objects are only reused when their run-unique identifier matches. Transactions use the application's submit/receive/dispatch/confirm/pick/fulfill/invoice/payment APIs and persisted idempotency keys. The verifier is read-only.
