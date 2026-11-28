# Inventory SaaS

Nigeria-first inventory operations platform. The repository contains the workspace, local infrastructure configuration, and versioned API foundation; business workflows are still under development.

## Requirements

- Node.js 24.22.1 or newer
- npm 11 or newer

## Workspace commands

- `npm install` — install the npm workspace.
- `npm run dev:web` — start the Next.js web application on port 3000.
- `npm run dev:api` — start the NestJS API on port 4000 (requires configured PostgreSQL).
- `cp .env.example .env && docker compose up -d` — start local PostgreSQL, Redis and S3Mock services.
- `npm run db:migrate:dev --workspace=@inventory/api` — apply local Prisma migrations after PostgreSQL is healthy.
- `docker compose ps` — check local service health.
- `docker compose down` — stop services while preserving local volumes.
- `npm run build` — build shared, API, and web workspaces.
- `npm run typecheck` — type-check all workspaces.
- `npm run validate:env` — validate `.env` or `.env.example` against the shared local configuration schema.
- `npm test` — run shared configuration tests and API contract smoke tests.
- `npm run lint` — lint application and workspace source.
- `npm run format:check` — verify formatting.
- `npm run format` — format workspace source and root configuration files.

## Architecture and progress

See `docs/architecture/` for the modular-monolith design and `docs/progress/` for the current implementation checkpoint. Authentication is under implementation using the provisional owner-directed defaults; PostgreSQL-backed lifecycle verification and a production email provider remain pending. While running the API in `development`, inspect a verification or reset message through `GET /api/v1/auth/dev-mailbox?email=you%40example.com` from loopback only. That development-only mailbox is not present in production.
See `docs/implementation/local-development.md` for local infrastructure endpoints and S3Mock limitations.
The API status endpoint is `GET http://localhost:4000/api/v1/status`; OpenAPI JSON is at `http://localhost:4000/api/docs-json`.
