import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import dotenv from "dotenv";
import { defineConfig, env } from "prisma/config";

const projectRoot = dirname(fileURLToPath(import.meta.url));
dotenv.config({ path: resolve(projectRoot, ".env") });

export default defineConfig({
  schema: "apps/api/prisma/schema.prisma",
  migrations: { path: "apps/api/prisma/migrations" },
  datasource: { url: env("DATABASE_URL") },
});
