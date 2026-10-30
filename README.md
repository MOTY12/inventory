# Inventory SaaS

Nigeria-first inventory operations platform. This repository currently contains the initial workspace foundation; business workflows are not implemented yet.

## Requirements

- Node.js 24.22.1 or newer
- npm 11 or newer

## Workspace commands

- `npm install` — install the npm workspace.
- `npm run dev:web` — start the Next.js web shell.
- `npm run dev:api` — start the NestJS API shell on port 4000.
- `cp .env.example .env && docker compose up -d` — start local PostgreSQL, Redis and S3Mock services.
- `docker compose ps` — check local service health.
- `docker compose down` — stop services while preserving local volumes.
- `npm run build` — build shared, API, and web workspaces.
- `npm run typecheck` — type-check all workspaces.
- `npm run lint` — lint TypeScript and TSX source.
- `npm run format:check` — verify formatting.
- `npm run format` — format workspace source and root configuration files.

## Architecture and progress

See `docs/architecture/` for the modular-monolith design and `docs/progress/` for the current implementation checkpoint. Do not add tenant, inventory, valuation, tax, or authentication behavior until their decisions are recorded and approved.
See `docs/implementation/local-development.md` for local infrastructure endpoints and S3Mock limitations.
