import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Injectable,
  Logger,
  NotFoundException,
  OnModuleDestroy,
  OnModuleInit,
} from "@nestjs/common";
import { createHash } from "node:crypto";
import { Queue, Worker } from "bullmq";
import {
  MembershipStatus,
  ReportExportStatus,
  UserStatus,
} from "../generated/prisma/enums";
import { PrismaService } from "../database/prisma.service";
import type { OrganizationContext } from "../organizations/organization-context.guard";
import { roleHasCapability } from "../organizations/access-policy";
import {
  ReportExportProcessor,
  type ReportExportJobData,
} from "./report-export.processor";
import {
  MissingReportExportObjectError,
  ReportExportStorage,
} from "./report-export-storage";
import { CreateReportExportDto } from "./report-exports.dto";
import { ReportFilterDto } from "./reporting.dto";
import { ReportingService } from "./reporting.service";

const QUEUE_NAME = "inventory-report-exports";

@Injectable()
export class ReportExportsService implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(ReportExportsService.name);
  private queue?: Queue<ReportExportJobData>;
  private worker?: Worker<ReportExportJobData>;
  private dispatchTimer?: NodeJS.Timeout;
  private cleanupTimer?: NodeJS.Timeout;
  private dispatching = false;
  private readonly redis = {
    host: process.env.REDIS_HOST ?? "127.0.0.1",
    port: Number(process.env.REDIS_PORT ?? 6379),
    password: process.env.REDIS_PASSWORD,
    maxRetriesPerRequest: null,
  };

  constructor(
    private readonly prisma: PrismaService,
    private readonly reports: ReportingService,
    private readonly processor: ReportExportProcessor,
    private readonly storage: ReportExportStorage,
  ) {}

  onModuleInit() {
    if (process.env.REPORT_EXPORT_WORKER_ENABLED === "false") return;
    this.queue = new Queue<ReportExportJobData>(QUEUE_NAME, {
      connection: this.redis,
    });
    this.queue.on("error", (error) => {
      this.logger.error(
        JSON.stringify({
          message: "Report export queue error",
          error: error.message,
        }),
      );
    });
    this.worker = new Worker(QUEUE_NAME, (job) => this.processor.process(job), {
      connection: this.redis,
      concurrency: 1,
    });
    this.worker.on("error", (error) => {
      console.error(
        JSON.stringify({
          message: "Report export worker error",
          error: error.message,
        }),
      );
    });
    this.dispatchTimer = setInterval(() => void this.dispatchPending(), 5_000);
    this.cleanupTimer = setInterval(
      () => void this.cleanupExpired(),
      60 * 60 * 1000,
    );
    void this.dispatchPending();
    void this.cleanupExpired();
  }

  async onModuleDestroy() {
    if (this.dispatchTimer) clearInterval(this.dispatchTimer);
    if (this.cleanupTimer) clearInterval(this.cleanupTimer);
    await this.worker?.close();
    await this.queue?.close();
  }

  async create(
    context: OrganizationContext,
    dto: CreateReportExportDto,
    idempotencyKey: string,
  ) {
    if (!idempotencyKey || idempotencyKey.length > 160)
      throw new BadRequestException(
        "A valid Idempotency-Key header is required",
      );
    const filters = Object.assign(new ReportFilterDto(), dto.filters ?? {});
    const warehouseScope = (
      await this.reports.authorizeExport(context, filters, dto.report_type)
    ).sort();
    const payloadHash = createHash("sha256")
      .update(
        JSON.stringify({
          reportType: dto.report_type,
          filters,
          warehouseScope,
        }),
      )
      .digest("hex");
    let record = await this.prisma.reportExport.findUnique({
      where: {
        organizationId_idempotencyKey: {
          organizationId: context.organizationId,
          idempotencyKey,
        },
      },
    });
    if (record) {
      if (record.payloadHash !== payloadHash)
        throw new ConflictException(
          "Idempotency key was already used for a different export",
        );
    } else {
      try {
        record = await this.prisma.reportExport.create({
          data: {
            organizationId: context.organizationId,
            requestedByUserId: context.userId,
            reportType: dto.report_type,
            idempotencyKey,
            payloadHash,
            filters: JSON.parse(JSON.stringify(filters)),
            warehouseScope,
            snapshotAt: filters.as_of ? new Date(filters.as_of) : new Date(),
          },
        });
      } catch (error) {
        if (!(
          error &&
          typeof error === "object" &&
          "code" in error &&
          error.code === "P2002"
        ))
          throw error;
        record = await this.prisma.reportExport.findUnique({
          where: {
            organizationId_idempotencyKey: {
              organizationId: context.organizationId,
              idempotencyKey,
            },
          },
        });
        if (!record || record.payloadHash !== payloadHash)
          throw new ConflictException(
            "Idempotency key was already used for a different export",
          );
      }
    }
    if (record.status === ReportExportStatus.PENDING)
      await this.enqueue(record.id, record.retrySequence);
    return this.serialize(record);
  }

  async list(context: OrganizationContext, page = 1, pageSize = 25) {
    const data = await this.prisma.reportExport.findMany({
      where: { organizationId: context.organizationId },
      orderBy: [{ requestedAt: "desc" }, { id: "desc" }],
      skip: (page - 1) * pageSize,
      take: pageSize,
      include: {
        requesterMembership: {
          include: { user: { select: { email: true } } },
        },
      },
    });
    const permitted = await Promise.all(
      data.map(async (row) => {
        const requesterActive = await this.prisma.membership.findFirst({
          where: {
            organizationId: context.organizationId,
            userId: row.requestedByUserId,
            status: MembershipStatus.ACTIVE,
            user: { status: UserStatus.ACTIVE },
          },
          select: { role: true },
        });
        if (
          !requesterActive ||
          !roleHasCapability(requesterActive.role, "reports:read")
        )
          return null;
        const currentScope = await this.reports.authorizeExport(
          context,
          this.readFilters(row.filters),
          row.reportType,
        );
        const savedScope = Array.isArray(row.warehouseScope)
          ? row.warehouseScope.filter(
              (id): id is string => typeof id === "string",
            )
          : [];
        if (savedScope.some((id) => !currentScope.includes(id))) return null;
        return {
          ...this.serialize(row),
          // The schema's required membership/user relation is inferred as `never` by Prisma's generated types here.
          requested_by: (row.requesterMembership.user as { email: string })
            .email,
        };
      }),
    );
    const visible = permitted.filter(
      (item): item is NonNullable<typeof item> => item !== null,
    );
    return { data: visible, total: visible.length, page, page_size: pageSize };
  }

  async retry(context: OrganizationContext, exportId: string) {
    const existing = await this.findAuthorized(context, exportId);
    if (existing.status !== ReportExportStatus.FAILED)
      throw new ConflictException("Only failed exports can be retried");
    const reset = await this.prisma.reportExport.updateMany({
      where: {
        id: existing.id,
        organizationId: context.organizationId,
        status: ReportExportStatus.FAILED,
      },
      data: {
        status: ReportExportStatus.PENDING,
        retrySequence: { increment: 1 },
        attemptCount: 0,
        lastError: null,
        objectKey: null,
        rowCount: null,
        fileSizeBytes: null,
        startedAt: null,
        completedAt: null,
        expiresAt: null,
      },
    });
    if (reset.count !== 1)
      throw new ConflictException(
        "Export state changed; refresh and try again",
      );
    const current = await this.prisma.reportExport.findUniqueOrThrow({
      where: { id: existing.id },
    });
    await this.enqueue(current.id, current.retrySequence);
    return this.serialize(current);
  }

  async download(context: OrganizationContext, exportId: string) {
    const record = await this.findAuthorized(context, exportId);
    if (
      record.status !== ReportExportStatus.COMPLETED ||
      !record.expiresAt ||
      record.expiresAt <= new Date() ||
      !record.objectKey
    )
      throw new NotFoundException("Completed export is unavailable or expired");
    const membership = await this.prisma.membership.findFirst({
      where: {
        organizationId: context.organizationId,
        userId: record.requestedByUserId,
        status: MembershipStatus.ACTIVE,
        user: { status: UserStatus.ACTIVE },
      },
      select: { id: true, role: true },
    });
    if (!membership || !roleHasCapability(membership.role, "reports:read"))
      throw new ForbiddenException(
        "Export requester no longer has report access",
      );
    const requesterContext: OrganizationContext = {
      organizationId: context.organizationId,
      membershipId: membership.id,
      userId: record.requestedByUserId,
      role: membership.role,
    };
    const currentScope = await this.reports.authorizeExport(
      requesterContext,
      this.readFilters(record.filters),
      record.reportType,
    );
    const savedScope = Array.isArray(record.warehouseScope)
      ? record.warehouseScope.filter(
          (id): id is string => typeof id === "string",
        )
      : [];
    if (savedScope.some((id) => !currentScope.includes(id)))
      throw new ForbiddenException(
        "Export requester warehouse access has changed",
      );
    const downloaderScope = await this.reports.authorizeExport(
      context,
      this.readFilters(record.filters),
      record.reportType,
    );
    if (savedScope.some((id) => !downloaderScope.includes(id)))
      throw new ForbiddenException(
        "You no longer have access to all warehouses in this export",
      );
    let file: Awaited<ReturnType<ReportExportStorage["open"]>>;
    try {
      file = await this.storage.open(record.objectKey);
    } catch (error) {
      if (!(error instanceof MissingReportExportObjectError)) throw error;
      await this.prisma.reportExport.updateMany({
        where: {
          id: record.id,
          organizationId: context.organizationId,
          status: ReportExportStatus.COMPLETED,
          objectKey: record.objectKey,
        },
        data: {
          status: ReportExportStatus.FAILED,
          objectKey: null,
          lastError: "Export artifact is missing from object storage",
        },
      });
      throw new NotFoundException("The completed export file is unavailable");
    }
    return {
      file,
      filename: `${record.reportType.toLowerCase()}-${record.id}.csv`,
    };
  }

  private async findAuthorized(context: OrganizationContext, exportId: string) {
    const row = await this.prisma.reportExport.findFirst({
      where: { id: exportId, organizationId: context.organizationId },
    });
    if (!row) throw new NotFoundException("Report export not found");
    return row;
  }

  private async enqueue(exportId: string, retrySequence: number) {
    if (!this.queue) return;
    await this.queue.add(
      "generate",
      { exportId, retrySequence },
      {
        jobId: `${exportId}-${retrySequence}`,
        attempts: 3,
        backoff: { type: "exponential", delay: 1_000 },
        removeOnComplete: true,
        removeOnFail: { age: 7 * 24 * 60 * 60 },
      },
    );
  }

  private async dispatchPending() {
    if (!this.queue || this.dispatching) return;
    this.dispatching = true;
    try {
      const rows = await this.prisma.reportExport.findMany({
        where: { status: ReportExportStatus.PENDING },
        orderBy: { requestedAt: "asc" },
        take: 100,
        select: { id: true, retrySequence: true },
      });
      for (const row of rows) await this.enqueue(row.id, row.retrySequence);
    } catch (error) {
      console.error(
        JSON.stringify({
          message: "Could not dispatch pending report exports",
          error: error instanceof Error ? error.message : "unknown",
        }),
      );
    } finally {
      this.dispatching = false;
    }
  }

  private async cleanupExpired() {
    try {
      await this.processor.expireCompleted();
    } catch (error) {
      this.logger.error(
        JSON.stringify({
          message: "Could not scan for expired report exports",
          error: error instanceof Error ? error.message : "unknown",
        }),
      );
    }
  }

  private readFilters(value: unknown) {
    return value && typeof value === "object" && !Array.isArray(value)
      ? Object.assign(new ReportFilterDto(), value)
      : new ReportFilterDto();
  }

  private serialize(row: {
    id: string;
    reportType: string;
    status: string;
    filters: unknown;
    requestedAt: Date;
    startedAt: Date | null;
    completedAt: Date | null;
    expiresAt: Date | null;
    rowCount: number | null;
    fileSizeBytes: bigint | null;
    lastError: string | null;
    requestedByUserId: string;
  }) {
    const expired =
      row.status === ReportExportStatus.COMPLETED &&
      row.expiresAt !== null &&
      row.expiresAt <= new Date();
    return {
      id: row.id,
      report_type: row.reportType,
      status: expired ? ReportExportStatus.EXPIRED : row.status,
      filters: row.filters,
      requested_at: row.requestedAt,
      started_at: row.startedAt,
      completed_at: row.completedAt,
      expires_at: row.expiresAt,
      row_count: row.rowCount,
      file_size_bytes: row.fileSizeBytes?.toString() ?? null,
      last_error: row.lastError,
      requested_by_user_id: row.requestedByUserId,
      download_url:
        row.status === ReportExportStatus.COMPLETED &&
        row.expiresAt !== null &&
        row.expiresAt > new Date()
          ? `/organizations/current/reports/exports/${row.id}/download`
          : null,
    };
  }
}
