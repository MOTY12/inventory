# System architecture

## Recommendation
Use a TypeScript modular monolith with separate Next.js frontend and NestJS API processes in one repository. PostgreSQL is the source of truth; Redis/BullMQ is for retryable asynchronous work. This keeps deployment and transactions understandable while preserving module boundaries for later extraction if measured scale warrants it.

## Logical components
- **Web app:** Next.js, TypeScript, Tailwind, shadcn/ui, TanStack Query, React Hook Form, Zod. Calls versioned REST API; no direct database access.
- **API:** NestJS controllers → auth/tenant/permission guard → application commands/queries → domain services → Prisma repositories.
- **Modules:** Identity/Organizations, Access, Locations, Catalog, Inventory, Procurement, Sales, Finance Records, Reporting, Files/Imports, Notifications, Subscription/Billing, Audit.
- **Database:** PostgreSQL with organization_id on tenant-owned entities, constraints, transactional ledger posting and indexes.
- **Jobs:** Redis + BullMQ for exports, email/notification, imports, subscription events and integration outbox delivery. Jobs carry tenant ID, are idempotent, bounded/retried with dead-letter visibility.
- **Files:** S3-compatible private buckets, tenant-prefixed object keys, short-lived signed URLs, malware/type/size validation.
- **Ops:** structured JSON logs, request/correlation IDs, metrics, traces, health checks, alerting, backup and restore drills.

## Request flow
1. Authenticate access token and resolve active organization membership server-side.
2. Check role/capability and branch/warehouse scope.
3. Validate request DTO and idempotency key for critical command.
4. Open DB transaction; lock affected inventory balance rows in deterministic order (or use serializable transaction with retry policy); validate stock policy; append ledger rows and update derived balance projection; post document transition and audit event.
5. Commit; write transactional outbox event; worker delivers email/export/integration after commit.
6. Return canonical resource and transaction reference.

## Inventory source of truth
Movement ledger is immutable; balance rows are a transactionally maintained projection for fast reads. Reconcile balance sums from ledger periodically. Corrections are compensating entries, never updates/deletes to posted movements. Transfer dispatch creates outflow to in-transit account/location; receipt transfers in-transit to destination. Persist a cost snapshot on stock movement for valuation/COGS.

## API and frontend
REST under `/api/v1`, OpenAPI generation, consistent envelope/error codes, cursor or stable offset pagination (choose based on pilot scale), filter allowlists, request validation, client cache invalidation by resource. API error does not leak tenant existence. Use HTTP 409 for stock/transition conflicts, 422 for invalid business input, 403 for forbidden action, 404 for out-of-scope resources.

## Scalability path
First scale vertically and optimize query/index/batch patterns. Separate workers and read replicas if load needs them. Partition ledger by time only after measuring; preserve tenant-key indexes and report cutoff semantics. Extract a module only when independent scaling/ownership/availability justifies distributed transaction cost. Use outbox for events to avoid dual-write inconsistency.

## Local/deploy stack
Docker Compose for PostgreSQL, Redis, API, web and optional local object storage. AWS-compatible production: managed PostgreSQL, Redis, container hosting, S3, secret manager, WAF/rate-limits, TLS. Environments: local, CI, staging, production with separate credentials/data. See deployment design.
