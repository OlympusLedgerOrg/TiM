import { Router } from 'express';
import { z } from 'zod';
import { requireAuth, requireRole } from '../middleware/auth.js';
import { AppError } from '../errors/AppError.js';
import {
  assignTruckToWorkOrder,
  completeFieldWorkOrder,
  convertCallIntake,
  createCustomer,
  createFieldWorkOrder,
  createRoutePlan,
  createServiceLocation,
  createTruck,
  getCustomer,
  getDispatchBoard,
  listFieldWorkOrders,
  listRoutePlans,
  listTrucks,
  publishRoutePlan,
  recordTruckLoadEvent,
  registerWorkOrderPhoto,
  searchCustomers,
} from '../services/fieldServiceService.js';

const router = Router();
const supervisorRoles = requireRole(['Supervisor', 'Admin']);
const fieldRoles = requireRole(['Tech', 'Supervisor', 'Admin']);

const serviceTypes = [
  'SEPTIC_PUMPING',
  'GREASE_TRAP',
  'HOLDING_TANK',
  'PORTABLE_RESTROOM',
  'DRAIN_CLEANING',
  'JETTING',
  'INSPECTION',
  'REPAIR',
  'EMERGENCY_RESPONSE',
  'OTHER',
] as const;

const priorities = ['ROUTINE', 'PRIORITY', 'URGENT', 'EMERGENCY'] as const;
const evidenceTypes = [
  'BEFORE_SERVICE',
  'ACCESS_POINT',
  'CONDITION',
  'AFTER_SERVICE',
  'DISPOSAL_TICKET',
  'CUSTOMER_SIGNATURE',
  'OTHER',
] as const;

function parseBody<T>(schema: z.ZodSchema<T>, body: unknown): T {
  const parsed = schema.safeParse(body);
  if (!parsed.success) {
    throw AppError.badRequest(parsed.error.issues.map((issue) => issue.message).join('; '), 'VALIDATION_ERROR');
  }
  return parsed.data;
}

function dateOrUndefined(value?: string): Date | undefined {
  return value ? new Date(value) : undefined;
}

router.use(requireAuth);

router.get('/dispatch-board', supervisorRoles, async (req, res) => {
  return res.json(await getDispatchBoard(req.user!.tenantId));
});

router.get('/trucks', fieldRoles, async (req, res) => {
  return res.json({ trucks: await listTrucks(req.user!.tenantId) });
});

router.post('/trucks', supervisorRoles, async (req, res) => {
  const body = parseBody(z.object({
    unitNumber: z.string().trim().min(1).max(50),
    tankCapacityGallons: z.number().int().positive().max(20_000),
    vin: z.string().trim().max(100).optional(),
    licensePlate: z.string().trim().max(30).optional(),
    description: z.string().trim().max(500).optional(),
    homeYard: z.string().trim().max(200).optional(),
    wasteCapabilities: z.array(z.string().trim().min(1).max(100)).max(50).optional(),
    assignedDriverId: z.string().min(1).max(200).optional(),
  }), req.body);

  const truck = await createTruck({ tenantId: req.user!.tenantId, ...body });
  return res.status(201).json({ truck });
});

router.post('/trucks/:truckId/load-events', fieldRoles, async (req, res) => {
  const body = parseBody(z.object({
    type: z.enum(['PUMP_IN', 'DISPOSAL', 'ADJUSTMENT']),
    gallons: z.number().int().min(-20_000).max(20_000),
    fieldWorkOrderId: z.string().uuid().optional(),
    evidencePhotoId: z.string().uuid().optional(),
    disposalFacility: z.string().trim().max(300).optional(),
    disposalTicketNumber: z.string().trim().max(200).optional(),
    comments: z.string().trim().max(5000).optional(),
    occurredAt: z.string().datetime().optional(),
  }), req.body);

  const result = await recordTruckLoadEvent({
    tenantId: req.user!.tenantId,
    truckId: req.params.truckId,
    actorUserId: req.user!.id,
    ...body,
    occurredAt: dateOrUndefined(body.occurredAt),
  });
  return res.status(201).json(result);
});

router.get('/customers', fieldRoles, async (req, res) => {
  const query = typeof req.query.query === 'string' ? req.query.query.trim() : undefined;
  return res.json({ customers: await searchCustomers(req.user!.tenantId, query) });
});

router.get('/customers/:customerId', fieldRoles, async (req, res) => {
  return res.json({ customer: await getCustomer(req.user!.tenantId, req.params.customerId) });
});

router.post('/customers', supervisorRoles, async (req, res) => {
  const body = parseBody(z.object({
    accountNumber: z.string().trim().max(100).optional(),
    name: z.string().trim().min(1).max(300),
    primaryPhone: z.string().trim().max(50).optional(),
    alternatePhone: z.string().trim().max(50).optional(),
    email: z.string().email().max(320).optional(),
    billingAddress: z.record(z.unknown()).optional(),
    notes: z.string().trim().max(5000).optional(),
  }), req.body);

  const customer = await createCustomer({ tenantId: req.user!.tenantId, ...body });
  return res.status(201).json({ customer });
});

router.post('/customers/:customerId/locations', supervisorRoles, async (req, res) => {
  const body = parseBody(z.object({
    label: z.string().trim().max(200).optional(),
    addressLine1: z.string().trim().min(1).max(300),
    addressLine2: z.string().trim().max(300).optional(),
    city: z.string().trim().min(1).max(150),
    state: z.string().trim().min(2).max(100),
    postalCode: z.string().trim().min(3).max(20),
    latitude: z.number().min(-90).max(90).optional(),
    longitude: z.number().min(-180).max(180).optional(),
    accessNotes: z.string().trim().max(5000).optional(),
    serviceNotes: z.string().trim().max(5000).optional(),
    hazardNotes: z.string().trim().max(5000).optional(),
    estimatedTankGallons: z.number().int().positive().max(20_000).optional(),
  }), req.body);

  const location = await createServiceLocation({
    tenantId: req.user!.tenantId,
    customerId: req.params.customerId,
    ...body,
  });
  return res.status(201).json({ location });
});

router.get('/work-orders', fieldRoles, async (req, res) => {
  const workOrders = await listFieldWorkOrders({
    tenantId: req.user!.tenantId,
    status: typeof req.query.status === 'string' ? req.query.status : undefined,
    truckId: typeof req.query.truckId === 'string' ? req.query.truckId : undefined,
    driverId: typeof req.query.driverId === 'string' ? req.query.driverId : undefined,
  });
  return res.json({ workOrders });
});

router.post('/work-orders', supervisorRoles, async (req, res) => {
  const body = parseBody(z.object({
    customerId: z.string().uuid(),
    serviceLocationId: z.string().uuid(),
    serviceType: z.enum(serviceTypes),
    priority: z.enum(priorities).default('ROUTINE'),
    estimatedGallons: z.number().int().min(0).max(20_000),
    scheduledStart: z.string().datetime().optional(),
    scheduledEnd: z.string().datetime().optional(),
    dispatcherNotes: z.string().trim().max(5000).optional(),
    requiredEvidence: z.array(z.enum(evidenceTypes)).min(1).max(20).optional(),
  }), req.body);

  const workOrder = await createFieldWorkOrder({
    tenantId: req.user!.tenantId,
    ...body,
    scheduledStart: dateOrUndefined(body.scheduledStart),
    scheduledEnd: dateOrUndefined(body.scheduledEnd),
  });
  return res.status(201).json({ workOrder });
});

router.put('/work-orders/:workOrderId/assignment', supervisorRoles, async (req, res) => {
  const body = parseBody(z.object({
    truckId: z.string().uuid(),
    driverId: z.string().min(1).max(200).optional(),
  }), req.body);

  const workOrder = await assignTruckToWorkOrder({
    tenantId: req.user!.tenantId,
    workOrderId: req.params.workOrderId,
    ...body,
  });
  return res.json({ workOrder });
});

router.post('/work-orders/:workOrderId/photos', fieldRoles, async (req, res) => {
  const body = parseBody(z.object({
    type: z.enum(evidenceTypes),
    fileName: z.string().trim().min(1).max(300),
    mimeType: z.string().trim().regex(/^image\//, 'Only image evidence is accepted'),
    storageKey: z.string().trim().min(1).max(1000),
    sha256: z.string().regex(/^[a-fA-F0-9]{64}$/),
    capturedAt: z.string().datetime(),
    comment: z.string().trim().max(5000).optional(),
    latitude: z.number().min(-90).max(90).optional(),
    longitude: z.number().min(-180).max(180).optional(),
  }), req.body);

  const photo = await registerWorkOrderPhoto({
    tenantId: req.user!.tenantId,
    workOrderId: req.params.workOrderId,
    capturedByUserId: req.user!.id,
    ...body,
    capturedAt: new Date(body.capturedAt),
  });
  return res.status(201).json({ photo });
});

router.post('/work-orders/:workOrderId/complete', requireRole(['Tech', 'Supervisor']), async (req, res) => {
  const body = parseBody(z.object({
    actualGallons: z.number().int().positive().max(20_000),
    technicianComments: z.string().trim().min(3).max(10_000),
    customerSignatureName: z.string().trim().max(300).optional(),
  }), req.body);

  const workOrder = await completeFieldWorkOrder({
    tenantId: req.user!.tenantId,
    workOrderId: req.params.workOrderId,
    actorUserId: req.user!.id,
    ...body,
  });
  return res.json({ workOrder });
});

router.post('/call-intakes/:intakeId/convert', supervisorRoles, async (req, res) => {
  const body = parseBody(z.object({
    customerId: z.string().uuid(),
    serviceLocationId: z.string().uuid(),
    serviceType: z.enum(serviceTypes).optional(),
    estimatedGallons: z.number().int().min(0).max(20_000).optional(),
    scheduledStart: z.string().datetime().optional(),
    scheduledEnd: z.string().datetime().optional(),
    dispatcherNotes: z.string().trim().max(5000).optional(),
  }), req.body);

  const workOrder = await convertCallIntake({
    tenantId: req.user!.tenantId,
    intakeId: req.params.intakeId,
    ...body,
    scheduledStart: dateOrUndefined(body.scheduledStart),
    scheduledEnd: dateOrUndefined(body.scheduledEnd),
  });
  return res.status(201).json({ workOrder });
});

router.get('/routes', fieldRoles, async (req, res) => {
  const serviceDate = typeof req.query.serviceDate === 'string'
    ? new Date(`${req.query.serviceDate}T00:00:00.000Z`)
    : undefined;
  const status = typeof req.query.status === 'string' ? req.query.status : undefined;
  return res.json({ routes: await listRoutePlans({ tenantId: req.user!.tenantId, serviceDate, status }) });
});

router.post('/routes', supervisorRoles, async (req, res) => {
  const body = parseBody(z.object({
    name: z.string().trim().min(1).max(300),
    serviceDate: z.string().date(),
    truckId: z.string().uuid(),
    driverId: z.string().min(1).max(200),
    plannedStart: z.string().datetime().optional(),
    stops: z.array(z.object({
      workOrderId: z.string().uuid(),
      sequence: z.number().int().positive(),
      plannedArrival: z.string().datetime().optional(),
      plannedDeparture: z.string().datetime().optional(),
      estimatedTravelMinutes: z.number().int().min(0).max(1440).optional(),
      notes: z.string().trim().max(5000).optional(),
    })).min(1).max(100),
  }), req.body);

  const routePlan = await createRoutePlan({
    tenantId: req.user!.tenantId,
    ...body,
    serviceDate: new Date(`${body.serviceDate}T00:00:00.000Z`),
    plannedStart: dateOrUndefined(body.plannedStart),
    stops: body.stops.map((stop) => ({
      ...stop,
      plannedArrival: dateOrUndefined(stop.plannedArrival),
      plannedDeparture: dateOrUndefined(stop.plannedDeparture),
    })),
  });
  return res.status(201).json({ routePlan });
});

router.post('/routes/:routePlanId/publish', supervisorRoles, async (req, res) => {
  return res.json({ routePlan: await publishRoutePlan(req.user!.tenantId, req.params.routePlanId) });
});

export default router;
