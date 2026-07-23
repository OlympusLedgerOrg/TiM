jest.mock('../src/prisma/client', () => {
  const prisma = {
    $transaction: jest.fn(),
    bOM: {
      findMany: jest.fn(),
      count: jest.fn(),
      findUnique: jest.fn(),
      findFirst: jest.fn(),
      create: jest.fn(),
      update: jest.fn(),
      delete: jest.fn(),
    },
    bOMItem: { deleteMany: jest.fn() },
    bOMStep: { deleteMany: jest.fn() },
    material: {
      findUnique: jest.fn(),
      findMany: jest.fn(),
      findFirst: jest.fn(),
    },
  };
  return { prisma };
});

import { prisma } from '../src/prisma/client';
import {
  createBOM,
  deleteBOM,
  getBOM,
  listBOMs,
  updateBOM,
} from '../src/services/bomService';

const db = prisma as any;
const createdAt = new Date('2026-07-20T10:00:00.000Z');
const validFrom = new Date('2026-07-21T00:00:00.000Z');
const validTo = new Date('2027-07-21T00:00:00.000Z');

const summaryBOM = {
  id: 'bom-1',
  materialId: 'output-1',
  version: 2,
  isActive: true,
  validFrom,
  validTo,
  createdAt,
  material: {
    description: 'Finished Product',
    sapMaterialNumber: 'FG-100',
  },
  _count: { items: 2, steps: 1 },
};

beforeEach(() => {
  jest.clearAllMocks();
  db.$transaction.mockImplementation(async (operations: unknown[]) => Promise.all(operations));
});

describe('BOM service', () => {
  test('lists BOMs with filters, capped pagination, and mapped counts', async () => {
    db.bOM.findMany.mockResolvedValue([summaryBOM]);
    db.bOM.count.mockResolvedValue(125);

    const result = await listBOMs({
      materialId: 'output-1',
      isActive: true,
      page: 2,
      pageSize: 500,
    });

    expect(result).toEqual({
      status: 200,
      body: {
        boms: [{
          id: 'bom-1',
          materialId: 'output-1',
          materialName: 'Finished Product',
          version: 2,
          isActive: true,
          validFrom: validFrom.toISOString(),
          validTo: validTo.toISOString(),
          itemCount: 2,
          stepCount: 1,
          createdAt: createdAt.toISOString(),
        }],
        pagination: {
          page: 2,
          pageSize: 100,
          total: 125,
          totalPages: 2,
        },
      },
    });
    expect(db.bOM.findMany).toHaveBeenCalledWith(expect.objectContaining({
      where: { materialId: 'output-1', isActive: true },
      skip: 100,
      take: 100,
    }));
  });

  test('uses list defaults when filters and pagination are omitted', async () => {
    db.bOM.findMany.mockResolvedValue([]);
    db.bOM.count.mockResolvedValue(0);

    const result = await listBOMs({});

    expect(result.body.pagination).toEqual({
      page: 1,
      pageSize: 50,
      total: 0,
      totalPages: 0,
    });
    expect(db.bOM.findMany).toHaveBeenCalledWith(expect.objectContaining({
      where: {},
      skip: 0,
      take: 50,
    }));
  });

  test('returns a fully mapped BOM with ordered items and steps', async () => {
    db.bOM.findUnique.mockResolvedValue({
      ...summaryBOM,
      items: [{
        id: 'item-1',
        materialId: 'input-1',
        quantity: 4,
        uom: 'KG',
        isOptional: false,
        condition: null,
        material: {
          description: 'Input Material',
          sapMaterialNumber: 'RM-100',
        },
      }],
      steps: [{
        id: 'step-1',
        name: 'Mix',
        sequence: 1,
        machineType: 'mixer',
        durationSec: 300,
        constraints: { rpm: 100 },
      }],
    });

    const result = await getBOM('bom-1');

    expect(result.status).toBe(200);
    expect(result.body).toEqual({
      bom: expect.objectContaining({
        id: 'bom-1',
        materialName: 'Finished Product',
        materialNumber: 'FG-100',
        validFrom: validFrom.toISOString(),
        validTo: validTo.toISOString(),
        items: [{
          id: 'item-1',
          materialId: 'input-1',
          materialName: 'Input Material',
          materialNumber: 'RM-100',
          quantity: 4,
          uom: 'KG',
          isOptional: false,
          condition: null,
        }],
        steps: [{
          id: 'step-1',
          name: 'Mix',
          sequence: 1,
          machineType: 'mixer',
          durationSec: 300,
          constraints: { rpm: 100 },
        }],
      }),
    });
  });

  test('returns 404 when a BOM does not exist', async () => {
    db.bOM.findUnique.mockResolvedValue(null);
    await expect(getBOM('missing')).resolves.toEqual({
      status: 404,
      body: { message: 'BOM not found' },
    });
  });

  test('validates output and input materials before creation', async () => {
    db.material.findUnique.mockResolvedValue(null);
    await expect(createBOM({
      materialId: 'missing-output',
      validFrom,
      items: [],
      steps: [],
    })).resolves.toEqual({
      status: 400,
      body: { message: 'Output material not found' },
    });

    db.material.findUnique.mockResolvedValue({ id: 'output-1' });
    db.bOM.findFirst
      .mockResolvedValueOnce(null)
      .mockResolvedValueOnce(null);
    db.material.findMany.mockResolvedValue([{ id: 'input-1' }]);

    await expect(createBOM({
      materialId: 'output-1',
      validFrom,
      items: [
        { materialId: 'input-1', quantity: 1, uom: 'KG' },
        { materialId: 'missing-input', quantity: 2, uom: 'KG' },
      ],
      steps: [],
    })).resolves.toEqual({
      status: 400,
      body: { message: 'Materials not found: missing-input' },
    });
  });

  test('rejects a duplicate BOM version', async () => {
    db.material.findUnique.mockResolvedValue({ id: 'output-1' });
    db.bOM.findFirst.mockResolvedValue({ id: 'existing-bom', version: 3 });

    const result = await createBOM({
      materialId: 'output-1',
      version: 3,
      validFrom,
      items: [],
      steps: [],
    });

    expect(result).toEqual({
      status: 409,
      body: { message: 'BOM version 3 already exists for this material' },
    });
  });

  test('creates a versioned BOM with default item flags and mapped output', async () => {
    db.material.findUnique.mockResolvedValue({ id: 'output-1' });
    db.bOM.findFirst
      .mockResolvedValueOnce({ version: 4 })
      .mockResolvedValueOnce(null);
    db.material.findMany.mockResolvedValue([{ id: 'input-1' }]);
    db.bOM.create.mockResolvedValue({
      ...summaryBOM,
      version: 5,
      validTo: null,
      _count: { items: 1, steps: 1 },
    });

    const result = await createBOM({
      materialId: 'output-1',
      validFrom,
      items: [{
        materialId: 'input-1',
        quantity: 2.5,
        uom: 'KG',
      }],
      steps: [{
        name: 'Mix',
        sequence: 1,
        constraints: { rpm: 100 },
      }],
    });

    expect(result.status).toBe(201);
    expect(result.body.bom).toEqual(expect.objectContaining({
      id: 'bom-1',
      version: 5,
      itemCount: 1,
      stepCount: 1,
      validTo: null,
    }));
    expect(db.bOM.create).toHaveBeenCalledWith(expect.objectContaining({
      data: expect.objectContaining({
        version: 5,
        items: {
          create: [expect.objectContaining({
            materialId: 'input-1',
            isOptional: false,
          })],
        },
        steps: {
          create: [expect.objectContaining({
            name: 'Mix',
            constraints: { rpm: 100 },
          })],
        },
      }),
    }));
  });

  test('updates an existing BOM and rejects a missing BOM', async () => {
    db.bOM.findUnique.mockResolvedValueOnce(null);
    await expect(updateBOM('missing', { isActive: false })).resolves.toEqual({
      status: 404,
      body: { message: 'BOM not found' },
    });

    db.bOM.findUnique.mockResolvedValueOnce({ id: 'bom-1' });
    db.bOM.update.mockResolvedValue({
      ...summaryBOM,
      isActive: false,
      validTo: null,
    });

    const result = await updateBOM('bom-1', { isActive: false });
    expect(result.status).toBe(200);
    expect(result.body.bom).toEqual(expect.objectContaining({
      isActive: false,
      validTo: null,
    }));
    expect(db.bOM.update).toHaveBeenCalledWith(expect.objectContaining({
      data: { isActive: false },
    }));
  });

  test('protects referenced BOMs and deletes unreferenced BOMs transactionally', async () => {
    db.bOM.findUnique.mockResolvedValueOnce(null);
    await expect(deleteBOM('missing')).resolves.toEqual({
      status: 404,
      body: { message: 'BOM not found' },
    });

    db.bOM.findUnique.mockResolvedValueOnce({
      id: 'bom-1',
      workOrders: [{ id: 'wo-1' }],
    });
    await expect(deleteBOM('bom-1')).resolves.toEqual({
      status: 409,
      body: {
        message: 'Cannot delete BOM — it is used by existing work orders. Deactivate it instead.',
      },
    });

    const deleteItems = Promise.resolve({ count: 2 });
    const deleteSteps = Promise.resolve({ count: 1 });
    const deleteBOMRecord = Promise.resolve({ id: 'bom-2' });
    db.bOM.findUnique.mockResolvedValueOnce({ id: 'bom-2', workOrders: [] });
    db.bOMItem.deleteMany.mockReturnValue(deleteItems);
    db.bOMStep.deleteMany.mockReturnValue(deleteSteps);
    db.bOM.delete.mockReturnValue(deleteBOMRecord);

    await expect(deleteBOM('bom-2')).resolves.toEqual({
      status: 200,
      body: { message: 'BOM deleted successfully' },
    });
    expect(db.$transaction).toHaveBeenCalledWith([
      deleteItems,
      deleteSteps,
      deleteBOMRecord,
    ]);
  });
});
