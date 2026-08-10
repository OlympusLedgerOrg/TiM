import { prisma } from '../prisma/client.js';
import { enqueueOlympusCommit } from './olympusOutbox.js';

export async function submitLabReport(opts: {
  tenantId: string;
  batchId: string;
  fileHash: string;
  fileUrl: string;
  fileName: string;
  result: 'PENDING' | 'PASS' | 'FAIL';
  submittedBy: string;
}) {
  const batch = await prisma.batch.findFirst({
    where: { id: opts.batchId, tenantId: opts.tenantId },
  });
  if (!batch) return { status: 404, body: { message: 'Batch not found' } };

  // Report + anchor land atomically; see movementService for the rationale.
  const report = await prisma.$transaction(async (tx) => {
    const created = await tx.labReport.create({
      data: {
        tenantId: opts.tenantId,
        batchId: opts.batchId,
        fileHash: opts.fileHash,
        fileUrl: opts.fileUrl,
        fileName: opts.fileName,
        result: opts.result,
        submittedBy: opts.submittedBy,
      },
    });

    await enqueueOlympusCommit(tx, {
      type: 'LAB_REPORT',
      tenantId: opts.tenantId,
      recordId: created.id,
      data: {
        batchId: opts.batchId,
        lotNumber: batch.lotNumber,
        fileHash: opts.fileHash,
        fileName: opts.fileName,
        result: opts.result,
        submittedBy: opts.submittedBy,
        submittedAt: created.submittedAt.toISOString(),
      },
    });

    return created;
  });

  if (opts.result === 'FAIL') {
    await prisma.batch.update({
      where: { id: opts.batchId },
      data: { status: 'FLAGGED' },
    });
  }

  return { status: 201, body: { report } };
}

export async function signoffLabReport(opts: {
  tenantId: string;
  labReportId: string;
  managerId: string;
  notes?: string;
}) {
  const report = await prisma.labReport.findFirst({
    where: { id: opts.labReportId, tenantId: opts.tenantId },
    include: { signoff: true, batch: true },
  });
  if (!report) return { status: 404, body: { message: 'Lab report not found' } };
  if (report.signoff) return { status: 409, body: { message: 'Already signed off' } };

  const signoff = await prisma.$transaction(async (tx) => {
    const created = await tx.signoff.create({
      data: {
        tenantId: opts.tenantId,
        labReportId: opts.labReportId,
        managerId: opts.managerId,
        notes: opts.notes,
      },
    });

    await enqueueOlympusCommit(tx, {
      type: 'SIGNOFF',
      tenantId: opts.tenantId,
      recordId: created.id,
      data: {
        labReportId: opts.labReportId,
        batchId: report.batchId,
        lotNumber: report.batch.lotNumber,
        fileHash: report.fileHash,
        result: report.result,
        managerId: opts.managerId,
        signedAt: created.signedAt.toISOString(),
      },
    });

    return created;
  });

  return { status: 201, body: { signoff } };
}
