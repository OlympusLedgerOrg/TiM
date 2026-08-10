-- CreateEnum
CREATE TYPE "OlympusRecordType" AS ENUM ('MOVEMENT', 'LAB_REPORT', 'SIGNOFF');

-- CreateEnum
CREATE TYPE "OlympusCommitStatus" AS ENUM ('PENDING', 'COMMITTED', 'DEAD_LETTER');

-- CreateTable: transactional outbox for Olympus ledger anchors
CREATE TABLE "OlympusCommit" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "recordType" "OlympusRecordType" NOT NULL,
    "recordId" TEXT NOT NULL,
    "payload" JSONB NOT NULL,
    "status" "OlympusCommitStatus" NOT NULL DEFAULT 'PENDING',
    "attempts" INTEGER NOT NULL DEFAULT 0,
    "nextAttemptAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "lastError" TEXT,
    "proofId" TEXT,
    "contentHash" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "OlympusCommit_pkey" PRIMARY KEY ("id")
);

-- One anchor per domain record: makes enqueue idempotent under retry.
CREATE UNIQUE INDEX "OlympusCommit_recordType_recordId_key"
    ON "OlympusCommit"("recordType", "recordId");

-- Drives the drainer's claim query (status = PENDING AND nextAttemptAt <= now()).
CREATE INDEX "OlympusCommit_status_nextAttemptAt_idx"
    ON "OlympusCommit"("status", "nextAttemptAt");
