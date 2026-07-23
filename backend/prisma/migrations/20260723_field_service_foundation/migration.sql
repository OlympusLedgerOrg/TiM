-- Field-service foundation for the TiM rebuild.
-- This migration is additive so the legacy manufacturing modules remain usable
-- while dispatch, fleet, route, call-intake, and service-execution workflows ship.

CREATE TYPE "CallIntakeStatus" AS ENUM ('RECEIVED', 'TRIAGED', 'CONVERTED', 'DUPLICATE', 'REJECTED');
CREATE TYPE "FieldWorkOrderStatus" AS ENUM ('NEW', 'TRIAGED', 'SCHEDULED', 'DISPATCHED', 'EN_ROUTE', 'ON_SITE', 'IN_PROGRESS', 'NEEDS_DISPOSAL', 'COMPLETED', 'CANCELLED');
CREATE TYPE "ServicePriority" AS ENUM ('ROUTINE', 'PRIORITY', 'URGENT', 'EMERGENCY');
CREATE TYPE "ServiceType" AS ENUM ('SEPTIC_PUMPING', 'GREASE_TRAP', 'HOLDING_TANK', 'PORTABLE_RESTROOM', 'DRAIN_CLEANING', 'JETTING', 'INSPECTION', 'REPAIR', 'EMERGENCY_RESPONSE', 'OTHER');
CREATE TYPE "TruckStatus" AS ENUM ('AVAILABLE', 'ASSIGNED', 'EN_ROUTE', 'ON_SITE', 'NEEDS_DISPOSAL', 'AT_DISPOSAL', 'OUT_OF_SERVICE');
CREATE TYPE "TruckLoadEventType" AS ENUM ('PUMP_IN', 'DISPOSAL', 'ADJUSTMENT');
CREATE TYPE "EvidenceType" AS ENUM ('BEFORE_SERVICE', 'ACCESS_POINT', 'CONDITION', 'AFTER_SERVICE', 'DISPOSAL_TICKET', 'CUSTOMER_SIGNATURE', 'OTHER');
CREATE TYPE "RouteStatus" AS ENUM ('DRAFT', 'PUBLISHED', 'IN_PROGRESS', 'COMPLETED', 'CANCELLED');

CREATE TABLE "Customer" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "accountNumber" TEXT,
    "name" TEXT NOT NULL,
    "primaryPhone" TEXT,
    "alternatePhone" TEXT,
    "email" TEXT,
    "billingAddress" JSONB,
    "notes" TEXT,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "Customer_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "ServiceLocation" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "customerId" TEXT NOT NULL,
    "label" TEXT,
    "addressLine1" TEXT NOT NULL,
    "addressLine2" TEXT,
    "city" TEXT NOT NULL,
    "state" TEXT NOT NULL,
    "postalCode" TEXT NOT NULL,
    "latitude" DECIMAL(9,6),
    "longitude" DECIMAL(9,6),
    "accessNotes" TEXT,
    "serviceNotes" TEXT,
    "hazardNotes" TEXT,
    "estimatedTankGallons" INTEGER,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "ServiceLocation_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "Truck" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "unitNumber" TEXT NOT NULL,
    "vin" TEXT,
    "licensePlate" TEXT,
    "description" TEXT,
    "tankCapacityGallons" INTEGER NOT NULL,
    "onboardGallons" INTEGER NOT NULL DEFAULT 0,
    "wasteCapabilities" JSONB,
    "status" "TruckStatus" NOT NULL DEFAULT 'AVAILABLE',
    "homeYard" TEXT,
    "currentLatitude" DECIMAL(9,6),
    "currentLongitude" DECIMAL(9,6),
    "assignedDriverId" TEXT,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "version" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "Truck_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "Truck_capacity_check" CHECK ("tankCapacityGallons" > 0),
    CONSTRAINT "Truck_load_check" CHECK ("onboardGallons" >= 0 AND "onboardGallons" <= "tankCapacityGallons")
);

CREATE TABLE "CallIntake" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "externalCallId" TEXT NOT NULL,
    "callerPhone" TEXT NOT NULL,
    "callerName" TEXT,
    "summary" TEXT NOT NULL,
    "transcript" TEXT,
    "priority" "ServicePriority" NOT NULL DEFAULT 'ROUTINE',
    "requestedService" "ServiceType",
    "estimatedGallons" INTEGER,
    "status" "CallIntakeStatus" NOT NULL DEFAULT 'RECEIVED',
    "customerId" TEXT,
    "serviceLocationId" TEXT,
    "workOrderId" TEXT,
    "receivedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "rawPayload" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "CallIntake_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "CallIntake_estimated_gallons_check" CHECK ("estimatedGallons" IS NULL OR "estimatedGallons" >= 0)
);

CREATE TABLE "FieldWorkOrder" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "workOrderNumber" TEXT NOT NULL,
    "customerId" TEXT NOT NULL,
    "serviceLocationId" TEXT NOT NULL,
    "serviceType" "ServiceType" NOT NULL,
    "priority" "ServicePriority" NOT NULL DEFAULT 'ROUTINE',
    "status" "FieldWorkOrderStatus" NOT NULL DEFAULT 'NEW',
    "estimatedGallons" INTEGER NOT NULL DEFAULT 0,
    "actualGallons" INTEGER,
    "requiredEvidence" JSONB,
    "scheduledStart" TIMESTAMP(3),
    "scheduledEnd" TIMESTAMP(3),
    "dispatchedAt" TIMESTAMP(3),
    "arrivedAt" TIMESTAMP(3),
    "startedAt" TIMESTAMP(3),
    "completedAt" TIMESTAMP(3),
    "assignedTruckId" TEXT,
    "assignedDriverId" TEXT,
    "dispatcherNotes" TEXT,
    "technicianComments" TEXT,
    "customerSignatureName" TEXT,
    "cancellationReason" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "FieldWorkOrder_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "FieldWorkOrder_estimated_gallons_check" CHECK ("estimatedGallons" >= 0),
    CONSTRAINT "FieldWorkOrder_actual_gallons_check" CHECK ("actualGallons" IS NULL OR "actualGallons" >= 0)
);

CREATE TABLE "WorkOrderPhoto" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "fieldWorkOrderId" TEXT NOT NULL,
    "type" "EvidenceType" NOT NULL,
    "fileName" TEXT NOT NULL,
    "mimeType" TEXT NOT NULL,
    "storageKey" TEXT NOT NULL,
    "sha256" TEXT NOT NULL,
    "capturedAt" TIMESTAMP(3) NOT NULL,
    "capturedByUserId" TEXT NOT NULL,
    "comment" TEXT,
    "latitude" DECIMAL(9,6),
    "longitude" DECIMAL(9,6),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "WorkOrderPhoto_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "TruckLoadEvent" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "truckId" TEXT NOT NULL,
    "fieldWorkOrderId" TEXT,
    "evidencePhotoId" TEXT,
    "type" "TruckLoadEventType" NOT NULL,
    "deltaGallons" INTEGER NOT NULL,
    "resultingOnboardGallons" INTEGER NOT NULL,
    "disposalFacility" TEXT,
    "disposalTicketNumber" TEXT,
    "actorUserId" TEXT NOT NULL,
    "comments" TEXT,
    "occurredAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "TruckLoadEvent_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "TruckLoadEvent_result_check" CHECK ("resultingOnboardGallons" >= 0)
);

CREATE TABLE "RoutePlan" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "serviceDate" DATE NOT NULL,
    "status" "RouteStatus" NOT NULL DEFAULT 'DRAFT',
    "truckId" TEXT NOT NULL,
    "driverId" TEXT NOT NULL,
    "plannedStart" TIMESTAMP(3),
    "publishedAt" TIMESTAMP(3),
    "completedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "RoutePlan_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "RouteStop" (
    "id" TEXT NOT NULL,
    "routePlanId" TEXT NOT NULL,
    "fieldWorkOrderId" TEXT NOT NULL,
    "sequence" INTEGER NOT NULL,
    "plannedArrival" TIMESTAMP(3),
    "plannedDeparture" TIMESTAMP(3),
    "estimatedTravelMinutes" INTEGER,
    "notes" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "RouteStop_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "RouteStop_sequence_check" CHECK ("sequence" > 0),
    CONSTRAINT "RouteStop_travel_check" CHECK ("estimatedTravelMinutes" IS NULL OR "estimatedTravelMinutes" >= 0)
);

CREATE UNIQUE INDEX "Customer_tenantId_accountNumber_key" ON "Customer"("tenantId", "accountNumber");
CREATE INDEX "Customer_tenantId_name_idx" ON "Customer"("tenantId", "name");
CREATE INDEX "Customer_tenantId_primaryPhone_idx" ON "Customer"("tenantId", "primaryPhone");
CREATE INDEX "ServiceLocation_tenantId_postalCode_idx" ON "ServiceLocation"("tenantId", "postalCode");
CREATE INDEX "ServiceLocation_customerId_idx" ON "ServiceLocation"("customerId");
CREATE UNIQUE INDEX "Truck_tenantId_unitNumber_key" ON "Truck"("tenantId", "unitNumber");
CREATE INDEX "Truck_tenantId_status_idx" ON "Truck"("tenantId", "status");
CREATE UNIQUE INDEX "CallIntake_workOrderId_key" ON "CallIntake"("workOrderId");
CREATE UNIQUE INDEX "CallIntake_tenantId_externalCallId_key" ON "CallIntake"("tenantId", "externalCallId");
CREATE INDEX "CallIntake_tenantId_status_receivedAt_idx" ON "CallIntake"("tenantId", "status", "receivedAt");
CREATE INDEX "CallIntake_tenantId_callerPhone_idx" ON "CallIntake"("tenantId", "callerPhone");
CREATE UNIQUE INDEX "FieldWorkOrder_tenantId_workOrderNumber_key" ON "FieldWorkOrder"("tenantId", "workOrderNumber");
CREATE INDEX "FieldWorkOrder_tenantId_status_scheduledStart_idx" ON "FieldWorkOrder"("tenantId", "status", "scheduledStart");
CREATE INDEX "FieldWorkOrder_assignedTruckId_status_idx" ON "FieldWorkOrder"("assignedTruckId", "status");
CREATE INDEX "FieldWorkOrder_assignedDriverId_status_idx" ON "FieldWorkOrder"("assignedDriverId", "status");
CREATE INDEX "WorkOrderPhoto_fieldWorkOrderId_type_idx" ON "WorkOrderPhoto"("fieldWorkOrderId", "type");
CREATE UNIQUE INDEX "WorkOrderPhoto_tenantId_storageKey_key" ON "WorkOrderPhoto"("tenantId", "storageKey");
CREATE INDEX "TruckLoadEvent_truckId_occurredAt_idx" ON "TruckLoadEvent"("truckId", "occurredAt");
CREATE INDEX "TruckLoadEvent_fieldWorkOrderId_idx" ON "TruckLoadEvent"("fieldWorkOrderId");
CREATE UNIQUE INDEX "RoutePlan_tenantId_truckId_serviceDate_key" ON "RoutePlan"("tenantId", "truckId", "serviceDate");
CREATE INDEX "RoutePlan_tenantId_serviceDate_status_idx" ON "RoutePlan"("tenantId", "serviceDate", "status");
CREATE UNIQUE INDEX "RouteStop_fieldWorkOrderId_key" ON "RouteStop"("fieldWorkOrderId");
CREATE UNIQUE INDEX "RouteStop_routePlanId_sequence_key" ON "RouteStop"("routePlanId", "sequence");

ALTER TABLE "Customer" ADD CONSTRAINT "Customer_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "ServiceLocation" ADD CONSTRAINT "ServiceLocation_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "ServiceLocation" ADD CONSTRAINT "ServiceLocation_customerId_fkey" FOREIGN KEY ("customerId") REFERENCES "Customer"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "Truck" ADD CONSTRAINT "Truck_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "Truck" ADD CONSTRAINT "Truck_assignedDriverId_fkey" FOREIGN KEY ("assignedDriverId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "CallIntake" ADD CONSTRAINT "CallIntake_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "CallIntake" ADD CONSTRAINT "CallIntake_customerId_fkey" FOREIGN KEY ("customerId") REFERENCES "Customer"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "CallIntake" ADD CONSTRAINT "CallIntake_serviceLocationId_fkey" FOREIGN KEY ("serviceLocationId") REFERENCES "ServiceLocation"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "CallIntake" ADD CONSTRAINT "CallIntake_workOrderId_fkey" FOREIGN KEY ("workOrderId") REFERENCES "FieldWorkOrder"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "FieldWorkOrder" ADD CONSTRAINT "FieldWorkOrder_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "FieldWorkOrder" ADD CONSTRAINT "FieldWorkOrder_customerId_fkey" FOREIGN KEY ("customerId") REFERENCES "Customer"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "FieldWorkOrder" ADD CONSTRAINT "FieldWorkOrder_serviceLocationId_fkey" FOREIGN KEY ("serviceLocationId") REFERENCES "ServiceLocation"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "FieldWorkOrder" ADD CONSTRAINT "FieldWorkOrder_assignedTruckId_fkey" FOREIGN KEY ("assignedTruckId") REFERENCES "Truck"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "FieldWorkOrder" ADD CONSTRAINT "FieldWorkOrder_assignedDriverId_fkey" FOREIGN KEY ("assignedDriverId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "WorkOrderPhoto" ADD CONSTRAINT "WorkOrderPhoto_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "WorkOrderPhoto" ADD CONSTRAINT "WorkOrderPhoto_fieldWorkOrderId_fkey" FOREIGN KEY ("fieldWorkOrderId") REFERENCES "FieldWorkOrder"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "TruckLoadEvent" ADD CONSTRAINT "TruckLoadEvent_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "TruckLoadEvent" ADD CONSTRAINT "TruckLoadEvent_truckId_fkey" FOREIGN KEY ("truckId") REFERENCES "Truck"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "TruckLoadEvent" ADD CONSTRAINT "TruckLoadEvent_fieldWorkOrderId_fkey" FOREIGN KEY ("fieldWorkOrderId") REFERENCES "FieldWorkOrder"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "TruckLoadEvent" ADD CONSTRAINT "TruckLoadEvent_evidencePhotoId_fkey" FOREIGN KEY ("evidencePhotoId") REFERENCES "WorkOrderPhoto"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "RoutePlan" ADD CONSTRAINT "RoutePlan_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "RoutePlan" ADD CONSTRAINT "RoutePlan_truckId_fkey" FOREIGN KEY ("truckId") REFERENCES "Truck"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "RoutePlan" ADD CONSTRAINT "RoutePlan_driverId_fkey" FOREIGN KEY ("driverId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "RouteStop" ADD CONSTRAINT "RouteStop_routePlanId_fkey" FOREIGN KEY ("routePlanId") REFERENCES "RoutePlan"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "RouteStop" ADD CONSTRAINT "RouteStop_fieldWorkOrderId_fkey" FOREIGN KEY ("fieldWorkOrderId") REFERENCES "FieldWorkOrder"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
