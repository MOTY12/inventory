import "dotenv/config";
import { Worker } from "bullmq";
import { PrismaService } from "../../dist/database/prisma.service.js";
import { ReorderingService } from "../../dist/inventory/reordering/reordering.service.js";
import { ReportingService } from "../../dist/reporting/reporting.service.js";
import { ReportExportProcessor } from "../../dist/reporting/report-export.processor.js";
import { ReportExportStorage } from "../../dist/reporting/report-export-storage.js";

const queueName = process.argv[2];
const connection = {
  host: process.env.REDIS_HOST ?? "127.0.0.1",
  port: Number(process.env.REDIS_PORT ?? 6379),
  password: process.env.REDIS_PASSWORD,
  maxRetriesPerRequest: null,
};
const prisma = new PrismaService();
await prisma.onModuleInit();
const reordering = new ReorderingService(prisma);
const reports = new ReportingService(prisma, reordering);
const storage = new ReportExportStorage();
const processor = new ReportExportProcessor(prisma, reports, storage);
storage.putFile = async () => {
  if (process.send) process.send({ type: "upload-started" });
  await new Promise(() => {});
};
const worker = new Worker(queueName, (job) => processor.process(job), {
  connection,
  concurrency: 1,
  lockDuration: Number(process.env.REPORT_RECOVERY_LOCK_MS ?? 1_500),
  stalledInterval: Number(process.env.REPORT_RECOVERY_LOCK_MS ?? 1_500),
  maxStalledCount: 2,
});
worker.on("error", (error) => {
  if (process.send) process.send({ type: "worker-error", name: error.name });
});
await worker.waitUntilReady();
if (process.send) process.send({ type: "worker-ready" });
