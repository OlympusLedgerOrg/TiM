import { Router } from 'express';
import { requireAuth, requireRole } from '../middleware/auth.js';
import { z } from 'zod';
import {
  getPlantKPIs,
  getShiftComparison,
  getDrillDown,
  getDowntimeTrends,
  getScrapAnalysis,
  getWorkerPerformance,
  generateShiftReport,
  getSapSyncStatus,
} from '../services/analyticsService.js';

const router = Router();

/**
 * Analytics Routes — Management Dashboard & Reporting API
 *
 * Provides:
 * - Plant-wide KPIs (OEE, throughput, scrap rate, on-time delivery)
 * - Shift-over-shift comparison
 * - Drill-down analytics (Plant → Area → WC → Equipment)
 * - Downtime trends (daily/weekly/monthly)
 * - Scrap analysis
 * - Worker performance metrics
 * - Shift report generation
 * - SAP sync status
 *
 * All require JWT auth. Most are Supervisor/Admin only.
 */

// ─── Plant-Wide KPIs ──────────────────────────────────────────────────────────

const kpiSchema = z.object({
  start: z.string().optional(),
  end: z.string().optional(),
});

router.get('/kpis', requireAuth, requireRole(['Supervisor', 'Admin']), async (req, res) => {
  const start = req.query.start
    ? new Date(req.query.start as string)
    : new Date(Date.now() - 8 * 60 * 60 * 1000); // Last 8 hours
  const end = req.query.end ? new Date(req.query.end as string) : new Date();

  if (isNaN(start.getTime()) || isNaN(end.getTime())) {
    return res.status(400).json({ message: 'Invalid date range' });
  }

  const result = await getPlantKPIs(req.user!.tenantId, start, end);
  return res.status(result.status).json(result.body);
});

// ─── Shift Comparison ─────────────────────────────────────────────────────────

router.get('/shift-comparison', requireAuth, requireRole(['Supervisor', 'Admin']), async (req, res) => {
  const days = parseInt(req.query.days as string) || 7;
  const result = await getShiftComparison(req.user!.tenantId, Math.min(days, 90));
  return res.status(result.status).json(result.body);
});

// ─── Drill-Down ───────────────────────────────────────────────────────────────

router.get('/drill-down', requireAuth, requireRole(['Supervisor', 'Admin']), async (req, res) => {
  const start = req.query.start
    ? new Date(req.query.start as string)
    : new Date(Date.now() - 24 * 60 * 60 * 1000);
  const end = req.query.end ? new Date(req.query.end as string) : new Date();

  if (isNaN(start.getTime()) || isNaN(end.getTime())) {
    return res.status(400).json({ message: 'Invalid date range' });
  }

  const result = await getDrillDown(req.user!.tenantId, {
    plantAreaCode: req.query.plantArea as string | undefined,
    workCenterCode: req.query.workCenter as string | undefined,
    equipmentId: req.query.equipmentId as string | undefined,
    periodStart: start,
    periodEnd: end,
  });
  return res.status(result.status).json(result.body);
});

// ─── Downtime Trends ──────────────────────────────────────────────────────────

const trendSchema = z.object({
  granularity: z.enum(['daily', 'weekly', 'monthly']).default('daily'),
});

router.get('/downtime-trends', requireAuth, requireRole(['Supervisor', 'Admin']), async (req, res) => {
  const granularity = (req.query.granularity as string) || 'daily';
  if (!['daily', 'weekly', 'monthly'].includes(granularity)) {
    return res.status(400).json({ message: 'granularity must be daily, weekly, or monthly' });
  }

  const start = req.query.start
    ? new Date(req.query.start as string)
    : new Date(Date.now() - 30 * 24 * 60 * 60 * 1000); // Last 30 days
  const end = req.query.end ? new Date(req.query.end as string) : new Date();

  if (isNaN(start.getTime()) || isNaN(end.getTime())) {
    return res.status(400).json({ message: 'Invalid date range' });
  }

  const result = await getDowntimeTrends(req.user!.tenantId, {
    periodStart: start,
    periodEnd: end,
    granularity: granularity as 'daily' | 'weekly' | 'monthly',
    plantAreaCode: req.query.plantArea as string | undefined,
    workCenterCode: req.query.workCenter as string | undefined,
    equipmentId: req.query.equipmentId as string | undefined,
  });
  return res.status(result.status).json(result.body);
});

// ─── Scrap Analysis ───────────────────────────────────────────────────────────

router.get('/scrap-analysis', requireAuth, requireRole(['Supervisor', 'Admin']), async (req, res) => {
  const start = req.query.start
    ? new Date(req.query.start as string)
    : new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);
  const end = req.query.end ? new Date(req.query.end as string) : new Date();

  if (isNaN(start.getTime()) || isNaN(end.getTime())) {
    return res.status(400).json({ message: 'Invalid date range' });
  }

  const result = await getScrapAnalysis(req.user!.tenantId, start, end);
  return res.status(result.status).json(result.body);
});

// ─── Worker Performance ───────────────────────────────────────────────────────

router.get('/worker-performance', requireAuth, requireRole(['Supervisor', 'Admin']), async (req, res) => {
  const start = req.query.start
    ? new Date(req.query.start as string)
    : new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);
  const end = req.query.end ? new Date(req.query.end as string) : new Date();

  if (isNaN(start.getTime()) || isNaN(end.getTime())) {
    return res.status(400).json({ message: 'Invalid date range' });
  }

  const result = await getWorkerPerformance(req.user!.tenantId, start, end);
  return res.status(result.status).json(result.body);
});

// ─── Shift Report ─────────────────────────────────────────────────────────────

const shiftReportSchema = z.object({
  date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  shift: z.enum(['FIRST', 'SECOND', 'THIRD']),
});

router.get('/shift-report', requireAuth, requireRole(['Supervisor', 'Admin']), async (req, res) => {
  const date = (req.query.date as string) || new Date().toISOString().slice(0, 10);
  const shift = (req.query.shift as string) || 'FIRST';

  if (!['FIRST', 'SECOND', 'THIRD'].includes(shift)) {
    return res.status(400).json({ message: 'shift must be FIRST, SECOND, or THIRD' });
  }

  const result = await generateShiftReport(req.user!.tenantId, date, shift);
  return res.status(result.status).json(result.body);
});

// ─── SAP Sync Status ──────────────────────────────────────────────────────────

router.get('/sap-sync-status', requireAuth, requireRole(['Supervisor', 'Admin']), async (req, res) => {
  const result = await getSapSyncStatus(req.user!.tenantId);
  return res.status(result.status).json(result.body);
});

export default router;
