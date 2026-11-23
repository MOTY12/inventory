import { z } from "zod";

export const serviceStatusSchema = z.object({
  service: z.string().min(1),
  status: z.enum(["ok", "degraded"]),
});

export type ServiceStatus = z.infer<typeof serviceStatusSchema>;

const localSecretSchema = z.string().min(16);

export const localEnvironmentSchema = z.object({
  POSTGRES_USER: z
    .string()
    .regex(/^[a-zA-Z_][a-zA-Z0-9_]*$/)
    .default("inventory"),
  POSTGRES_PASSWORD: localSecretSchema.default("local-dev-only-change-me"),
  POSTGRES_DB: z
    .string()
    .regex(/^[a-zA-Z_][a-zA-Z0-9_]*$/)
    .default("inventory_dev"),
  POSTGRES_PORT: z.coerce.number().int().min(1).max(65535).default(5432),
  REDIS_PASSWORD: localSecretSchema.default("local-dev-only-change-me"),
  REDIS_HOST: z.string().min(1).default("127.0.0.1"),
  REDIS_PORT: z.coerce.number().int().min(1).max(65535).default(6379),
  S3_REGION: z.string().min(1).default("us-east-1"),
  S3_ENDPOINT: z.string().url().default("http://127.0.0.1:9090"),
  S3_ACCESS_KEY_ID: z.string().min(1).default("inventory-local-access"),
  S3_SECRET_ACCESS_KEY: localSecretSchema.default(
    "inventory-local-secret-change-before-deploy",
  ),
  S3_BUCKET: z
    .string()
    .regex(/^[a-z0-9][a-z0-9.-]{1,61}[a-z0-9]$/)
    .default("inventory-local"),
  S3_PORT: z.coerce.number().int().min(1).max(65535).default(9090),
  REPORT_EXPORT_TTL_HOURS: z.coerce.number().int().min(1).max(168).default(24),
  REPORT_EXPORT_MAX_ROWS: z.coerce
    .number()
    .int()
    .min(100)
    .max(1_000_000)
    .default(1_000_000),
  DATABASE_URL: z
    .string()
    .url()
    .default(
      "postgresql://inventory:local-dev-only-change-me@localhost:5432/inventory_dev?schema=public",
    ),
  JWT_ACCESS_SECRET: localSecretSchema.default(
    "local-development-only-secret-change-before-deploy-123456",
  ),
  WEB_ORIGIN: z.string().url().default("http://localhost:3000"),
});

export type LocalEnvironment = z.infer<typeof localEnvironmentSchema>;
