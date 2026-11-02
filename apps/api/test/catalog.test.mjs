import assert from "node:assert/strict";
import test from "node:test";
import { CatalogService } from "../dist/catalog/catalog.service.js";
import { plainToInstance } from "class-transformer";
import { validateSync } from "class-validator";
import {
  CreateCategoryDto,
  CreateUnitDto,
} from "../dist/catalog/catalog.dto.js";

const context = {
  organizationId: "org-a",
  membershipId: "membership-a",
  userId: "user-a",
  role: "OWNER",
};

test("catalog lists always scope categories and units to active organization", async () => {
  const queries = [];
  const prisma = {
    $transaction: (operations) => Promise.all(operations),
    category: {
      findMany: async (input) => (queries.push(input), []),
      count: async (input) => (queries.push(input), 0),
    },
    unit: {
      findMany: async (input) => (queries.push(input), []),
      count: async (input) => (queries.push(input), 0),
    },
  };
  const service = new CatalogService(prisma);
  await service.listCategories(context, {
    page: 2,
    page_size: 10,
    q: "  Food ",
  });
  await service.listUnits(context, { page: 1, page_size: 20, q: " kg " });
  assert.equal(queries[0].where.organizationId, "org-a");
  assert.equal(queries[0].where.name.contains, "Food");
  assert.equal(queries[0].skip, 10);
  assert.equal(queries[2].where.organizationId, "org-a");
  assert.equal(queries[2].where.OR[1].code.contains, "kg");
});

test("category parent must be active and in the current organization", async () => {
  let parentQuery;
  let categoryCreated = false;
  const prisma = {
    $transaction: (callback) =>
      callback({
        category: {
          findFirst: async (input) => ((parentQuery = input), null),
          create: async () => (categoryCreated = true),
        },
      }),
  };
  await assert.rejects(
    new CatalogService(prisma).createCategory(context, "user-a", {
      name: "Beverages",
      parentId: "foreign-category",
    }),
    /Parent category not found/,
  );
  assert.deepEqual(parentQuery.where, {
    id: "foreign-category",
    organizationId: "org-a",
    status: "ACTIVE",
  });
  assert.equal(categoryCreated, false);
});

test("unit creation normalizes code and audits in the same transaction", async () => {
  const writes = [];
  const prisma = {
    $transaction: (callback) =>
      callback({
        unit: {
          create: async ({ data }) => {
            writes.push(["unit", data]);
            return { id: "unit-a", ...data };
          },
        },
        auditEvent: {
          create: async ({ data }) => writes.push(["audit", data]),
        },
      }),
  };
  await new CatalogService(prisma).createUnit(context, "user-a", {
    code: " pcs ",
    name: " Pieces ",
    precision: 0,
  });
  assert.deepEqual(writes[0][1], {
    organizationId: "org-a",
    code: "PCS",
    name: "Pieces",
    precision: 0,
  });
  assert.equal(writes[1][1].entityId, "unit-a");
  assert.equal(writes[1][1].organizationId, "org-a");
});

test("duplicate unit code maps to conflict", async () => {
  const prisma = {
    $transaction: (callback) =>
      callback({
        unit: {
          create: async () => {
            throw { code: "P2002" };
          },
        },
      }),
  };
  await assert.rejects(
    new CatalogService(prisma).createUnit(context, "user-a", {
      code: "PCS",
      name: "Pieces",
    }),
    (error) => error.getStatus() === 409,
  );
});

test("catalog DTOs trim names and reject invalid unit codes or precision", () => {
  const category = plainToInstance(CreateCategoryDto, { name: "   " });
  assert.ok(validateSync(category).some((error) => error.property === "name"));
  const invalidUnit = plainToInstance(CreateUnitDto, {
    code: "case pack",
    name: "Case pack",
    precision: 7,
  });
  const invalidFields = validateSync(invalidUnit).map(
    (error) => error.property,
  );
  assert.ok(invalidFields.includes("code"));
  assert.ok(invalidFields.includes("precision"));
});
