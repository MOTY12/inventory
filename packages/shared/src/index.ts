import { z } from "zod";

export const serviceStatusSchema = z.object({
  service: z.string().min(1),
  status: z.enum(["ok", "degraded"]),
});

export type ServiceStatus = z.infer<typeof serviceStatusSchema>;
