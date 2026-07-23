import { randomUUID } from 'crypto';
import { prisma } from '../prisma/client.js';
import { AppError } from '../errors/AppError.js';
import {
  applyLoadEvent,
  assertAssignmentCapacity,
  assertCompletionEvidence,
  calculateAvailableGallons,
  FieldServiceRuleError,
  type LoadEventType,
} from './fieldServiceRules.js';

const ACTIVE_CAPACITY_STATUSES = [
  'SCHEDULED',
  'DISPATCHED',
  'EN_ROUTE',
  'ON_SITE',
  'IN_PROGRESS',
  'NEEDS_DISPOSAL',
] as const;

const DEFAULT_REQUIRED_EVIDENCE = ['BEFORE_SERVICE', 'AFTER_SERVICE'];

function workOrderNumber(now = new Date()): string {
  const day = now.toISOString().slice(0, 10).replaceAll('-', '');
  return `FS-${day}-${randomUUID().slice(0, 8).toUpperCase()}`;
}

function requiredEvidenceFromJson(value: unknown): string[] {
  if (!Array.isArray(value)) return DEFAULT_REQUIRED_EVIDENCE;
  const values = value.filter((item): item is string => typeof item === 'string' && item.length > 0);
  return values.length > 0 ? values : DEFAULT_REQUIRED_EVIDENCE;
}

function mapRuleError(error: unknown): never {
  if (error instanceof FieldServiceRuleError) {
    const conflictCodes = new Set([
      'TRUCK_CAPACITY_EXCEEDED',
      'DISPOSAL_EXCEEDS_LOAD',
      'INVALID_LOAD_STATE',
    ]);
    if (conflictCodes.has(error.code)) {
      throw AppError.conflict(error.message, error.code);
    }
    throw AppError.badRequest(error.message, error.code);
  }
  throw error;
}

export async function listTrucks(tenantId: string) {
  const trucks = await prisma.truck.findMany({
    where: { tenantId, isActive: true },
    include: { assignedDriver: true },
    orderBy: { unitNumber: 'asc' },
  });

  return trucks.map((truck) => ({
    ...truck,
    availableGallons: calculateAvailableGallons(truck.tankCapacityGallons, truck.onboardGallons),
  }));
}

export async function createTruck(input: {
  tenantId: string;
  unitNumber: string;
  tankCapacityGallons: number;
  vin?: string;
  licensePlate?: string;
  description?: string;
  homeYard?: string;
  wasteCapabilities?: string[];
  assignedDriverId?: string;
}) {
  try {
    calculateAvailableGallons(input.tankCapacityGallons, 0);
  } catch (error) {
    mapRuleError(error);
  }

  return prisma.truck.create({
    data: {
      tenantId: input.tenantId,
      unitNumber: input.unitNumber,
      tankCapacityGallons: input.tankCapacityGallons,
      vin: input.vin,
      licensePlate: input.licensePlate,
      description: input.description,
      homeYard: input.homeYard,
      wasteCapabilities: input.wasteCapabilities ?? [],
      assignedDriverId: input.assignedDriverId,
    },
    include: { assignedDriver: true },
  });
}

export async function recordTruckLoadEvent(input: {
  tenantId: string;
  truckId: string;
  actorUserId: string;
  type: LoadEventType;
  gallons: number;
  fieldWorkOrderId?: string;
  evidencePhotoId?: string;
  disposalFacility?: string;
  disposalTicketNumber?: string;
  comments?: string;
  occurredAt?: Date;
}) {
  if (input.type === 'DISPOSAL') {
    if (!input.disposalFacility?.trim()) {
      throw AppError.badRequest('Disposal facility is required', 'DISPOSAL_FACILITY_REQUIRED');
    }
    if (!input.evidencePhotoId) {
      throw AppError.badRequest('A disposal-ticket photo is required', 'DISPOSAL_EVIDENCE_REQUIRED');
    }
  }

  return prisma.$transaction(async (tx) => {
    const truck = await tx.truck.findFirst({
      where: { id: input.truckId, tenantId: input.tenantId, isActive: true },
    });
    if (!truck) throw AppError.notFound('Truck not found', 'TRUCK_NOT_FOUND');

    let transition;
    try {
      transition = applyLoadEvent({
        type: input.type,
        gallons: input.gallons,
        capacityGallons: truck.tankCapacityGallons,
        onboardGallons: truck.onboardGallons,
      });
    } catch (error) {
      mapRuleError(error);
    }

    const nextStatus =
      input.type === 'DISPOSAL'
        ? 'AVAILABLE'
        : transition.resultingOnboardGallons >= truck.tankCapacityGallons
          ? 'NEEDS_DISPOSAL'
          : truck.status;

    const updated = await tx.truck.updateMany({
      where: {
        id: truck.id,
        tenantId: input.tenantId,
        onboardGallons: truck.onboardGallons,
        version: truck.version,
      },
      data: {
        onboardGallons: transition.resultingOnboardGallons,
        status: nextStatus,
        version: { increment: 1 },
      },
    });

    if (updated.count !== 1) {
      throw AppError.conflict(
        'Truck load changed while this event was being recorded; refresh and retry',
        'TRUCK_LOAD_CONFLICT',
      );
    }

    const event = await tx.truckLoadEvent.create({
      data: {
        tenantId: input.tenantId,
        truckId: truck.id,
        fieldWorkOrderId: input.fieldWorkOrderId,
        evidencePhotoId: input.evidencePhotoId,
        type: input.type,
        deltaGallons: transition.deltaGallons,
        resultingOnboardGallons: transition.resultingOnboardGallons,
        disposalFacility: input.disposalFacility,
        disposalTicketNumber: input.disposalTicketNumber,
        actorUserId: input.actorUserId,
        comments: input.comments,
        occurredAt: input.occurredAt,
      },
    });

    return { event, resultingOnboardGallons: transition.resultingOnboardGallons };
  });
}

export async function createCustomer(input: {
  tenantId: string;
  accountNumber?: string;
  name: string;
  primaryPhone?: string;
  alternatePhone?: string;
  email?: string;
  billingAddress?: Record<string, unknown>;
  notes?: string;
}) {
  return prisma.customer.create({
    data: {
      ...input,
      billingAddress: input.billingAddress as never,
    },
  });
}

export async function createServiceLocation(input: {
  tenantId: string;
  customerId: string;
  label?: string;
  addressLine1: string;
  addressLine2?: string;
  city: string;
  state: string;
  postalCode: string;
  latitude?: number;
  longitude?: number;
  accessNotes?: string;
  serviceNotes?: string;
  hazardNotes?: string;
  estimatedTankGallons?: number;
}) {
  const customer = await prisma.customer.findFirst({
    where: { id: input.customerId, tenantId: input.tenantId, isActive: true },
    select: { id: true },
  });
  if (!customer) throw AppError.notFound('Customer not found', 'CUSTOMER_NOT_FOUND');

  return prisma.serviceLocation.create({ data: input });
}

export async function createFieldWorkOrder(input: {
  tenantId: string;
  customerId: string;
  serviceLocationId: string;
  serviceType: string;
  priority: string;
  estimatedGallons: number;
  scheduledStart?: Date;
  scheduledEnd?: Date;
  dispatcherNotes?: string;
  requiredEvidence?: string[];
}) {
  const location = await prisma.serviceLocation.findFirst({
    where: {
      id: input.serviceLocationId,
      tenantId: input.tenantId,
      customerId: input.customerId,
      isActive: true,
    },
    select: { id: true },
  });
  if (!location) {
    throw AppError.notFound('Service location was not found for this customer', 'SERVICE_LOCATION_NOT_FOUND');
  }

  if (!Number.isInteger(input.estimatedGallons) || input.estimatedGallons < 0) {
    throw AppError.badRequest('Estimated gallons must be a non-negative whole number', 'INVALID_ESTIMATED_GALLONS');
  }

  return prisma.fieldWorkOrder.create({
    data: {
      tenantId: input.tenantId,
      workOrderNumber: workOrderNumber(),
      customerId: input.customerId,
      serviceLocationId: input.serviceLocationId,
      serviceType: input.serviceType as never,
      priority: input.priority as never,
      status: input.scheduledStart ? 'SCHEDULED' : 'NEW',
      estimatedGallons: input.estimatedGallons,
      scheduledStart: input.scheduledStart,
      scheduledEnd: input.scheduledEnd,
      dispatcherNotes: input.dispatcherNotes,
      requiredEvidence: input.requiredEvidence ?? DEFAULT_REQUIRED_EVIDENCE,
    },
    include: { customer: true, serviceLocation: true },
  });
}

export async function assignTruckToWorkOrder(input: {
  tenantId: string;
  workOrderId: string;
  truckId: string;
  driverId?: string;
}) {
  return prisma.$transaction(async (tx) => {
    const [workOrder, truck] = await Promise.all([
      tx.fieldWorkOrder.findFirst({
        where: { id: input.workOrderId, tenantId: input.tenantId },
      }),
      tx.truck.findFirst({
        where: { id: input.truckId, tenantId: input.tenantId, isActive: true },
      }),
    ]);

    if (!workOrder) throw AppError.notFound('Field work order not found', 'FIELD_WORK_ORDER_NOT_FOUND');
    if (!truck) throw AppError.notFound('Truck not found', 'TRUCK_NOT_FOUND');
    if (truck.status === 'OUT_OF_SERVICE') {
      throw AppError.conflict('Out-of-service trucks cannot be assigned', 'TRUCK_OUT_OF_SERVICE');
    }
    if (['COMPLETED', 'CANCELLED'].includes(workOrder.status)) {
      throw AppError.conflict('Completed or cancelled work orders cannot be reassigned', 'WORK_ORDER_CLOSED');
    }

    const reserved = await tx.fieldWorkOrder.aggregate({
      where: {
        tenantId: input.tenantId,
        assignedTruckId: truck.id,
        id: { not: workOrder.id },
        status: { in: [...ACTIVE_CAPACITY_STATUSES] },
      },
      _sum: { estimatedGallons: true },
    });

    try {
      assertAssignmentCapacity({
        capacityGallons: truck.tankCapacityGallons,
        onboardGallons: truck.onboardGallons,
        reservedGallons: reserved._sum.estimatedGallons ?? 0,
        estimatedGallons: workOrder.estimatedGallons,
      });
    } catch (error) {
      mapRuleError(error);
    }

    const driverId = input.driverId ?? truck.assignedDriverId ?? undefined;
    const updated = await tx.fieldWorkOrder.update({
      where: { id: workOrder.id },
      data: {
        assignedTruckId: truck.id,
        assignedDriverId: driverId,
        status: workOrder.scheduledStart ? 'SCHEDULED' : 'TRIAGED',
      },
      include: { customer: true, serviceLocation: true, assignedTruck: true, assignedDriver: true },
    });

    if (truck.status === 'AVAILABLE') {
      await tx.truck.update({
        where: { id: truck.id },
        data: { status: 'ASSIGNED' },
      });
    }

    return updated;
  });
}

export async function registerWorkOrderPhoto(input: {
  tenantId: string;
  workOrderId: string;
  type: string;
  fileName: string;
  mimeType: string;
  storageKey: string;
  sha256: string;
  capturedAt: Date;
  capturedByUserId: string;
  comment?: string;
  latitude?: number;
  longitude?: number;
}) {
  const workOrder = await prisma.fieldWorkOrder.findFirst({
    where: { id: input.workOrderId, tenantId: input.tenantId },
    select: { id: true, status: true },
  });
  if (!workOrder) throw AppError.notFound('Field work order not found', 'FIELD_WORK_ORDER_NOT_FOUND');
  if (['COMPLETED', 'CANCELLED'].includes(workOrder.status)) {
    throw AppError.conflict('Evidence cannot be added to a closed work order', 'WORK_ORDER_CLOSED');
  }

  return prisma.workOrderPhoto.create({
    data: {
      tenantId: input.tenantId,
      fieldWorkOrderId: workOrder.id,
      type: input.type as never,
      fileName: input.fileName,
      mimeType: input.mimeType,
      storageKey: input.storageKey,
      sha256: input.sha256.toLowerCase(),
      capturedAt: input.capturedAt,
      capturedByUserId: input.capturedByUserId,
      comment: input.comment,
      latitude: input.latitude,
      longitude: input.longitude,
    },
  });
}

export async function completeFieldWorkOrder(input: {
  tenantId: string;
  workOrderId: string;
  actorUserId: string;
  actualGallons: number;
  technicianComments: string;
  customerSignatureName?: string;
}) {
  return prisma.$transaction(async (tx) => {
    const workOrder = await tx.fieldWorkOrder.findFirst({
      where: { id: input.workOrderId, tenantId: input.tenantId },
      include: { photos: true, assignedTruck: true },
    });

    if (!workOrder) throw AppError.notFound('Field work order not found', 'FIELD_WORK_ORDER_NOT_FOUND');
    if (workOrder.status === 'COMPLETED') {
      throw AppError.conflict('Work order is already completed', 'WORK_ORDER_ALREADY_COMPLETED');
    }
    if (workOrder.status === 'CANCELLED') {
      throw AppError.conflict('Cancelled work orders cannot be completed', 'WORK_ORDER_CANCELLED');
    }
    if (!workOrder.assignedTruck) {
      throw AppError.conflict('A truck must be assigned before completion', 'TRUCK_ASSIGNMENT_REQUIRED');
    }

    try {
      assertCompletionEvidence({
        actualGallons: input.actualGallons,
        technicianComments: input.technicianComments,
        requiredEvidence: requiredEvidenceFromJson(workOrder.requiredEvidence),
        capturedEvidence: workOrder.photos.map((photo) => photo.type),
      });
    } catch (error) {
      mapRuleError(error);
    }

    let transition;
    try {
      transition = applyLoadEvent({
        type: 'PUMP_IN',
        gallons: input.actualGallons,
        capacityGallons: workOrder.assignedTruck.tankCapacityGallons,
        onboardGallons: workOrder.assignedTruck.onboardGallons,
      });
    } catch (error) {
      mapRuleError(error);
    }

    const truckUpdate = await tx.truck.updateMany({
      where: {
        id: workOrder.assignedTruck.id,
        tenantId: input.tenantId,
        onboardGallons: workOrder.assignedTruck.onboardGallons,
        version: workOrder.assignedTruck.version,
      },
      data: {
        onboardGallons: transition.resultingOnboardGallons,
        status:
          transition.resultingOnboardGallons >= workOrder.assignedTruck.tankCapacityGallons
            ? 'NEEDS_DISPOSAL'
            : 'ASSIGNED',
        version: { increment: 1 },
      },
    });

    if (truckUpdate.count !== 1) {
      throw AppError.conflict(
        'Truck load changed while the work order was completing; refresh and retry',
        'TRUCK_LOAD_CONFLICT',
      );
    }

    const [completed] = await Promise.all([
      tx.fieldWorkOrder.update({
        where: { id: workOrder.id },
        data: {
          status: 'COMPLETED',
          actualGallons: input.actualGallons,
          technicianComments: input.technicianComments.trim(),
          customerSignatureName: input.customerSignatureName?.trim() || undefined,
          completedAt: new Date(),
        },
        include: { customer: true, serviceLocation: true, assignedTruck: true, photos: true },
      }),
      tx.truckLoadEvent.create({
        data: {
          tenantId: input.tenantId,
          truckId: workOrder.assignedTruck.id,
          fieldWorkOrderId: workOrder.id,
          type: 'PUMP_IN',
          deltaGallons: transition.deltaGallons,
          resultingOnboardGallons: transition.resultingOnboardGallons,
          actorUserId: input.actorUserId,
          comments: input.technicianComments.trim(),
        },
      }),
    ]);

    return completed;
  });
}

export async function ingestCallGuardCall(input: {
  tenantId: string;
  externalCallId: string;
  callerPhone: string;
  callerName?: string;
  summary: string;
  transcript?: string;
  priority?: string;
  requestedService?: string;
  estimatedGallons?: number;
  rawPayload?: Record<string, unknown>;
}) {
  const existing = await prisma.callIntake.findUnique({
    where: {
      tenantId_externalCallId: {
        tenantId: input.tenantId,
        externalCallId: input.externalCallId,
      },
    },
  });

  if (existing) return { intake: existing, duplicate: true };

  const intake = await prisma.callIntake.create({
    data: {
      tenantId: input.tenantId,
      externalCallId: input.externalCallId,
      callerPhone: input.callerPhone,
      callerName: input.callerName,
      summary: input.summary,
      transcript: input.transcript,
      priority: (input.priority ?? 'ROUTINE') as never,
      requestedService: input.requestedService as never,
      estimatedGallons: input.estimatedGallons,
      rawPayload: input.rawPayload as never,
    },
  });

  return { intake, duplicate: false };
}

export async function convertCallIntake(input: {
  tenantId: string;
  intakeId: string;
  customerId: string;
  serviceLocationId: string;
  serviceType?: string;
  estimatedGallons?: number;
  scheduledStart?: Date;
  scheduledEnd?: Date;
  dispatcherNotes?: string;
}) {
  return prisma.$transaction(async (tx) => {
    const intake = await tx.callIntake.findFirst({
      where: { id: input.intakeId, tenantId: input.tenantId },
    });
    if (!intake) throw AppError.notFound('Call intake not found', 'CALL_INTAKE_NOT_FOUND');
    if (intake.status === 'CONVERTED' || intake.workOrderId) {
      throw AppError.conflict('Call intake has already been converted', 'CALL_INTAKE_ALREADY_CONVERTED');
    }

    const location = await tx.serviceLocation.findFirst({
      where: {
        id: input.serviceLocationId,
        tenantId: input.tenantId,
        customerId: input.customerId,
        isActive: true,
      },
      select: { id: true },
    });
    if (!location) {
      throw AppError.notFound('Service location was not found for this customer', 'SERVICE_LOCATION_NOT_FOUND');
    }

    const estimatedGallons = input.estimatedGallons ?? intake.estimatedGallons ?? 0;
    if (!Number.isInteger(estimatedGallons) || estimatedGallons < 0) {
      throw AppError.badRequest('Estimated gallons must be a non-negative whole number', 'INVALID_ESTIMATED_GALLONS');
    }

    const workOrder = await tx.fieldWorkOrder.create({
      data: {
        tenantId: input.tenantId,
        workOrderNumber: workOrderNumber(),
        customerId: input.customerId,
        serviceLocationId: input.serviceLocationId,
        serviceType: (input.serviceType ?? intake.requestedService ?? 'OTHER') as never,
        priority: intake.priority,
        status: input.scheduledStart ? 'SCHEDULED' : 'TRIAGED',
        estimatedGallons,
        scheduledStart: input.scheduledStart,
        scheduledEnd: input.scheduledEnd,
        dispatcherNotes: input.dispatcherNotes ?? intake.summary,
        requiredEvidence: DEFAULT_REQUIRED_EVIDENCE,
      },
      include: { customer: true, serviceLocation: true },
    });

    await tx.callIntake.update({
      where: { id: intake.id },
      data: {
        status: 'CONVERTED',
        customerId: input.customerId,
        serviceLocationId: input.serviceLocationId,
        workOrderId: workOrder.id,
      },
    });

    return workOrder;
  });
}

export async function getDispatchBoard(tenantId: string) {
  const [trucks, workOrders, callIntakes, reservations] = await Promise.all([
    listTrucks(tenantId),
    prisma.fieldWorkOrder.findMany({
      where: {
        tenantId,
        status: { notIn: ['COMPLETED', 'CANCELLED'] },
      },
      include: {
        customer: true,
        serviceLocation: true,
        assignedTruck: true,
        assignedDriver: true,
        routeStop: { include: { routePlan: true } },
      },
      orderBy: [{ priority: 'desc' }, { scheduledStart: 'asc' }, { createdAt: 'asc' }],
    }),
    prisma.callIntake.findMany({
      where: { tenantId, status: { in: ['RECEIVED', 'TRIAGED'] } },
      orderBy: [{ priority: 'desc' }, { receivedAt: 'asc' }],
      take: 100,
    }),
    prisma.fieldWorkOrder.groupBy({
      by: ['assignedTruckId'],
      where: {
        tenantId,
        assignedTruckId: { not: null },
        status: { in: [...ACTIVE_CAPACITY_STATUSES] },
      },
      _sum: { estimatedGallons: true },
    }),
  ]);

  const reservedByTruck = new Map(
    reservations
      .filter((item) => item.assignedTruckId)
      .map((item) => [item.assignedTruckId as string, item._sum.estimatedGallons ?? 0]),
  );

  return {
    trucks: trucks.map((truck) => ({
      ...truck,
      reservedGallons: reservedByTruck.get(truck.id) ?? 0,
      dispatchableGallons: Math.max(0, truck.availableGallons - (reservedByTruck.get(truck.id) ?? 0)),
    })),
    workOrders,
    callIntakes,
  };
}

export async function searchCustomers(tenantId: string, query?: string) {
  return prisma.customer.findMany({
    where: {
      tenantId,
      isActive: true,
      ...(query
        ? {
            OR: [
              { name: { contains: query, mode: 'insensitive' } },
              { accountNumber: { contains: query, mode: 'insensitive' } },
              { primaryPhone: { contains: query } },
              { email: { contains: query, mode: 'insensitive' } },
            ],
          }
        : {}),
    },
    include: { serviceLocations: { where: { isActive: true } } },
    orderBy: { name: 'asc' },
    take: 100,
  });
}

export async function getCustomer(tenantId: string, customerId: string) {
  const customer = await prisma.customer.findFirst({
    where: { id: customerId, tenantId, isActive: true },
    include: {
      serviceLocations: { where: { isActive: true }, orderBy: { createdAt: 'asc' } },
      workOrders: {
        orderBy: { createdAt: 'desc' },
        take: 50,
        include: { assignedTruck: true },
      },
    },
  });
  if (!customer) throw AppError.notFound('Customer not found', 'CUSTOMER_NOT_FOUND');
  return customer;
}

export async function listFieldWorkOrders(input: {
  tenantId: string;
  status?: string;
  truckId?: string;
  driverId?: string;
}) {
  return prisma.fieldWorkOrder.findMany({
    where: {
      tenantId: input.tenantId,
      ...(input.status ? { status: input.status as never } : {}),
      ...(input.truckId ? { assignedTruckId: input.truckId } : {}),
      ...(input.driverId ? { assignedDriverId: input.driverId } : {}),
    },
    include: {
      customer: true,
      serviceLocation: true,
      assignedTruck: true,
      assignedDriver: true,
      photos: true,
      routeStop: { include: { routePlan: true } },
    },
    orderBy: [{ scheduledStart: 'asc' }, { createdAt: 'asc' }],
    take: 250,
  });
}

export async function createRoutePlan(input: {
  tenantId: string;
  name: string;
  serviceDate: Date;
  truckId: string;
  driverId: string;
  plannedStart?: Date;
  stops: Array<{
    workOrderId: string;
    sequence: number;
    plannedArrival?: Date;
    plannedDeparture?: Date;
    estimatedTravelMinutes?: number;
    notes?: string;
  }>;
}) {
  if (input.stops.length === 0) {
    throw AppError.badRequest('A route plan must contain at least one stop', 'ROUTE_STOPS_REQUIRED');
  }

  const sequences = new Set(input.stops.map((stop) => stop.sequence));
  if (sequences.size !== input.stops.length || Math.min(...sequences) < 1) {
    throw AppError.badRequest('Route stop sequences must be unique positive integers', 'INVALID_ROUTE_SEQUENCE');
  }

  return prisma.$transaction(async (tx) => {
    const [truck, driver, workOrders] = await Promise.all([
      tx.truck.findFirst({
        where: { id: input.truckId, tenantId: input.tenantId, isActive: true },
      }),
      tx.user.findFirst({
        where: {
          id: input.driverId,
          tenantId: input.tenantId,
          isActive: true,
          role: { in: ['Tech', 'Supervisor'] },
        },
      }),
      tx.fieldWorkOrder.findMany({
        where: {
          id: { in: input.stops.map((stop) => stop.workOrderId) },
          tenantId: input.tenantId,
          status: { notIn: ['COMPLETED', 'CANCELLED'] },
        },
        include: { routeStop: true },
      }),
    ]);

    if (!truck) throw AppError.notFound('Truck not found', 'TRUCK_NOT_FOUND');
    if (!driver) throw AppError.notFound('Driver not found', 'DRIVER_NOT_FOUND');
    if (truck.status === 'OUT_OF_SERVICE') {
      throw AppError.conflict('Out-of-service trucks cannot receive a route', 'TRUCK_OUT_OF_SERVICE');
    }
    if (workOrders.length !== input.stops.length) {
      throw AppError.notFound('One or more route work orders were not found or are closed', 'ROUTE_WORK_ORDER_NOT_FOUND');
    }
    if (workOrders.some((workOrder) => workOrder.routeStop)) {
      throw AppError.conflict('One or more work orders already belong to a route', 'WORK_ORDER_ALREADY_ROUTED');
    }

    const routeGallons = workOrders.reduce((sum, workOrder) => sum + workOrder.estimatedGallons, 0);
    try {
      assertAssignmentCapacity({
        capacityGallons: truck.tankCapacityGallons,
        onboardGallons: truck.onboardGallons,
        reservedGallons: 0,
        estimatedGallons: routeGallons,
      });
    } catch (error) {
      mapRuleError(error);
    }

    const routePlan = await tx.routePlan.create({
      data: {
        tenantId: input.tenantId,
        name: input.name,
        serviceDate: input.serviceDate,
        truckId: truck.id,
        driverId: driver.id,
        plannedStart: input.plannedStart,
        stops: {
          create: [...input.stops]
            .sort((a, b) => a.sequence - b.sequence)
            .map((stop) => ({
              fieldWorkOrderId: stop.workOrderId,
              sequence: stop.sequence,
              plannedArrival: stop.plannedArrival,
              plannedDeparture: stop.plannedDeparture,
              estimatedTravelMinutes: stop.estimatedTravelMinutes,
              notes: stop.notes,
            })),
        },
      },
      include: {
        truck: true,
        driver: true,
        stops: {
          orderBy: { sequence: 'asc' },
          include: {
            fieldWorkOrder: { include: { customer: true, serviceLocation: true } },
          },
        },
      },
    });

    await Promise.all([
      tx.fieldWorkOrder.updateMany({
        where: { id: { in: workOrders.map((workOrder) => workOrder.id) } },
        data: {
          assignedTruckId: truck.id,
          assignedDriverId: driver.id,
          status: 'SCHEDULED',
        },
      }),
      tx.truck.update({
        where: { id: truck.id },
        data: { status: 'ASSIGNED', assignedDriverId: driver.id },
      }),
    ]);

    return routePlan;
  });
}

export async function listRoutePlans(input: {
  tenantId: string;
  serviceDate?: Date;
  status?: string;
}) {
  return prisma.routePlan.findMany({
    where: {
      tenantId: input.tenantId,
      ...(input.serviceDate ? { serviceDate: input.serviceDate } : {}),
      ...(input.status ? { status: input.status as never } : {}),
    },
    include: {
      truck: true,
      driver: true,
      stops: {
        orderBy: { sequence: 'asc' },
        include: {
          fieldWorkOrder: { include: { customer: true, serviceLocation: true } },
        },
      },
    },
    orderBy: [{ serviceDate: 'asc' }, { plannedStart: 'asc' }],
  });
}

export async function publishRoutePlan(tenantId: string, routePlanId: string) {
  return prisma.$transaction(async (tx) => {
    const route = await tx.routePlan.findFirst({
      where: { id: routePlanId, tenantId },
      include: { stops: true },
    });
    if (!route) throw AppError.notFound('Route plan not found', 'ROUTE_PLAN_NOT_FOUND');
    if (route.status !== 'DRAFT') {
      throw AppError.conflict('Only draft routes can be published', 'ROUTE_NOT_DRAFT');
    }

    const [published] = await Promise.all([
      tx.routePlan.update({
        where: { id: route.id },
        data: { status: 'PUBLISHED', publishedAt: new Date() },
        include: {
          truck: true,
          driver: true,
          stops: {
            orderBy: { sequence: 'asc' },
            include: {
              fieldWorkOrder: { include: { customer: true, serviceLocation: true } },
            },
          },
        },
      }),
      tx.fieldWorkOrder.updateMany({
        where: { id: { in: route.stops.map((stop) => stop.fieldWorkOrderId) } },
        data: { status: 'DISPATCHED', dispatchedAt: new Date() },
      }),
    ]);

    return published;
  });
}
