-- CreateSchema
CREATE SCHEMA IF NOT EXISTS "public";

-- CreateEnum
CREATE TYPE "StepStatus" AS ENUM ('PENDING', 'COMPLETED');

-- CreateEnum
CREATE TYPE "BatchStatus" AS ENUM ('IN_QUEUE', 'IN_PROGRESS', 'COMPLETE', 'FLAGGED');

-- CreateEnum
CREATE TYPE "LabResult" AS ENUM ('PENDING', 'PASS', 'FAIL');

-- CreateEnum
CREATE TYPE "LotStatus" AS ENUM ('ACTIVE', 'RESERVED', 'CONSUMED', 'SCRAPPED', 'QUARANTINED');

-- CreateEnum
CREATE TYPE "WorkOrderStatus" AS ENUM ('PLANNED', 'RELEASED', 'IN_PROGRESS', 'BLOCKED', 'COMPLETED', 'CANCELLED');

-- CreateEnum
CREATE TYPE "ReservationStatus" AS ENUM ('ACTIVE', 'RELEASED', 'CONSUMED', 'CANCELLED');

-- CreateEnum
CREATE TYPE "MovementType" AS ENUM ('RECEIVE', 'CONSUME', 'PRODUCE', 'TRANSFER', 'ADJUSTMENT', 'SCRAP');

-- CreateEnum
CREATE TYPE "EquipmentStatus" AS ENUM ('RUNNING', 'IDLE', 'DOWN', 'MAINTENANCE', 'SETUP', 'CHANGEOVER');

-- CreateEnum
CREATE TYPE "DowntimeCategory" AS ENUM ('PLANNED', 'UNPLANNED', 'CHANGEOVER', 'MATERIAL_WAIT', 'QUALITY_HOLD', 'MAINTENANCE');

-- CreateEnum
CREATE TYPE "ShiftPattern" AS ENUM ('FIRST', 'SECOND', 'THIRD');

-- CreateEnum
CREATE TYPE "AlertSeverity" AS ENUM ('INFO', 'WARNING', 'CRITICAL');

-- CreateEnum
CREATE TYPE "CallIntakeStatus" AS ENUM ('RECEIVED', 'TRIAGED', 'CONVERTED', 'DUPLICATE', 'REJECTED');

-- CreateEnum
CREATE TYPE "FieldWorkOrderStatus" AS ENUM ('NEW', 'TRIAGED', 'SCHEDULED', 'DISPATCHED', 'EN_ROUTE', 'ON_SITE', 'IN_PROGRESS', 'NEEDS_DISPOSAL', 'COMPLETED', 'CANCELLED');

-- CreateEnum
CREATE TYPE "ServicePriority" AS ENUM ('ROUTINE', 'PRIORITY', 'URGENT', 'EMERGENCY');

-- CreateEnum
CREATE TYPE "ServiceType" AS ENUM ('SEPTIC_PUMPING', 'GREASE_TRAP', 'HOLDING_TANK', 'PORTABLE_RESTROOM', 'DRAIN_CLEANING', 'JETTING', 'INSPECTION', 'REPAIR', 'EMERGENCY_RESPONSE', 'OTHER');

-- CreateEnum
CREATE TYPE "TruckStatus" AS ENUM ('AVAILABLE', 'ASSIGNED', 'EN_ROUTE', 'ON_SITE', 'NEEDS_DISPOSAL', 'AT_DISPOSAL', 'OUT_OF_SERVICE');

-- CreateEnum
CREATE TYPE "TruckLoadEventType" AS ENUM ('PUMP_IN', 'DISPOSAL', 'ADJUSTMENT');

-- CreateEnum
CREATE TYPE "EvidenceType" AS ENUM ('BEFORE_SERVICE', 'ACCESS_POINT', 'CONDITION', 'AFTER_SERVICE', 'DISPOSAL_TICKET', 'CUSTOMER_SIGNATURE', 'OTHER');

-- CreateEnum
CREATE TYPE "RouteStatus" AS ENUM ('DRAFT', 'PUBLISHED', 'IN_PROGRESS', 'COMPLETED', 'CANCELLED');

-- CreateTable
CREATE TABLE "User" (
    "id" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "role" TEXT NOT NULL,
    "passwordHash" TEXT,
    "tenantId" TEXT NOT NULL,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "User_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "WorkOrder" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL DEFAULT 'default',
    "title" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "materialId" TEXT,
    "bomId" TEXT,
    "quantity" DOUBLE PRECISION,
    "uom" TEXT,
    "status" "WorkOrderStatus" NOT NULL DEFAULT 'PLANNED',
    "scheduledStart" TIMESTAMP(3),
    "scheduledEnd" TIMESTAMP(3),
    "startedAt" TIMESTAMP(3),
    "completedAt" TIMESTAMP(3),
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "WorkOrder_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Step" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL DEFAULT 'default',
    "workOrderId" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "status" "StepStatus" NOT NULL DEFAULT 'PENDING',
    "notes" TEXT,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Step_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AuditLog" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL DEFAULT 'default',
    "workOrderId" TEXT NOT NULL,
    "stepId" TEXT NOT NULL,
    "actorUserId" TEXT NOT NULL,
    "action" TEXT NOT NULL,
    "metadata" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "AuditLog_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Tenant" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "sapPlantCode" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Tenant_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PlantArea" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "code" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "PlantArea_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "WorkCenter" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "code" TEXT NOT NULL,
    "description" TEXT,
    "plantAreaId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "WorkCenter_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Material" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "sapMaterialNumber" TEXT,
    "description" TEXT NOT NULL,
    "unitOfMeasure" TEXT NOT NULL DEFAULT 'EA',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "name" TEXT,
    "isBatchTracked" BOOLEAN NOT NULL DEFAULT true,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Material_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Batch" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "materialId" TEXT NOT NULL,
    "lotNumber" TEXT NOT NULL,
    "quantity" DECIMAL(65,30) NOT NULL,
    "status" "BatchStatus" NOT NULL DEFAULT 'IN_QUEUE',
    "workCenterId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Batch_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Movement" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "batchId" TEXT NOT NULL,
    "fromWorkCenterId" TEXT NOT NULL,
    "toWorkCenterId" TEXT NOT NULL,
    "quantity" DECIMAL(65,30) NOT NULL,
    "movedByUserId" TEXT NOT NULL,
    "movedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "notes" TEXT,
    "olympusCommitId" TEXT,

    CONSTRAINT "Movement_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "LabReport" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "batchId" TEXT NOT NULL,
    "fileHash" TEXT NOT NULL,
    "fileUrl" TEXT NOT NULL,
    "fileName" TEXT NOT NULL,
    "result" "LabResult" NOT NULL DEFAULT 'PENDING',
    "submittedBy" TEXT NOT NULL,
    "submittedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "olympusCommitId" TEXT,

    CONSTRAINT "LabReport_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Signoff" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "labReportId" TEXT NOT NULL,
    "managerId" TEXT NOT NULL,
    "signedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "notes" TEXT,
    "olympusCommitId" TEXT,

    CONSTRAINT "Signoff_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Lot" (
    "id" TEXT NOT NULL,
    "materialId" TEXT NOT NULL,
    "quantity" DOUBLE PRECISION NOT NULL,
    "uom" TEXT NOT NULL,
    "status" "LotStatus" NOT NULL DEFAULT 'ACTIVE',
    "expiryDate" TIMESTAMP(3),
    "workOrderId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Lot_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "LotEdge" (
    "id" TEXT NOT NULL,
    "parentLotId" TEXT NOT NULL,
    "childLotId" TEXT NOT NULL,
    "quantity" DOUBLE PRECISION NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "LotEdge_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "BOM" (
    "id" TEXT NOT NULL,
    "materialId" TEXT NOT NULL,
    "version" INTEGER NOT NULL,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "validFrom" TIMESTAMP(3) NOT NULL,
    "validTo" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "BOM_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "BOMItem" (
    "id" TEXT NOT NULL,
    "bomId" TEXT NOT NULL,
    "materialId" TEXT NOT NULL,
    "quantity" DOUBLE PRECISION NOT NULL,
    "uom" TEXT NOT NULL,
    "isOptional" BOOLEAN NOT NULL DEFAULT false,
    "condition" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "BOMItem_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "BOMStep" (
    "id" TEXT NOT NULL,
    "bomId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "sequence" INTEGER NOT NULL,
    "machineType" TEXT,
    "durationSec" INTEGER,
    "constraints" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "BOMStep_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "WorkOrderStep" (
    "id" TEXT NOT NULL,
    "workOrderId" TEXT NOT NULL,
    "bomStepId" TEXT NOT NULL,
    "status" TEXT NOT NULL,
    "startedAt" TIMESTAMP(3),
    "completedAt" TIMESTAMP(3),
    "operatorId" TEXT,
    "data" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "WorkOrderStep_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Reservation" (
    "id" TEXT NOT NULL,
    "lotId" TEXT NOT NULL,
    "workOrderId" TEXT NOT NULL,
    "quantity" DOUBLE PRECISION NOT NULL,
    "status" "ReservationStatus" NOT NULL DEFAULT 'ACTIVE',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Reservation_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "InventoryMovement" (
    "id" TEXT NOT NULL,
    "lotId" TEXT NOT NULL,
    "type" "MovementType" NOT NULL,
    "quantity" DOUBLE PRECISION NOT NULL,
    "workOrderId" TEXT,
    "operatorId" TEXT,
    "metadata" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "InventoryMovement_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Operator" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "badgeId" TEXT,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Operator_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Equipment" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "code" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "type" TEXT NOT NULL,
    "description" TEXT,
    "workCenterId" TEXT,
    "plantAreaId" TEXT,
    "axxosEquipmentId" TEXT,
    "status" "EquipmentStatus" NOT NULL DEFAULT 'IDLE',
    "statusSince" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "currentOperatorId" TEXT,
    "targetCycleTimeSec" INTEGER,
    "targetOee" DOUBLE PRECISION,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Equipment_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "DowntimeEvent" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "equipmentId" TEXT NOT NULL,
    "category" "DowntimeCategory" NOT NULL,
    "reasonCode" TEXT NOT NULL,
    "reasonText" TEXT,
    "startedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "endedAt" TIMESTAMP(3),
    "durationMin" DOUBLE PRECISION,
    "reportedById" TEXT,
    "workOrderId" TEXT,
    "plantAreaCode" TEXT,
    "escalatedToTeams" BOOLEAN NOT NULL DEFAULT false,
    "escalatedAt" TIMESTAMP(3),
    "metadata" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "DowntimeEvent_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ScrapReason" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "code" TEXT NOT NULL,
    "description" TEXT NOT NULL,
    "category" TEXT NOT NULL,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ScrapReason_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ShiftAssignment" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "operatorId" TEXT NOT NULL,
    "shift" "ShiftPattern" NOT NULL,
    "date" DATE NOT NULL,
    "workCenterCode" TEXT,
    "plantAreaCode" TEXT,
    "clockInAt" TIMESTAMP(3),
    "clockOutAt" TIMESTAMP(3),
    "notes" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ShiftAssignment_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "TeamsWebhook" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "webhookUrl" TEXT NOT NULL,
    "channel" TEXT NOT NULL,
    "plantAreaCode" TEXT,
    "onDowntime" BOOLEAN NOT NULL DEFAULT true,
    "onQualityFail" BOOLEAN NOT NULL DEFAULT true,
    "onShortage" BOOLEAN NOT NULL DEFAULT true,
    "onEscalation" BOOLEAN NOT NULL DEFAULT true,
    "downtimeThresholdMin" INTEGER NOT NULL DEFAULT 15,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "TeamsWebhook_pkey" PRIMARY KEY ("id")
);

-- CreateTable
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

-- CreateTable
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

-- CreateTable
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

    CONSTRAINT "Truck_pkey" PRIMARY KEY ("id")
);

-- CreateTable
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

    CONSTRAINT "CallIntake_pkey" PRIMARY KEY ("id")
);

-- CreateTable
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

    CONSTRAINT "FieldWorkOrder_pkey" PRIMARY KEY ("id")
);

-- CreateTable
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

-- CreateTable
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

    CONSTRAINT "TruckLoadEvent_pkey" PRIMARY KEY ("id")
);

-- CreateTable
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

-- CreateTable
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

    CONSTRAINT "RouteStop_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "User_email_key" ON "User"("email");

-- CreateIndex
CREATE UNIQUE INDEX "PlantArea_tenantId_code_key" ON "PlantArea"("tenantId", "code");

-- CreateIndex
CREATE UNIQUE INDEX "WorkCenter_tenantId_code_key" ON "WorkCenter"("tenantId", "code");

-- CreateIndex
CREATE UNIQUE INDEX "Material_tenantId_sapMaterialNumber_key" ON "Material"("tenantId", "sapMaterialNumber");

-- CreateIndex
CREATE UNIQUE INDEX "Batch_tenantId_lotNumber_key" ON "Batch"("tenantId", "lotNumber");

-- CreateIndex
CREATE UNIQUE INDEX "Signoff_labReportId_key" ON "Signoff"("labReportId");

-- CreateIndex
CREATE UNIQUE INDEX "LotEdge_parentLotId_childLotId_key" ON "LotEdge"("parentLotId", "childLotId");

-- CreateIndex
CREATE UNIQUE INDEX "BOM_materialId_version_key" ON "BOM"("materialId", "version");

-- CreateIndex
CREATE UNIQUE INDEX "Operator_badgeId_key" ON "Operator"("badgeId");

-- CreateIndex
CREATE UNIQUE INDEX "Equipment_tenantId_code_key" ON "Equipment"("tenantId", "code");

-- CreateIndex
CREATE UNIQUE INDEX "ScrapReason_tenantId_code_key" ON "ScrapReason"("tenantId", "code");

-- CreateIndex
CREATE UNIQUE INDEX "ShiftAssignment_tenantId_operatorId_date_shift_key" ON "ShiftAssignment"("tenantId", "operatorId", "date", "shift");

-- CreateIndex
CREATE UNIQUE INDEX "TeamsWebhook_tenantId_name_key" ON "TeamsWebhook"("tenantId", "name");

-- CreateIndex
CREATE INDEX "Customer_tenantId_name_idx" ON "Customer"("tenantId", "name");

-- CreateIndex
CREATE INDEX "Customer_tenantId_primaryPhone_idx" ON "Customer"("tenantId", "primaryPhone");

-- CreateIndex
CREATE UNIQUE INDEX "Customer_tenantId_accountNumber_key" ON "Customer"("tenantId", "accountNumber");

-- CreateIndex
CREATE INDEX "ServiceLocation_tenantId_postalCode_idx" ON "ServiceLocation"("tenantId", "postalCode");

-- CreateIndex
CREATE INDEX "ServiceLocation_customerId_idx" ON "ServiceLocation"("customerId");

-- CreateIndex
CREATE INDEX "Truck_tenantId_status_idx" ON "Truck"("tenantId", "status");

-- CreateIndex
CREATE UNIQUE INDEX "Truck_tenantId_unitNumber_key" ON "Truck"("tenantId", "unitNumber");

-- CreateIndex
CREATE UNIQUE INDEX "CallIntake_workOrderId_key" ON "CallIntake"("workOrderId");

-- CreateIndex
CREATE INDEX "CallIntake_tenantId_status_receivedAt_idx" ON "CallIntake"("tenantId", "status", "receivedAt");

-- CreateIndex
CREATE INDEX "CallIntake_tenantId_callerPhone_idx" ON "CallIntake"("tenantId", "callerPhone");

-- CreateIndex
CREATE UNIQUE INDEX "CallIntake_tenantId_externalCallId_key" ON "CallIntake"("tenantId", "externalCallId");

-- CreateIndex
CREATE INDEX "FieldWorkOrder_tenantId_status_scheduledStart_idx" ON "FieldWorkOrder"("tenantId", "status", "scheduledStart");

-- CreateIndex
CREATE INDEX "FieldWorkOrder_assignedTruckId_status_idx" ON "FieldWorkOrder"("assignedTruckId", "status");

-- CreateIndex
CREATE INDEX "FieldWorkOrder_assignedDriverId_status_idx" ON "FieldWorkOrder"("assignedDriverId", "status");

-- CreateIndex
CREATE UNIQUE INDEX "FieldWorkOrder_tenantId_workOrderNumber_key" ON "FieldWorkOrder"("tenantId", "workOrderNumber");

-- CreateIndex
CREATE INDEX "WorkOrderPhoto_fieldWorkOrderId_type_idx" ON "WorkOrderPhoto"("fieldWorkOrderId", "type");

-- CreateIndex
CREATE UNIQUE INDEX "WorkOrderPhoto_tenantId_storageKey_key" ON "WorkOrderPhoto"("tenantId", "storageKey");

-- CreateIndex
CREATE INDEX "TruckLoadEvent_truckId_occurredAt_idx" ON "TruckLoadEvent"("truckId", "occurredAt");

-- CreateIndex
CREATE INDEX "TruckLoadEvent_fieldWorkOrderId_idx" ON "TruckLoadEvent"("fieldWorkOrderId");

-- CreateIndex
CREATE INDEX "RoutePlan_tenantId_serviceDate_status_idx" ON "RoutePlan"("tenantId", "serviceDate", "status");

-- CreateIndex
CREATE UNIQUE INDEX "RoutePlan_tenantId_truckId_serviceDate_key" ON "RoutePlan"("tenantId", "truckId", "serviceDate");

-- CreateIndex
CREATE UNIQUE INDEX "RouteStop_fieldWorkOrderId_key" ON "RouteStop"("fieldWorkOrderId");

-- CreateIndex
CREATE UNIQUE INDEX "RouteStop_routePlanId_sequence_key" ON "RouteStop"("routePlanId", "sequence");

-- AddForeignKey
ALTER TABLE "User" ADD CONSTRAINT "User_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "WorkOrder" ADD CONSTRAINT "WorkOrder_materialId_fkey" FOREIGN KEY ("materialId") REFERENCES "Material"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "WorkOrder" ADD CONSTRAINT "WorkOrder_bomId_fkey" FOREIGN KEY ("bomId") REFERENCES "BOM"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Step" ADD CONSTRAINT "Step_workOrderId_fkey" FOREIGN KEY ("workOrderId") REFERENCES "WorkOrder"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AuditLog" ADD CONSTRAINT "AuditLog_workOrderId_fkey" FOREIGN KEY ("workOrderId") REFERENCES "WorkOrder"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AuditLog" ADD CONSTRAINT "AuditLog_actorUserId_fkey" FOREIGN KEY ("actorUserId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PlantArea" ADD CONSTRAINT "PlantArea_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "WorkCenter" ADD CONSTRAINT "WorkCenter_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "WorkCenter" ADD CONSTRAINT "WorkCenter_plantAreaId_fkey" FOREIGN KEY ("plantAreaId") REFERENCES "PlantArea"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Material" ADD CONSTRAINT "Material_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Batch" ADD CONSTRAINT "Batch_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Batch" ADD CONSTRAINT "Batch_materialId_fkey" FOREIGN KEY ("materialId") REFERENCES "Material"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Batch" ADD CONSTRAINT "Batch_workCenterId_fkey" FOREIGN KEY ("workCenterId") REFERENCES "WorkCenter"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Movement" ADD CONSTRAINT "Movement_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Movement" ADD CONSTRAINT "Movement_batchId_fkey" FOREIGN KEY ("batchId") REFERENCES "Batch"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Movement" ADD CONSTRAINT "Movement_fromWorkCenterId_fkey" FOREIGN KEY ("fromWorkCenterId") REFERENCES "WorkCenter"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Movement" ADD CONSTRAINT "Movement_toWorkCenterId_fkey" FOREIGN KEY ("toWorkCenterId") REFERENCES "WorkCenter"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Movement" ADD CONSTRAINT "Movement_movedByUserId_fkey" FOREIGN KEY ("movedByUserId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "LabReport" ADD CONSTRAINT "LabReport_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "LabReport" ADD CONSTRAINT "LabReport_batchId_fkey" FOREIGN KEY ("batchId") REFERENCES "Batch"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "LabReport" ADD CONSTRAINT "LabReport_submittedBy_fkey" FOREIGN KEY ("submittedBy") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Signoff" ADD CONSTRAINT "Signoff_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Signoff" ADD CONSTRAINT "Signoff_labReportId_fkey" FOREIGN KEY ("labReportId") REFERENCES "LabReport"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Signoff" ADD CONSTRAINT "Signoff_managerId_fkey" FOREIGN KEY ("managerId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Lot" ADD CONSTRAINT "Lot_materialId_fkey" FOREIGN KEY ("materialId") REFERENCES "Material"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Lot" ADD CONSTRAINT "Lot_workOrderId_fkey" FOREIGN KEY ("workOrderId") REFERENCES "WorkOrder"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "LotEdge" ADD CONSTRAINT "LotEdge_parentLotId_fkey" FOREIGN KEY ("parentLotId") REFERENCES "Lot"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "LotEdge" ADD CONSTRAINT "LotEdge_childLotId_fkey" FOREIGN KEY ("childLotId") REFERENCES "Lot"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "BOM" ADD CONSTRAINT "BOM_materialId_fkey" FOREIGN KEY ("materialId") REFERENCES "Material"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "BOMItem" ADD CONSTRAINT "BOMItem_bomId_fkey" FOREIGN KEY ("bomId") REFERENCES "BOM"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "BOMItem" ADD CONSTRAINT "BOMItem_materialId_fkey" FOREIGN KEY ("materialId") REFERENCES "Material"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "BOMStep" ADD CONSTRAINT "BOMStep_bomId_fkey" FOREIGN KEY ("bomId") REFERENCES "BOM"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "WorkOrderStep" ADD CONSTRAINT "WorkOrderStep_workOrderId_fkey" FOREIGN KEY ("workOrderId") REFERENCES "WorkOrder"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "WorkOrderStep" ADD CONSTRAINT "WorkOrderStep_bomStepId_fkey" FOREIGN KEY ("bomStepId") REFERENCES "BOMStep"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "WorkOrderStep" ADD CONSTRAINT "WorkOrderStep_operatorId_fkey" FOREIGN KEY ("operatorId") REFERENCES "Operator"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Reservation" ADD CONSTRAINT "Reservation_lotId_fkey" FOREIGN KEY ("lotId") REFERENCES "Lot"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Reservation" ADD CONSTRAINT "Reservation_workOrderId_fkey" FOREIGN KEY ("workOrderId") REFERENCES "WorkOrder"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "InventoryMovement" ADD CONSTRAINT "InventoryMovement_lotId_fkey" FOREIGN KEY ("lotId") REFERENCES "Lot"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "InventoryMovement" ADD CONSTRAINT "InventoryMovement_workOrderId_fkey" FOREIGN KEY ("workOrderId") REFERENCES "WorkOrder"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "InventoryMovement" ADD CONSTRAINT "InventoryMovement_operatorId_fkey" FOREIGN KEY ("operatorId") REFERENCES "Operator"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Equipment" ADD CONSTRAINT "Equipment_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Equipment" ADD CONSTRAINT "Equipment_workCenterId_fkey" FOREIGN KEY ("workCenterId") REFERENCES "WorkCenter"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Equipment" ADD CONSTRAINT "Equipment_plantAreaId_fkey" FOREIGN KEY ("plantAreaId") REFERENCES "PlantArea"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DowntimeEvent" ADD CONSTRAINT "DowntimeEvent_equipmentId_fkey" FOREIGN KEY ("equipmentId") REFERENCES "Equipment"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ShiftAssignment" ADD CONSTRAINT "ShiftAssignment_operatorId_fkey" FOREIGN KEY ("operatorId") REFERENCES "Operator"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Customer" ADD CONSTRAINT "Customer_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ServiceLocation" ADD CONSTRAINT "ServiceLocation_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ServiceLocation" ADD CONSTRAINT "ServiceLocation_customerId_fkey" FOREIGN KEY ("customerId") REFERENCES "Customer"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Truck" ADD CONSTRAINT "Truck_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Truck" ADD CONSTRAINT "Truck_assignedDriverId_fkey" FOREIGN KEY ("assignedDriverId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CallIntake" ADD CONSTRAINT "CallIntake_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CallIntake" ADD CONSTRAINT "CallIntake_customerId_fkey" FOREIGN KEY ("customerId") REFERENCES "Customer"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CallIntake" ADD CONSTRAINT "CallIntake_serviceLocationId_fkey" FOREIGN KEY ("serviceLocationId") REFERENCES "ServiceLocation"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CallIntake" ADD CONSTRAINT "CallIntake_workOrderId_fkey" FOREIGN KEY ("workOrderId") REFERENCES "FieldWorkOrder"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "FieldWorkOrder" ADD CONSTRAINT "FieldWorkOrder_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "FieldWorkOrder" ADD CONSTRAINT "FieldWorkOrder_customerId_fkey" FOREIGN KEY ("customerId") REFERENCES "Customer"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "FieldWorkOrder" ADD CONSTRAINT "FieldWorkOrder_serviceLocationId_fkey" FOREIGN KEY ("serviceLocationId") REFERENCES "ServiceLocation"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "FieldWorkOrder" ADD CONSTRAINT "FieldWorkOrder_assignedTruckId_fkey" FOREIGN KEY ("assignedTruckId") REFERENCES "Truck"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "FieldWorkOrder" ADD CONSTRAINT "FieldWorkOrder_assignedDriverId_fkey" FOREIGN KEY ("assignedDriverId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "WorkOrderPhoto" ADD CONSTRAINT "WorkOrderPhoto_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "WorkOrderPhoto" ADD CONSTRAINT "WorkOrderPhoto_fieldWorkOrderId_fkey" FOREIGN KEY ("fieldWorkOrderId") REFERENCES "FieldWorkOrder"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TruckLoadEvent" ADD CONSTRAINT "TruckLoadEvent_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TruckLoadEvent" ADD CONSTRAINT "TruckLoadEvent_truckId_fkey" FOREIGN KEY ("truckId") REFERENCES "Truck"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TruckLoadEvent" ADD CONSTRAINT "TruckLoadEvent_fieldWorkOrderId_fkey" FOREIGN KEY ("fieldWorkOrderId") REFERENCES "FieldWorkOrder"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TruckLoadEvent" ADD CONSTRAINT "TruckLoadEvent_evidencePhotoId_fkey" FOREIGN KEY ("evidencePhotoId") REFERENCES "WorkOrderPhoto"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "RoutePlan" ADD CONSTRAINT "RoutePlan_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "RoutePlan" ADD CONSTRAINT "RoutePlan_truckId_fkey" FOREIGN KEY ("truckId") REFERENCES "Truck"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "RoutePlan" ADD CONSTRAINT "RoutePlan_driverId_fkey" FOREIGN KEY ("driverId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "RouteStop" ADD CONSTRAINT "RouteStop_routePlanId_fkey" FOREIGN KEY ("routePlanId") REFERENCES "RoutePlan"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "RouteStop" ADD CONSTRAINT "RouteStop_fieldWorkOrderId_fkey" FOREIGN KEY ("fieldWorkOrderId") REFERENCES "FieldWorkOrder"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

