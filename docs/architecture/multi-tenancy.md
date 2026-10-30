# Multi-tenancy strategy

## Model
Shared PostgreSQL database/schema with tenant discriminator `organization_id` on all organization-owned rows. A user may belong to multiple organizations through membership. Organization context is resolved from the authenticated session and membership, not trusted from arbitrary body input.

## Enforcement layers
1. NestJS authentication guard creates principal.
2. Membership/role/warehouse policy guard evaluates capability and scope.
3. Application command/query receives immutable tenant context.
4. Repository requires tenant context and includes it in every predicate.
5. Composite FK/unique constraints include organization ID.
6. PostgreSQL RLS may be enabled using per-transaction tenant setting; connection pooling reset behavior must be verified if used.
7. Separate tenant keys/prefixes for object storage and tenant ID in jobs/outbox.

## Isolation tests
Attempt read/update/delete via another tenant's known and guessed UUIDs; cross-tenant relation assignment; report aggregation; bulk import; export signed URL; background job; search/autocomplete; audit/movement endpoints. Assert no data leak and no existence oracle. Test org switching and membership revocation mid-session.

## Noisy-neighbor / scale
Apply query timeouts, per-tenant rate/size limits, export queues and pagination. Monitor tenant data size and job time. Keep schema portable to future schema/database isolation if contractual data residency or very large tenants require it; no need to implement sharding now.
