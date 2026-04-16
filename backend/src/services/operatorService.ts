import { prisma } from '../prisma/client.js';

/**
 * Operator Management Service — CRUD for operators, badge provisioning,
 * bulk import support.
 *
 * The Operator model exists in Prisma — this service builds management
 * functionality on top of it.
 */

export interface OperatorRecord {
  id: string;
  name: string;
  badgeId: string;
  isActive: boolean;
  createdAt: string;
  shiftsWorked?: number;
}

// ─── List Operators ───────────────────────────────────────────────────────────

/**
 * List all operators with optional search/filter.
 */
export async function listOperators(opts: {
  search?: string;
  isActive?: boolean;
  page?: number;
  pageSize?: number;
}) {
  const page = opts.page ?? 1;
  const pageSize = Math.min(opts.pageSize ?? 50, 100);
  const skip = (page - 1) * pageSize;

  const whereClause: Record<string, unknown> = {};

  if (opts.isActive !== undefined) {
    whereClause.isActive = opts.isActive;
  }

  if (opts.search) {
    whereClause.OR = [
      { name: { contains: opts.search, mode: 'insensitive' as const } },
      { badgeId: { contains: opts.search, mode: 'insensitive' as const } },
    ];
  }

  const [operators, total] = await Promise.all([
    prisma.operator.findMany({
      where: whereClause,
      orderBy: { name: 'asc' },
      skip,
      take: pageSize,
    }),
    prisma.operator.count({ where: whereClause }),
  ]);

  return {
    status: 200,
    body: {
      operators: operators.map(op => ({
        id: op.id,
        name: op.name,
        badgeId: op.badgeId,
        isActive: op.isActive,
        createdAt: op.createdAt.toISOString(),
      })),
      pagination: {
        page,
        pageSize,
        total,
        totalPages: Math.ceil(total / pageSize),
      },
    },
  };
}

// ─── Get Operator ─────────────────────────────────────────────────────────────

export async function getOperator(id: string) {
  const operator = await prisma.operator.findUnique({
    where: { id },
    include: {
      shifts: {
        orderBy: { date: 'desc' },
        take: 10,
      },
    },
  });

  if (!operator) {
    return { status: 404, body: { message: 'Operator not found' } };
  }

  return {
    status: 200,
    body: {
      operator: {
        id: operator.id,
        name: operator.name,
        badgeId: operator.badgeId,
        isActive: operator.isActive,
        createdAt: operator.createdAt.toISOString(),
        recentShifts: operator.shifts.map(s => ({
          id: s.id,
          shift: s.shift,
          date: s.date.toISOString().slice(0, 10),
          workCenterCode: s.workCenterCode,
          clockInAt: s.clockInAt?.toISOString() ?? null,
          clockOutAt: s.clockOutAt?.toISOString() ?? null,
        })),
      },
    },
  };
}

// ─── Create Operator ──────────────────────────────────────────────────────────

export async function createOperator(data: {
  name: string;
  badgeId: string;
}) {
  // Check for duplicate badge ID
  const existing = await prisma.operator.findFirst({
    where: { badgeId: data.badgeId },
  });
  if (existing) {
    return { status: 409, body: { message: `Badge ID ${data.badgeId} is already assigned to ${existing.name}` } };
  }

  const operator = await prisma.operator.create({
    data: {
      name: data.name,
      badgeId: data.badgeId,
    },
  });

  return {
    status: 201,
    body: {
      operator: {
        id: operator.id,
        name: operator.name,
        badgeId: operator.badgeId,
        isActive: operator.isActive,
        createdAt: operator.createdAt.toISOString(),
      },
    },
  };
}

// ─── Update Operator ──────────────────────────────────────────────────────────

export async function updateOperator(id: string, data: {
  name?: string;
  badgeId?: string;
  isActive?: boolean;
}) {
  const existing = await prisma.operator.findUnique({ where: { id } });
  if (!existing) {
    return { status: 404, body: { message: 'Operator not found' } };
  }

  // If changing badge ID, check for duplicates
  if (data.badgeId && data.badgeId !== existing.badgeId) {
    const duplicate = await prisma.operator.findFirst({
      where: { badgeId: data.badgeId, id: { not: id } },
    });
    if (duplicate) {
      return { status: 409, body: { message: `Badge ID ${data.badgeId} is already assigned to ${duplicate.name}` } };
    }
  }

  const operator = await prisma.operator.update({
    where: { id },
    data: {
      ...(data.name !== undefined && { name: data.name }),
      ...(data.badgeId !== undefined && { badgeId: data.badgeId }),
      ...(data.isActive !== undefined && { isActive: data.isActive }),
    },
  });

  return {
    status: 200,
    body: {
      operator: {
        id: operator.id,
        name: operator.name,
        badgeId: operator.badgeId,
        isActive: operator.isActive,
        createdAt: operator.createdAt.toISOString(),
      },
    },
  };
}

// ─── Delete Operator ──────────────────────────────────────────────────────────

export async function deleteOperator(id: string) {
  const existing = await prisma.operator.findUnique({ where: { id } });
  if (!existing) {
    return { status: 404, body: { message: 'Operator not found' } };
  }

  // Soft-delete: set isActive to false instead of actually deleting
  await prisma.operator.update({
    where: { id },
    data: { isActive: false },
  });

  return { status: 200, body: { message: 'Operator deactivated successfully' } };
}

// ─── Bulk Import ──────────────────────────────────────────────────────────────

/**
 * Bulk import operators from parsed CSV data.
 * Expects array of { name, badgeId } objects.
 * Skips duplicates and returns summary.
 */
export async function bulkImportOperators(operators: Array<{ name: string; badgeId: string }>) {
  const results = {
    imported: 0,
    skipped: 0,
    errors: [] as Array<{ name: string; badgeId: string; reason: string }>,
  };

  for (const op of operators) {
    if (!op.name || !op.badgeId) {
      results.errors.push({ name: op.name || '', badgeId: op.badgeId || '', reason: 'Missing name or badgeId' });
      results.skipped++;
      continue;
    }

    const existing = await prisma.operator.findFirst({
      where: { badgeId: op.badgeId },
    });

    if (existing) {
      results.errors.push({ name: op.name, badgeId: op.badgeId, reason: `Badge already assigned to ${existing.name}` });
      results.skipped++;
      continue;
    }

    await prisma.operator.create({
      data: {
        name: op.name.trim(),
        badgeId: op.badgeId.trim(),
      },
    });
    results.imported++;
  }

  return { status: 200, body: { results } };
}
