jest.mock('../src/middleware/auth', () => ({
  requireAuth: (req: any, _res: any, next: any) => {
    req.user = { id: 'user-1', tenantId: 'tenant-1', role: 'Supervisor' };
    next();
  },
  requireRole: () => (_req: any, _res: any, next: any) => next(),
}));

jest.mock('../src/middleware/integrationAuth', () => ({
  requireCallGuardKey: (_req: any, _res: any, next: any) => next(),
}));

jest.mock('../src/services/fieldServiceService', () => ({
  assignTruckToWorkOrder: jest.fn(),
  completeFieldWorkOrder: jest.fn(),
  convertCallIntake: jest.fn(),
  createCustomer: jest.fn(),
  createFieldWorkOrder: jest.fn(),
  createRoutePlan: jest.fn(),
  createServiceLocation: jest.fn(),
  createTruck: jest.fn(),
  getCustomer: jest.fn(),
  getDispatchBoard: jest.fn(),
  ingestCallGuardCall: jest.fn(),
  listFieldWorkOrders: jest.fn(),
  listRoutePlans: jest.fn(),
  listTrucks: jest.fn(),
  publishRoutePlan: jest.fn(),
  recordTruckLoadEvent: jest.fn(),
  registerWorkOrderPhoto: jest.fn(),
  searchCustomers: jest.fn(),
}));

import express from 'express';
import request from 'supertest';
import fieldServiceRoutes from '../src/routes/fieldService';
import callGuardRoutes from '../src/routes/callGuard';
import * as service from '../src/services/fieldServiceService';

const mocks = service as jest.Mocked<typeof service>;
const customerId = '00000000-0000-4000-8000-000000000001';
const locationId = '00000000-0000-4000-8000-000000000002';
const workOrderId = '00000000-0000-4000-8000-000000000003';
const truckId = '00000000-0000-4000-8000-000000000004';
const routeId = '00000000-0000-4000-8000-000000000005';
const photoId = '00000000-0000-4000-8000-000000000006';
const intakeId = '00000000-0000-4000-8000-000000000007';

function makeApp() {
  const app = express();
  app.use(express.json());
  app.use('/api/v1/field-service', fieldServiceRoutes);
  app.use('/api/v1/intake/callguard', callGuardRoutes);
  app.use((error: any, _req: any, res: any, _next: any) => {
    res.status(error.status ?? 500).json({ message: error.message, code: error.code ?? 'INTERNAL_ERROR' });
  });
  return app;
}

beforeEach(() => {
  jest.clearAllMocks();
  process.env.CALLGUARD_TENANT_ID = 'tenant-1';
});

describe('field-service HTTP contract', () => {
  const app = makeApp();

  test('returns the dispatch board and truck list', async () => {
    mocks.getDispatchBoard.mockResolvedValue({ trucks: [], workOrders: [], callIntakes: [] } as any);
    mocks.listTrucks.mockResolvedValue([{ id: truckId }] as any);

    await request(app).get('/api/v1/field-service/dispatch-board').expect(200, {
      trucks: [], workOrders: [], callIntakes: [],
    });
    await request(app).get('/api/v1/field-service/trucks').expect(200, {
      trucks: [{ id: truckId }],
    });

    expect(mocks.getDispatchBoard).toHaveBeenCalledWith('tenant-1');
    expect(mocks.listTrucks).toHaveBeenCalledWith('tenant-1');
  });

  test('creates a capacity-defined truck and validates bad input', async () => {
    mocks.createTruck.mockResolvedValue({ id: truckId } as any);

    const response = await request(app)
      .post('/api/v1/field-service/trucks')
      .send({
        unitNumber: 'T-101',
        tankCapacityGallons: 3000,
        wasteCapabilities: ['SEPTIC', 'GREASE'],
        assignedDriverId: 'driver-1',
      })
      .expect(201);

    expect(response.body.truck.id).toBe(truckId);
    expect(mocks.createTruck).toHaveBeenCalledWith(expect.objectContaining({
      tenantId: 'tenant-1',
      unitNumber: 'T-101',
      tankCapacityGallons: 3000,
    }));

    await request(app)
      .post('/api/v1/field-service/trucks')
      .send({ unitNumber: '', tankCapacityGallons: 0 })
      .expect(400);
  });

  test('records dated truck load events', async () => {
    mocks.recordTruckLoadEvent.mockResolvedValue({ event: { id: 'event-1' }, resultingOnboardGallons: 500 } as any);

    await request(app)
      .post(`/api/v1/field-service/trucks/${truckId}/load-events`)
      .send({
        type: 'DISPOSAL',
        gallons: 500,
        fieldWorkOrderId: workOrderId,
        evidencePhotoId: photoId,
        disposalFacility: 'North Plant',
        occurredAt: '2026-07-23T14:00:00.000Z',
      })
      .expect(201);

    expect(mocks.recordTruckLoadEvent).toHaveBeenCalledWith(expect.objectContaining({
      tenantId: 'tenant-1',
      truckId,
      actorUserId: 'user-1',
      occurredAt: new Date('2026-07-23T14:00:00.000Z'),
    }));
  });

  test('searches, creates, and reads customers and locations', async () => {
    mocks.searchCustomers.mockResolvedValue([{ id: customerId }] as any);
    mocks.getCustomer.mockResolvedValue({ id: customerId } as any);
    mocks.createCustomer.mockResolvedValue({ id: customerId } as any);
    mocks.createServiceLocation.mockResolvedValue({ id: locationId } as any);

    await request(app).get('/api/v1/field-service/customers?query=Acme').expect(200);
    expect(mocks.searchCustomers).toHaveBeenCalledWith('tenant-1', 'Acme');

    await request(app).get(`/api/v1/field-service/customers/${customerId}`).expect(200);
    expect(mocks.getCustomer).toHaveBeenCalledWith('tenant-1', customerId);

    await request(app)
      .post('/api/v1/field-service/customers')
      .send({ name: 'Acme Foods', email: 'ops@acme.example' })
      .expect(201);

    await request(app)
      .post(`/api/v1/field-service/customers/${customerId}/locations`)
      .send({
        addressLine1: '10 Main St',
        city: 'Charlotte',
        state: 'NC',
        postalCode: '28202',
        latitude: 35.2271,
        longitude: -80.8431,
        estimatedTankGallons: 1500,
      })
      .expect(201);

    expect(mocks.createServiceLocation).toHaveBeenCalledWith(expect.objectContaining({
      tenantId: 'tenant-1', customerId,
    }));
  });

  test('lists and creates work orders with parsed schedules and defaults', async () => {
    mocks.listFieldWorkOrders.mockResolvedValue([{ id: workOrderId }] as any);
    mocks.createFieldWorkOrder.mockResolvedValue({ id: workOrderId } as any);

    await request(app)
      .get(`/api/v1/field-service/work-orders?status=SCHEDULED&truckId=${truckId}&driverId=driver-1`)
      .expect(200);
    expect(mocks.listFieldWorkOrders).toHaveBeenCalledWith({
      tenantId: 'tenant-1', status: 'SCHEDULED', truckId, driverId: 'driver-1',
    });

    await request(app)
      .post('/api/v1/field-service/work-orders')
      .send({
        customerId,
        serviceLocationId: locationId,
        serviceType: 'SEPTIC_PUMPING',
        estimatedGallons: 900,
        scheduledStart: '2026-07-24T12:00:00.000Z',
        scheduledEnd: '2026-07-24T13:00:00.000Z',
        requiredEvidence: ['BEFORE_SERVICE', 'AFTER_SERVICE'],
      })
      .expect(201);

    expect(mocks.createFieldWorkOrder).toHaveBeenCalledWith(expect.objectContaining({
      tenantId: 'tenant-1',
      priority: 'ROUTINE',
      scheduledStart: new Date('2026-07-24T12:00:00.000Z'),
      scheduledEnd: new Date('2026-07-24T13:00:00.000Z'),
    }));
  });

  test('assigns trucks, registers photos, and completes work orders', async () => {
    mocks.assignTruckToWorkOrder.mockResolvedValue({ id: workOrderId } as any);
    mocks.registerWorkOrderPhoto.mockResolvedValue({ id: photoId } as any);
    mocks.completeFieldWorkOrder.mockResolvedValue({ id: workOrderId, status: 'COMPLETED' } as any);

    await request(app)
      .put(`/api/v1/field-service/work-orders/${workOrderId}/assignment`)
      .send({ truckId, driverId: 'driver-1' })
      .expect(200);

    await request(app)
      .post(`/api/v1/field-service/work-orders/${workOrderId}/photos`)
      .send({
        type: 'AFTER_SERVICE',
        fileName: 'after.jpg',
        mimeType: 'image/jpeg',
        storageKey: 'tenant/wo/after.jpg',
        sha256: 'a'.repeat(64),
        capturedAt: '2026-07-23T14:00:00.000Z',
        latitude: 35.2,
        longitude: -80.8,
      })
      .expect(201);

    expect(mocks.registerWorkOrderPhoto).toHaveBeenCalledWith(expect.objectContaining({
      capturedByUserId: 'user-1',
      capturedAt: new Date('2026-07-23T14:00:00.000Z'),
    }));

    await request(app)
      .post(`/api/v1/field-service/work-orders/${workOrderId}/complete`)
      .send({ actualGallons: 850, technicianComments: 'Pumped and inspected.' })
      .expect(200);

    expect(mocks.completeFieldWorkOrder).toHaveBeenCalledWith(expect.objectContaining({
      tenantId: 'tenant-1', actorUserId: 'user-1', actualGallons: 850,
    }));
  });

  test('converts Call Guard intake records to work orders', async () => {
    mocks.convertCallIntake.mockResolvedValue({ id: workOrderId } as any);

    await request(app)
      .post(`/api/v1/field-service/call-intakes/${intakeId}/convert`)
      .send({
        customerId,
        serviceLocationId: locationId,
        estimatedGallons: 700,
        scheduledStart: '2026-07-24T10:00:00.000Z',
      })
      .expect(201);

    expect(mocks.convertCallIntake).toHaveBeenCalledWith(expect.objectContaining({
      tenantId: 'tenant-1',
      intakeId,
      scheduledStart: new Date('2026-07-24T10:00:00.000Z'),
    }));
  });

  test('creates, lists, and publishes route plans', async () => {
    mocks.listRoutePlans.mockResolvedValue([{ id: routeId }] as any);
    mocks.createRoutePlan.mockResolvedValue({ id: routeId } as any);
    mocks.publishRoutePlan.mockResolvedValue({ id: routeId, status: 'PUBLISHED' } as any);

    await request(app)
      .get('/api/v1/field-service/routes?serviceDate=2026-07-24&status=DRAFT')
      .expect(200);
    expect(mocks.listRoutePlans).toHaveBeenCalledWith({
      tenantId: 'tenant-1',
      serviceDate: new Date('2026-07-24T00:00:00.000Z'),
      status: 'DRAFT',
    });

    await request(app)
      .post('/api/v1/field-service/routes')
      .send({
        name: 'North Route',
        serviceDate: '2026-07-24',
        truckId,
        driverId: 'driver-1',
        plannedStart: '2026-07-24T11:00:00.000Z',
        stops: [{
          workOrderId,
          sequence: 1,
          plannedArrival: '2026-07-24T12:00:00.000Z',
          plannedDeparture: '2026-07-24T13:00:00.000Z',
          estimatedTravelMinutes: 20,
        }],
      })
      .expect(201);

    expect(mocks.createRoutePlan).toHaveBeenCalledWith(expect.objectContaining({
      tenantId: 'tenant-1',
      serviceDate: new Date('2026-07-24T00:00:00.000Z'),
      plannedStart: new Date('2026-07-24T11:00:00.000Z'),
      stops: [expect.objectContaining({
        plannedArrival: new Date('2026-07-24T12:00:00.000Z'),
        plannedDeparture: new Date('2026-07-24T13:00:00.000Z'),
      })],
    }));

    await request(app).post(`/api/v1/field-service/routes/${routeId}/publish`).expect(200);
    expect(mocks.publishRoutePlan).toHaveBeenCalledWith('tenant-1', routeId);
  });
});

describe('Call Guard intake HTTP contract', () => {
  const app = makeApp();

  test('accepts new calls and returns 201', async () => {
    mocks.ingestCallGuardCall.mockResolvedValue({ intake: { id: intakeId }, duplicate: false } as any);

    await request(app)
      .post('/api/v1/intake/callguard/calls')
      .send({
        externalCallId: 'cg-call-1',
        callerPhone: '555-0100',
        callerName: 'Pat Customer',
        summary: 'Septic tank is backing up',
        priority: 'URGENT',
        requestedService: 'SEPTIC_PUMPING',
        estimatedGallons: 1200,
        rawPayload: { source: 'callguard' },
      })
      .expect(201);

    expect(mocks.ingestCallGuardCall).toHaveBeenCalledWith(expect.objectContaining({
      tenantId: 'tenant-1', externalCallId: 'cg-call-1', priority: 'URGENT',
    }));
  });

  test('returns 200 for idempotent retries and rejects malformed calls', async () => {
    mocks.ingestCallGuardCall.mockResolvedValue({ intake: { id: intakeId }, duplicate: true } as any);

    await request(app)
      .post('/api/v1/intake/callguard/calls')
      .send({ externalCallId: 'cg-call-1', callerPhone: '555-0100', summary: 'Needs service' })
      .expect(200);

    await request(app)
      .post('/api/v1/intake/callguard/calls')
      .send({ externalCallId: '', callerPhone: 'x', summary: '' })
      .expect(400);
  });

  test('fails closed when the target tenant is not configured', async () => {
    delete process.env.CALLGUARD_TENANT_ID;

    await request(app)
      .post('/api/v1/intake/callguard/calls')
      .send({ externalCallId: 'cg-call-2', callerPhone: '555-0102', summary: 'Needs service' })
      .expect(503);
  });
});
