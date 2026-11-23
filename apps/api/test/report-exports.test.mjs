import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import {
  ConflictException,
  ForbiddenException,
  NotFoundException,
} from "@nestjs/common";
import { ReportExportsService } from "../dist/reporting/report-exports.service.js";
import { ReportExportProcessor } from "../dist/reporting/report-export.processor.js";
import { MissingReportExportObjectError } from "../dist/reporting/report-export-storage.js";

const context = {
  organizationId: "org-a",
  membershipId: "membership-a",
  userId: "user-a",
  role: "OWNER",
};

function exportRow(overrides = {}) {
  return {
    id: "export-a",
    organizationId: "org-a",
    requestedByUserId: "user-a",
    reportType: "INVENTORY_SUMMARY",
    idempotencyKey: "key-1",
    payloadHash: "",
    status: "COMPLETED",
    filters: {},
    warehouseScope: ["warehouse-a"],
    snapshotAt: new Date(),
    retrySequence: 0,
    attemptCount: 1,
    rowCount: 4,
    fileSizeBytes: 200n,
    objectKey: "organizations/org-a/report-exports/export-a/report.csv",
    lastError: null,
    requestedAt: new Date(),
    startedAt: new Date(),
    completedAt: new Date(),
    expiresAt: new Date(Date.now() + 60_000),
    ...overrides,
  };
}

test("export creation persists tenant and warehouse scope and reuses matching idempotency keys", async () => {
  let saved;
  let creates = 0;
  const prisma = {
    reportExport: {
      findUnique: async () => saved ?? null,
      create: async ({ data }) => {
        creates += 1;
        saved = exportRow({
          ...data,
          id: "export-created",
          payloadHash: data.payloadHash,
        });
        return saved;
      },
    },
  };
  const reports = { authorizeExport: async () => ["warehouse-a"] };
  const service = new ReportExportsService(prisma, reports, {}, {});
  const body = {
    report_type: "INVENTORY_SUMMARY",
    filters: { product_id: "product-a" },
  };

  const first = await service.create(context, body, "key-1");
  const duplicate = await service.create(context, body, "key-1");
  assert.equal(first.id, "export-created");
  assert.equal(duplicate.id, first.id);
  assert.equal(creates, 1);
  assert.deepEqual(saved.warehouseScope, ["warehouse-a"]);
  assert.equal(saved.organizationId, context.organizationId);
  await assert.rejects(
    service.create(
      context,
      { ...body, filters: { product_id: "product-b" } },
      "key-1",
    ),
    ConflictException,
  );
});

test("download denies another tenant and a downloader without saved warehouse access", async () => {
  const row = exportRow();
  const prisma = {
    reportExport: {
      findFirst: async ({ where }) =>
        where.organizationId === row.organizationId ? row : null,
    },
    membership: {
      findFirst: async () => ({ id: "membership-a", role: "OWNER" }),
    },
  };
  const reports = {
    authorizeExport: async () => ["warehouse-b"],
  };
  const storage = {
    open: async () => {
      throw new Error("must not open unauthorized object");
    },
  };
  const service = new ReportExportsService(prisma, reports, {}, storage);

  await assert.rejects(
    service.download({ ...context, organizationId: "org-b" }, row.id),
    NotFoundException,
  );
  await assert.rejects(service.download(context, row.id), ForbiddenException);
});

test("download denies expired exports and requesters whose membership was revoked", async () => {
  const base = exportRow();
  const expiredService = new ReportExportsService(
    {
      reportExport: {
        findFirst: async () => ({ ...base, expiresAt: new Date(0) }),
      },
    },
    {},
    {},
    {},
  );
  await assert.rejects(
    expiredService.download(context, base.id),
    NotFoundException,
  );

  const revokedService = new ReportExportsService(
    {
      reportExport: { findFirst: async () => base },
      membership: { findFirst: async () => null },
    },
    {},
    {},
    {},
  );
  await assert.rejects(
    revokedService.download(context, base.id),
    ForbiddenException,
  );
});

test("missing export objects fail safely and remain retryable", async () => {
  const row = exportRow();
  let update;
  const prisma = {
    reportExport: {
      findFirst: async () => row,
      updateMany: async (input) => {
        update = input;
        return { count: 1 };
      },
    },
    membership: {
      findFirst: async () => ({ id: "membership-a", role: "OWNER" }),
    },
  };
  const service = new ReportExportsService(
    prisma,
    { authorizeExport: async () => ["warehouse-a"] },
    {},
    {
      open: async () => {
        throw new MissingReportExportObjectError();
      },
    },
  );

  await assert.rejects(service.download(context, row.id), (error) => {
    assert.ok(error instanceof NotFoundException);
    assert.equal(error.message, "The completed export file is unavailable");
    return true;
  });
  assert.deepEqual(update.where, {
    id: row.id,
    organizationId: context.organizationId,
    status: "COMPLETED",
    objectKey: row.objectKey,
  });
  assert.deepEqual(update.data, {
    status: "FAILED",
    objectKey: null,
    lastError: "Export artifact is missing from object storage",
  });
});

test("retry only resets failed tenant exports and advances the queue generation", async () => {
  const row = exportRow({
    status: "FAILED",
    retrySequence: 2,
    lastError: "retryable",
  });
  const prisma = {
    reportExport: {
      findFirst: async ({ where }) =>
        where.organizationId === row.organizationId ? row : null,
      updateMany: async ({ data }) => {
        Object.assign(row, {
          ...data,
          retrySequence: row.retrySequence + data.retrySequence.increment,
        });
        return { count: 1 };
      },
      findUniqueOrThrow: async () => row,
    },
  };
  const service = new ReportExportsService(prisma, {}, {}, {});
  const retry = await service.retry(context, row.id);
  assert.equal(row.status, "PENDING");
  assert.equal(row.retrySequence, 3);
  assert.equal(row.attemptCount, 0);
  assert.equal(row.lastError, null);
  assert.equal(retry.status, "PENDING");
  await assert.rejects(
    service.retry({ ...context, organizationId: "org-b" }, row.id),
    NotFoundException,
  );
});

test("worker records retryable and terminal failures without exposing raw errors", async () => {
  for (const [attemptsMade, expected] of [
    [0, "PENDING"],
    [2, "FAILED"],
  ]) {
    const row = exportRow({
      status: "PENDING",
      filters: {},
      warehouseScope: ["warehouse-a"],
    });
    const writes = [];
    const prisma = {
      reportExport: {
        findUnique: async () => row,
        update: async ({ data }) => {
          Object.assign(row, data);
          return row;
        },
        updateMany: async ({ data }) => {
          writes.push(data);
          Object.assign(row, data);
          return { count: 1 };
        },
      },
      membership: {
        findFirst: async () => ({ id: "membership-a", role: "OWNER" }),
      },
    };
    const reports = {
      authorizeExport: async () => ["warehouse-a"],
      inventorySummary: async () => {
        throw new Error("sensitive database detail");
      },
    };
    const processor = new ReportExportProcessor(prisma, reports, {});
    await assert.rejects(
      processor.process({
        data: { exportId: row.id, retrySequence: 0 },
        attemptsMade,
      }),
    );
    assert.equal(row.status, expected);
    assert.match(row.lastError, /maximum number|will retry/);
    assert.doesNotMatch(row.lastError, /sensitive database detail/);
    assert.equal(writes.length, 1);
  }
});

test("worker exports bounded report pages and streams the full CSV to storage", async () => {
  const row = exportRow({
    status: "PENDING",
    filters: {},
    warehouseScope: ["warehouse-a"],
  });
  const pages = [];
  const updates = [];
  let uploaded;
  const prisma = {
    reportExport: {
      findUnique: async () => row,
      update: async ({ data }) => {
        updates.push(data);
        Object.assign(row, data);
        return row;
      },
      updateMany: async ({ data }) => {
        Object.assign(row, data);
        return { count: 1 };
      },
    },
    membership: {
      findFirst: async () => ({ id: "membership-a", role: "OWNER" }),
    },
  };
  const reports = {
    authorizeExport: async () => ["warehouse-a"],
    inventorySummary: async (_context, query) => {
      pages.push({
        page: query.page,
        page_size: query.page_size,
        as_of: query.as_of,
      });
      const start = (query.page - 1) * 100;
      return {
        total: 205,
        data: Array.from(
          { length: Math.min(100, 205 - start) },
          (_, offset) => ({
            product_id: `product-${start + offset}`,
            product_name: `Product ${start + offset}`,
            sku: `SKU-${start + offset}`,
            base_unit: "PCS",
            on_hand: "1.250",
            reserved: "0.25",
            available: "1.000",
            average_cost: "12.50",
            cost_currency: "NGN",
            inventory_value: "15.625",
          }),
        ),
      };
    },
  };
  const storage = {
    putFile: async (key, path, length) => {
      uploaded = { key, content: await readFile(path), length };
    },
  };
  const processor = new ReportExportProcessor(prisma, reports, storage);

  await processor.process({
    data: { exportId: row.id, retrySequence: 0 },
    attemptsMade: 0,
  });

  assert.deepEqual(
    pages.map(({ page, page_size }) => [page, page_size]),
    [
      [1, 100],
      [2, 100],
      [3, 100],
    ],
  );
  assert.ok(pages.every((page) => page.as_of === row.snapshotAt.toISOString()));
  assert.equal(row.status, "COMPLETED");
  assert.equal(row.rowCount, 205);
  assert.equal(uploaded.length, uploaded.content.length);
  assert.match(uploaded.content.toString("utf8"), /Product 204/);
  assert.match(
    uploaded.content.toString("utf8"),
    /1\.250,0\.25,1\.000,12\.50,"NGN",15\.625/,
  );
});
