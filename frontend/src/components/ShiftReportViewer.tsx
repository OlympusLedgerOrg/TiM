import React, { useState, useCallback } from 'react';
import { getShiftReport, type ShiftReport } from '../services/analyticsService';

/**
 * ShiftReportViewer — View and export shift reports.
 *
 * Features:
 * - Select date and shift to generate report
 * - View report with production, downtime, quality, and operator data
 * - Print/PDF export via browser print dialog
 *
 * Accessible from the Management Dashboard.
 */

const SHIFT_OPTIONS = [
  { value: 'FIRST', label: '1st Shift (7am – 3pm)' },
  { value: 'SECOND', label: '2nd Shift (3pm – 11pm)' },
  { value: 'THIRD', label: '3rd Shift (11pm – 7am)' },
];

const cardStyle: React.CSSProperties = {
  background: '#111', border: '1px solid #1e1e1e', borderRadius: 12, padding: '16px 20px',
  marginBottom: 16,
};

export default function ShiftReportViewer() {
  const [date, setDate] = useState(new Date().toISOString().slice(0, 10));
  const [shift, setShift] = useState('FIRST');
  const [report, setReport] = useState<ShiftReport | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const loadReport = useCallback(async () => {
    try {
      setLoading(true);
      setError(null);
      const result = await getShiftReport(date, shift);
      setReport(result.report);
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Failed to load report');
    } finally {
      setLoading(false);
    }
  }, [date, shift]);

  const handlePrint = () => {
    window.print();
  };

  return (
    <div style={{
      minHeight: '100vh', background: '#0a0a0a', color: '#f1f5f9',
      fontFamily: "-apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif",
      padding: '12px 16px', maxWidth: 1000, margin: '0 auto',
    }}>
      {/* Header */}
      <div style={{
        display: 'flex', alignItems: 'center', gap: 12, marginBottom: 16,
        padding: '12px 16px', background: '#111', borderRadius: 10, border: '1px solid #1e1e1e',
      }}>
        <div>
          <div style={{ fontSize: 20, fontWeight: 800 }}>📋 Shift Report</div>
          <div style={{ fontSize: 12, color: '#6b7280' }}>Auto-Generated Production Summary</div>
        </div>
      </div>

      {/* Controls */}
      <div style={{ display: 'flex', gap: 10, marginBottom: 16, alignItems: 'flex-end', flexWrap: 'wrap' }}>
        <div>
          <label style={{ display: 'block', fontSize: 11, color: '#6b7280', marginBottom: 4, fontWeight: 600 }}>Date</label>
          <input
            type="date"
            value={date}
            onChange={e => setDate(e.target.value)}
            style={{
              padding: '8px 12px', background: '#1e1e1e', color: '#f1f5f9',
              border: '1px solid #333', borderRadius: 8, fontSize: 13,
            }}
          />
        </div>
        <div>
          <label style={{ display: 'block', fontSize: 11, color: '#6b7280', marginBottom: 4, fontWeight: 600 }}>Shift</label>
          <select
            value={shift}
            onChange={e => setShift(e.target.value)}
            style={{
              padding: '8px 12px', background: '#1e1e1e', color: '#f1f5f9',
              border: '1px solid #333', borderRadius: 8, fontSize: 13,
            }}
          >
            {SHIFT_OPTIONS.map(s => (
              <option key={s.value} value={s.value}>{s.label}</option>
            ))}
          </select>
        </div>
        <button
          onClick={loadReport}
          disabled={loading}
          style={{
            padding: '8px 18px', background: '#1e3a5f', color: '#60a5fa',
            border: '1px solid #3b82f6', borderRadius: 8, fontSize: 13, fontWeight: 700,
            cursor: loading ? 'default' : 'pointer', opacity: loading ? 0.6 : 1,
          }}
        >
          {loading ? 'Loading…' : 'Generate Report'}
        </button>
        {report && (
          <button
            onClick={handlePrint}
            style={{
              padding: '8px 18px', background: '#1e1e1e', color: '#6b7280',
              border: '1px solid #333', borderRadius: 8, fontSize: 13, fontWeight: 700, cursor: 'pointer',
            }}
          >
            🖨 Print / PDF
          </button>
        )}
      </div>

      {error && (
        <div style={{
          padding: '12px 16px', background: '#2d1010', border: '1px solid #7f1d1d',
          borderRadius: 10, marginBottom: 12, color: '#fca5a5', fontSize: 13,
        }}>
          ⚠ {error}
        </div>
      )}

      {/* Report Content */}
      {report && (
        <div id="shift-report-content">
          {/* Report Header */}
          <div style={{ ...cardStyle, textAlign: 'center', padding: '20px' }}>
            <div style={{ fontSize: 20, fontWeight: 800, color: '#f1f5f9' }}>
              Shift Report — {SHIFT_OPTIONS.find(s => s.value === report.shift)?.label}
            </div>
            <div style={{ fontSize: 14, color: '#6b7280', marginTop: 4 }}>
              {report.date} · Generated {new Date(report.generatedAt).toLocaleString()}
            </div>
          </div>

          {/* Summary Cards */}
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(180px, 1fr))', gap: 10, marginBottom: 16 }}>
            <SummaryCard label="Operators" value={`${report.operators.clockedIn}/${report.operators.total}`} icon="👥" color="#3b82f6" />
            <SummaryCard label="Production" value={`${report.production.totalQuantity}`} subLabel={`${report.production.totalEvents} events`} icon="🏭" color="#10b981" />
            <SummaryCard label="Downtime" value={`${report.downtime.totalMinutes}m`} subLabel={`${report.downtime.totalEvents} events`} icon="⬇" color="#ef4444" />
            <SummaryCard label="Scrap" value={`${report.quality.scrapQuantity}`} subLabel={`${report.quality.scrapEvents} events`} icon="🗑" color="#f59e0b" />
            <SummaryCard label="Consumption" value={`${report.consumption.totalQuantity}`} subLabel={`${report.consumption.totalEvents} events`} icon="📦" color="#8b5cf6" />
          </div>

          {/* Operators */}
          <div style={cardStyle}>
            <div style={{ fontSize: 14, fontWeight: 700, marginBottom: 12, color: '#f1f5f9' }}>
              👥 Operators ({report.operators.clockedIn} clocked in / {report.operators.total} assigned)
            </div>
            {report.operators.list.length > 0 ? (
              <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 12 }}>
                <thead>
                  <tr style={{ borderBottom: '1px solid #333' }}>
                    <th style={{ padding: 8, textAlign: 'left', color: '#6b7280' }}>Name</th>
                    <th style={{ padding: 8, textAlign: 'left', color: '#6b7280' }}>Badge</th>
                    <th style={{ padding: 8, textAlign: 'left', color: '#6b7280' }}>Work Center</th>
                    <th style={{ padding: 8, textAlign: 'left', color: '#6b7280' }}>Clock In</th>
                    <th style={{ padding: 8, textAlign: 'left', color: '#6b7280' }}>Clock Out</th>
                  </tr>
                </thead>
                <tbody>
                  {report.operators.list.map((op, i) => (
                    <tr key={i} style={{ borderBottom: '1px solid #1e1e1e' }}>
                      <td style={{ padding: 8, color: '#f1f5f9', fontWeight: 600 }}>{op.name}</td>
                      <td style={{ padding: 8, color: '#6b7280', fontFamily: "'DM Mono', monospace" }}>{op.badgeId || '—'}</td>
                      <td style={{ padding: 8, color: '#6b7280' }}>{op.workCenter || '—'}</td>
                      <td style={{ padding: 8, color: '#6b7280' }}>
                        {op.clockIn ? new Date(op.clockIn).toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit' }) : '—'}
                      </td>
                      <td style={{ padding: 8, color: '#6b7280' }}>
                        {op.clockOut ? new Date(op.clockOut).toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit' }) : '—'}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            ) : (
              <div style={{ padding: '1rem', color: '#4b5563', fontSize: 13 }}>No operators assigned</div>
            )}
          </div>

          {/* Downtime Events */}
          <div style={cardStyle}>
            <div style={{ fontSize: 14, fontWeight: 700, marginBottom: 12, color: '#f1f5f9' }}>
              ⬇ Downtime Events ({report.downtime.totalMinutes} total minutes)
            </div>
            {report.downtime.events.length > 0 ? (
              <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 12 }}>
                <thead>
                  <tr style={{ borderBottom: '1px solid #333' }}>
                    <th style={{ padding: 8, textAlign: 'left', color: '#6b7280' }}>Equipment</th>
                    <th style={{ padding: 8, textAlign: 'left', color: '#6b7280' }}>Category</th>
                    <th style={{ padding: 8, textAlign: 'left', color: '#6b7280' }}>Reason</th>
                    <th style={{ padding: 8, textAlign: 'right', color: '#6b7280' }}>Duration</th>
                    <th style={{ padding: 8, textAlign: 'left', color: '#6b7280' }}>Status</th>
                  </tr>
                </thead>
                <tbody>
                  {report.downtime.events.map((evt, i) => (
                    <tr key={i} style={{ borderBottom: '1px solid #1e1e1e' }}>
                      <td style={{ padding: 8, color: '#f1f5f9', fontWeight: 600 }}>{evt.equipment}</td>
                      <td style={{ padding: 8, color: '#6b7280' }}>{evt.category}</td>
                      <td style={{ padding: 8, color: '#6b7280' }}>
                        {evt.reasonCode}
                        {evt.reasonText && <span style={{ color: '#4b5563' }}> — {evt.reasonText}</span>}
                      </td>
                      <td style={{ padding: 8, textAlign: 'right', color: '#f87171', fontWeight: 700, fontFamily: "'DM Mono', monospace" }}>
                        {evt.durationMin}m
                      </td>
                      <td style={{ padding: 8 }}>
                        <span style={{
                          padding: '2px 8px', borderRadius: 12, fontSize: 10, fontWeight: 700,
                          background: evt.endedAt === 'OPEN' ? '#450a0a' : '#052e16',
                          color: evt.endedAt === 'OPEN' ? '#f87171' : '#4ade80',
                          border: `1px solid ${evt.endedAt === 'OPEN' ? '#7f1d1d' : '#14532d'}`,
                        }}>
                          {evt.endedAt === 'OPEN' ? 'OPEN' : 'Closed'}
                        </span>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            ) : (
              <div style={{ padding: '1rem', color: '#4b5563', fontSize: 13 }}>✓ No downtime events this shift</div>
            )}
          </div>
        </div>
      )}

      {!report && !loading && (
        <div style={{ textAlign: 'center', padding: '3rem 0', color: '#4b5563' }}>
          Select a date and shift, then click "Generate Report" to view the shift summary.
        </div>
      )}
    </div>
  );
}

// ─── Sub-Components ───────────────────────────────────────────────────────────

function SummaryCard({ label, value, subLabel, icon, color }: {
  label: string; value: string; subLabel?: string; icon: string; color: string;
}) {
  return (
    <div style={{
      background: '#111', border: '1px solid #1e1e1e', borderRadius: 12,
      padding: '14px 16px', textAlign: 'center',
    }}>
      <div style={{ fontSize: 18, marginBottom: 4 }}>{icon}</div>
      <div style={{ fontSize: 22, fontWeight: 800, color, fontFamily: "'DM Mono', monospace" }}>{value}</div>
      <div style={{ fontSize: 11, color: '#6b7280', fontWeight: 600, marginTop: 2 }}>{label}</div>
      {subLabel && <div style={{ fontSize: 10, color: '#4b5563', marginTop: 2 }}>{subLabel}</div>}
    </div>
  );
}
