import { prisma } from '../prisma/client.js';
import { commitToOlympus } from './olympusBridge.js';

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

  const report = await prisma.labReport.create({
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

  if (opts.result === 'FAIL') {
    await prisma.batch.update({
      where: { id: opts.batchId },
      data: { status: 'FLAGGED' },
    });
  }

  // Anchor the file hash + metadata to Olympus
  commitToOlympus({
    type: 'LAB_REPORT',
    tenantId: opts.tenantId,
    recordId: report.id,
    data: {
      batchId: opts.batchId,
      lotNumber: batch.lotNumber,
      fileHash: opts.fileHash,
      fileName: opts.fileName,
      result: opts.result,
      submittedBy: opts.submittedBy,
      submittedAt: report.submittedAt.toISOString(),
    },
  }).then((commitId) => {
    if (commitId) {
      prisma.labReport.update({
        where: { id: report.id },
        data: { olympusCommitId: commitId },
      }).catch((err) => {
        console.error('[LabReport] Failed to update olympusCommitId:', err);
      });
    }
  }).catch((err) => {
    console.error('[LabReport] Failed to commit to Olympus:', err);
  });

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

  const signoff = await prisma.signoff.create({
    data: {
      tenantId: opts.tenantId,
      labReportId: opts.labReportId,
      managerId: opts.managerId,
      notes: opts.notes,
    },
  });

  commitToOlympus({
    type: 'SIGNOFF',
    tenantId: opts.tenantId,
    recordId: signoff.id,
    data: {
      labReportId: opts.labReportId,
      batchId: report.batchId,
      lotNumber: report.batch.lotNumber,
      fileHash: report.fileHash,
      result: report.result,
      managerId: opts.managerId,
      signedAt: signoff.signedAt.toISOString(),
    },
  }).then((commitId) => {
    if (commitId) {
      prisma.signoff.update({
        where: { id: signoff.id },
        data: { olympusCommitId: commitId },
      }).catch((err) => {
        console.error('[Signoff] Failed to update olympusCommitId:', err);
      });
    }
  }).catch((err) => {
    console.error('[Signoff] Failed to commit to Olympus:', err);
  });

  return { status: 201, body: { signoff } };
}
