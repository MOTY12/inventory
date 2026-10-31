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
  REDIS_PORT: z.coerce.number().int().min(1).max(65535).default(6379),
  S3_REGION: z.string().min(1).default("us-east-1"),
  S3_BUCKET: z
    .string()
    .regex(/^[a-z0-9][a-z0-9.-]{1,61}[a-z0-9]$/)
    .default("inventory-local"),
  S3_PORT: z.coerce.number().int().min(1).max(65535).default(9090),
});

export type LocalEnvironment = z.infer<typeof localEnvironmentSchema>;
