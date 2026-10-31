# Local development environment

The local Compose stack provides PostgreSQL, Redis and an S3 API test server. It is intended for developer machines and automated integration tests only. Do not reuse the example credentials or S3Mock as a production service.

## Start and stop

```sh
cp .env.example .env
npm run validate:env
docker compose up -d
docker compose ps
docker compose down
```

`npm run validate:env` checks `.env` (or `.env.example` when `.env` is absent) using the shared Zod schema. Compose health checks cover database readiness, authenticated Redis ping, and the S3Mock health endpoint.

Named volumes preserve local database, Redis and S3Mock files across container recreation. To permanently reset local state, remove the named volumes with `docker compose down -v`; this deletes local development data.

## Endpoints

- PostgreSQL: `localhost:5432`, database `inventory_dev`, user `inventory`.
- Redis: `localhost:6379`, password from local `.env`.
- S3Mock: `http://localhost:9090`, region `us-east-1`, bucket `inventory-local`.

All published ports bind to loopback. Choose different host ports in `.env` if there is a conflict.

## Limitations

S3Mock implements a subset of Amazon S3 for development/testing. It uses path-style requests, does not validate presigned URL signatures/expiry, and is not suitable for production. Application integration tests must cover only S3 operations supported by the mock; production AWS behavior still needs an appropriate staging validation.

The Docker Compose file pins image tags to reviewed release lines. Keep dependency updates deliberate and run the full local health/build checks after changing an image version.
