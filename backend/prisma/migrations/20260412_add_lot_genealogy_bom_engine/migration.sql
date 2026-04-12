-- CreateEnum
CREATE TYPE "LotStatus" AS ENUM ('ACTIVE', 'RESERVED', 'CONSUMED', 'SCRAPPED', 'QUARANTINED');

-- CreateEnum
CREATE TYPE "WorkOrderStatus" AS ENUM ('PLANNED', 'RELEASED', 'IN_PROGRESS', 'BLOCKED', 'COMPLETED', 'CANCELLED');

-- CreateEnum
CREATE TYPE "ReservationStatus" AS ENUM ('ACTIVE', 'RELEASED', 'CONSUMED', 'CANCELLED');

-- CreateEnum
CREATE TYPE "MovementType" AS ENUM ('RECEIVE', 'CONSUME', 'PRODUCE', 'TRANSFER', 'ADJUSTMENT', 'SCRAP');

-- AlterTable: Material — add lot genealogy & BOM fields
ALTER TABLE "Material" ADD COLUMN "name" TEXT;
ALTER TABLE "Material" ADD COLUMN "isBatchTracked" BOOLEAN NOT NULL DEFAULT true;
ALTER TABLE "Material" ADD COLUMN "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP;

-- AlterTable: WorkOrder — add production execution fields
ALTER TABLE "WorkOrder" ADD COLUMN "materialId" TEXT;
ALTER TABLE "WorkOrder" ADD COLUMN "bomId" TEXT;
ALTER TABLE "WorkOrder" ADD COLUMN "quantity" DOUBLE PRECISION;
ALTER TABLE "WorkOrder" ADD COLUMN "uom" TEXT;
ALTER TABLE "WorkOrder" ADD COLUMN "status" "WorkOrderStatus" NOT NULL DEFAULT 'PLANNED';
ALTER TABLE "WorkOrder" ADD COLUMN "scheduledStart" TIMESTAMP(3);
ALTER TABLE "WorkOrder" ADD COLUMN "scheduledEnd" TIMESTAMP(3);
ALTER TABLE "WorkOrder" ADD COLUMN "startedAt" TIMESTAMP(3);
ALTER TABLE "WorkOrder" ADD COLUMN "completedAt" TIMESTAMP(3);
ALTER TABLE "WorkOrder" ADD COLUMN "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP;

-- CreateTable: Operator
CREATE TABLE "Operator" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "badgeId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Operator_pkey" PRIMARY KEY ("id")
);

-- CreateTable: BOM
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

-- CreateTable: BOMItem
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

-- CreateTable: BOMStep
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

-- CreateTable: Lot
CREATE TABLE "Lot" (
    "id" TEXT NOT NULL,
    "materialId" TEXT NOT NULL,
    "quantity" DOUBLE PRECISION NOT NULL,
    "uom" TEXT NOT NULL,
    "status" "LotStatus" NOT NULL DEFAULT 'ACTIVE',
    "workOrderId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Lot_pkey" PRIMARY KEY ("id")
);

-- CreateTable: LotEdge
CREATE TABLE "LotEdge" (
    "id" TEXT NOT NULL,
    "parentLotId" TEXT NOT NULL,
    "childLotId" TEXT NOT NULL,
    "quantity" DOUBLE PRECISION NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "LotEdge_pkey" PRIMARY KEY ("id")
);

-- CreateTable: WorkOrderStep
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

-- CreateTable: Reservation
CREATE TABLE "Reservation" (
    "id" TEXT NOT NULL,
    "lotId" TEXT NOT NULL,
    "workOrderId" TEXT NOT NULL,
    "quantity" DOUBLE PRECISION NOT NULL,
    "status" "ReservationStatus" NOT NULL DEFAULT 'ACTIVE',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Reservation_pkey" PRIMARY KEY ("id")
);

-- CreateTable: InventoryMovement
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

-- CreateIndex
CREATE UNIQUE INDEX "Operator_badgeId_key" ON "Operator"("badgeId");

-- CreateIndex
CREATE UNIQUE INDEX "BOM_materialId_version_key" ON "BOM"("materialId", "version");

-- CreateIndex
CREATE UNIQUE INDEX "LotEdge_parentLotId_childLotId_key" ON "LotEdge"("parentLotId", "childLotId");

-- AddForeignKey: WorkOrder → Material
ALTER TABLE "WorkOrder" ADD CONSTRAINT "WorkOrder_materialId_fkey" FOREIGN KEY ("materialId") REFERENCES "Material"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey: WorkOrder → BOM
ALTER TABLE "WorkOrder" ADD CONSTRAINT "WorkOrder_bomId_fkey" FOREIGN KEY ("bomId") REFERENCES "BOM"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey: BOM → Material (output)
ALTER TABLE "BOM" ADD CONSTRAINT "BOM_materialId_fkey" FOREIGN KEY ("materialId") REFERENCES "Material"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey: BOMItem → BOM
ALTER TABLE "BOMItem" ADD CONSTRAINT "BOMItem_bomId_fkey" FOREIGN KEY ("bomId") REFERENCES "BOM"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey: BOMItem → Material (input)
ALTER TABLE "BOMItem" ADD CONSTRAINT "BOMItem_materialId_fkey" FOREIGN KEY ("materialId") REFERENCES "Material"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey: BOMStep → BOM
ALTER TABLE "BOMStep" ADD CONSTRAINT "BOMStep_bomId_fkey" FOREIGN KEY ("bomId") REFERENCES "BOM"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey: Lot → Material
ALTER TABLE "Lot" ADD CONSTRAINT "Lot_materialId_fkey" FOREIGN KEY ("materialId") REFERENCES "Material"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey: Lot → WorkOrder
ALTER TABLE "Lot" ADD CONSTRAINT "Lot_workOrderId_fkey" FOREIGN KEY ("workOrderId") REFERENCES "WorkOrder"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey: LotEdge → Lot (parent)
ALTER TABLE "LotEdge" ADD CONSTRAINT "LotEdge_parentLotId_fkey" FOREIGN KEY ("parentLotId") REFERENCES "Lot"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey: LotEdge → Lot (child)
ALTER TABLE "LotEdge" ADD CONSTRAINT "LotEdge_childLotId_fkey" FOREIGN KEY ("childLotId") REFERENCES "Lot"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey: WorkOrderStep → WorkOrder
ALTER TABLE "WorkOrderStep" ADD CONSTRAINT "WorkOrderStep_workOrderId_fkey" FOREIGN KEY ("workOrderId") REFERENCES "WorkOrder"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey: WorkOrderStep → BOMStep
ALTER TABLE "WorkOrderStep" ADD CONSTRAINT "WorkOrderStep_bomStepId_fkey" FOREIGN KEY ("bomStepId") REFERENCES "BOMStep"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey: WorkOrderStep → Operator
ALTER TABLE "WorkOrderStep" ADD CONSTRAINT "WorkOrderStep_operatorId_fkey" FOREIGN KEY ("operatorId") REFERENCES "Operator"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey: Reservation → Lot
ALTER TABLE "Reservation" ADD CONSTRAINT "Reservation_lotId_fkey" FOREIGN KEY ("lotId") REFERENCES "Lot"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey: Reservation → WorkOrder
ALTER TABLE "Reservation" ADD CONSTRAINT "Reservation_workOrderId_fkey" FOREIGN KEY ("workOrderId") REFERENCES "WorkOrder"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey: InventoryMovement → Lot
ALTER TABLE "InventoryMovement" ADD CONSTRAINT "InventoryMovement_lotId_fkey" FOREIGN KEY ("lotId") REFERENCES "Lot"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey: InventoryMovement → WorkOrder
ALTER TABLE "InventoryMovement" ADD CONSTRAINT "InventoryMovement_workOrderId_fkey" FOREIGN KEY ("workOrderId") REFERENCES "WorkOrder"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey: InventoryMovement → Operator
ALTER TABLE "InventoryMovement" ADD CONSTRAINT "InventoryMovement_operatorId_fkey" FOREIGN KEY ("operatorId") REFERENCES "Operator"("id") ON DELETE SET NULL ON UPDATE CASCADE;
