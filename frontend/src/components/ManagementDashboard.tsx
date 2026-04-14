import React, { useState, useEffect, useCallback } from 'react';
import {
  BarChart, Bar, LineChart, Line, XAxis, YAxis, CartesianGrid,
  Tooltip, Legend, ResponsiveContainer, PieChart, Pie, Cell,
} from 'recharts';
import {
  getPlantKPIs, getShiftComparison, getDrillDown, getDowntimeTrends,
  getScrapAnalysis, getWorkerPerformance, getSapSyncStatus,
  type PlantKPI, type ShiftComparison, type DowntimeTrend, type WorkerMetric,
} from '../services/analyticsService';

/**
 * ManagementDashboard — Plant-wide analytics for managers.
 *
 * Features:
 * - Plant-wide KPIs: OEE, throughput, scrap rate, on-time delivery
 * - Shift-over-shift comparison charts
 * - Drill-down: Plant → Plant Area → Work Center → Equipment
 * - Downtime trends (daily/weekly/monthly)
 * - Scrap analysis
 * - Worker performance metrics
 * - SAP sync status
 */

const COLORS = ['#3b82f6', '#10b981', '#f59e0b', '#ef4444', '#8b5cf6', '#ec4899', '#06b6d4', '#84cc16'];
const SHIFT_LABELS: Record<string, string> = {
  FIRST: '1st (7a–3p)',
  SECOND: '2nd (3p–11p)',
  THIRD: '3rd (11p–7a)',
};

const cardStyle: React.CSSProperties = {
  background: '#111', border: '1px solid #1e1e1e', borderRadius: 12, padding: '16px 20px',
};

const kpiCardStyle: React.CSSProperties = {
  ...cardStyle, textAlign: 'center', minWidth: 140,
};

type TabKey = 'overview' | 'downtime' | 'scrap' | 'workers' | 'sap';

export default function ManagementDashboard() {
  const [kpis, setKpis] = useState<PlantKPI | null>(null);
  const [shiftData, setShiftData] = useState<ShiftComparison[]>([]);
  const [downtimeTrends, setDowntimeTrends] = useState<DowntimeTrend[]>([]);
  const [scrapData, setScrapData] = useState<{ code: string; description: string; count: number; quantity: number }[]>([]);
  const [workers, setWorkers] = useState<WorkerMetric[]>([]);
  const [syncStatus, setSyncStatus] = useState<Record<string, unknown> | null>(null);
  const [drillDown, setDrillDown] = useState<Record<string, unknown> | null>(null);
  const [drillPath, setDrillPath] = useState<string[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [activeTab, setActiveTab] = useState<TabKey>('overview');
  const [granularity, setGranularity] = useState<'daily' | 'weekly' | 'monthly'>('daily');
  const [periodDays, setPeriodDays] = useState(7);

  const loadData = useCallback(async () => {
    try {
      setLoading(true);
      setError(null);

      const now = new Date();
      const start = new Date(now.getTime() - periodDays * 24 * 60 * 60 * 1000);

      const [kpiRes, shiftRes, trendRes, scrapRes, workerRes, sapRes, drillRes] = await Promise.all([
        getPlantKPIs(start.toISOString(), now.toISOString()),
        getShiftComparison(periodDays),
        getDowntimeTrends({ granularity, start: start.toISOString(), end: now.toISOString() }),
        getScrapAnalysis(start.toISOString(), now.toISOString()),
        getWorkerPerformance(start.toISOString(), now.toISOString()),
        getSapSyncStatus(),
        getDrillDown({ start: start.toISOString(), end: now.toISOString() }),
      ]);

      setKpis(kpiRes.kpis);
      setShiftData(shiftRes.comparisons);
      setDowntimeTrends(trendRes.trends);
      setScrapData(scrapRes.byMaterial);
      setWorkers(workerRes.workers);
      setSyncStatus(sapRes.syncStatus as unknown as Record<string, unknown>);
      setDrillDown(drillRes as unknown as Record<string, unknown>);
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Failed to load analytics');
    } finally {
      setLoading(false);
    }
  }, [periodDays, granularity]);

  useEffect(() => {
    loadData();
    const interval = setInterval(loadData, 60000); // Refresh every minute
    return () => clearInterval(interval);
  }, [loadData]);

  const tabs: { key: TabKey; label: string }[] = [
    { key: 'overview', label: '📊 Overview' },
    { key: 'downtime', label: '⬇ Downtime Trends' },
    { key: 'scrap', label: '🗑 Scrap Analysis' },
    { key: 'workers', label: '👥 Workers' },
    { key: 'sap', label: '🔄 SAP Sync' },
  ];

  return (
    <div style={{
      minHeight: '100vh', background: '#0a0a0a', color: '#f1f5f9',
      fontFamily: "-apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif",
      padding: '12px 16px', maxWidth: 1400, margin: '0 auto',
    }}>
      {/* Header */}
      <div style={{
        display: 'flex', alignItems: 'center', gap: 12, marginBottom: 16,
        padding: '12px 16px', background: '#111', borderRadius: 10, border: '1px solid #1e1e1e',
      }}>
        <div>
          <div style={{ fontSize: 20, fontWeight: 800 }}>📈 Management Dashboard</div>
          <div style={{ fontSize: 12, color: '#6b7280' }}>Plant-wide Analytics · Trelleborg Rutherfordton</div>
        </div>
        <div style={{ marginLeft: 'auto', display: 'flex', gap: 8, alignItems: 'center' }}>
          <select
            value={periodDays}
            onChange={e => setPeriodDays(Number(e.target.value))}
            style={{
              background: '#1e1e1e', color: '#f1f5f9', border: '1px solid #333',
              borderRadius: 6, padding: '6px 10px', fontSize: 12,
            }}
          >
            <option value={1}>Last 24h</option>
            <option value={7}>Last 7 days</option>
            <option value={30}>Last 30 days</option>
            <option value={90}>Last 90 days</option>
          </select>
          <button
            onClick={loadData}
            style={{
              background: '#1e3a5f', color: '#60a5fa', border: '1px solid #3b82f6',
              borderRadius: 6, padding: '6px 14px', fontSize: 12, fontWeight: 700, cursor: 'pointer',
            }}
          >
            ↻ Refresh
          </button>
        </div>
      </div>

      {error && (
        <div style={{
          padding: '12px 16px', background: '#2d1010', border: '1px solid #7f1d1d',
          borderRadius: 10, marginBottom: 12, color: '#fca5a5', fontSize: 13,
        }}>
          ⚠ {error}
        </div>
      )}

      {/* KPI Cards */}
      {kpis && (
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(150px, 1fr))', gap: 10, marginBottom: 16 }}>
          <KPICard label="OEE" value={`${(kpis.oee * 100).toFixed(1)}%`} color={kpis.oee >= 0.85 ? '#4ade80' : kpis.oee >= 0.6 ? '#fbbf24' : '#f87171'} />
          <KPICard label="Availability" value={`${(kpis.availability * 100).toFixed(1)}%`} color="#3b82f6" />
          <KPICard label="Performance" value={`${(kpis.performance * 100).toFixed(1)}%`} color="#8b5cf6" />
          <KPICard label="Quality" value={`${(kpis.quality * 100).toFixed(1)}%`} color="#10b981" />
          <KPICard label="Throughput" value={`${kpis.throughput}`} color="#06b6d4" />
          <KPICard label="Scrap Rate" value={`${(kpis.scrapRate * 100).toFixed(1)}%`} color={kpis.scrapRate <= 0.02 ? '#4ade80' : '#f87171'} />
          <KPICard label="On-Time" value={`${(kpis.onTimeDelivery * 100).toFixed(0)}%`} color="#10b981" />
          <KPICard label="Equipment" value={`${kpis.runningEquipment}/${kpis.totalEquipment}`} subLabel={`${kpis.downEquipment} down`} color={kpis.downEquipment > 0 ? '#f87171' : '#4ade80'} />
        </div>
      )}

      {/* Tabs */}
      <div style={{ display: 'flex', gap: 4, marginBottom: 16, overflowX: 'auto' }}>
        {tabs.map(tab => (
          <button
            key={tab.key}
            onClick={() => setActiveTab(tab.key)}
            style={{
              padding: '10px 18px', whiteSpace: 'nowrap',
              background: activeTab === tab.key ? '#1e3a5f' : '#111',
              border: `1px solid ${activeTab === tab.key ? '#3b82f6' : '#1e1e1e'}`,
              borderRadius: '8px 8px 0 0',
              color: activeTab === tab.key ? '#60a5fa' : '#6b7280',
              fontSize: 13, fontWeight: 700, cursor: 'pointer',
            }}
          >
            {tab.label}
          </button>
        ))}
      </div>

      {loading && !kpis ? (
        <div style={{ textAlign: 'center', padding: '3rem 0', color: '#6b7280' }}>Loading analytics…</div>
      ) : (
        <>
          {/* Overview Tab — Shift Comparison + Drill Down */}
          {activeTab === 'overview' && (
            <div style={{ display: 'grid', gap: 16 }}>
              {/* Shift Comparison Chart */}
              <div style={cardStyle}>
                <div style={{ fontSize: 14, fontWeight: 700, marginBottom: 12, color: '#f1f5f9' }}>
                  Shift-over-Shift Comparison (Last {periodDays} days)
                </div>
                {shiftData.length > 0 ? (
                  <ResponsiveContainer width="100%" height={300}>
                    <BarChart data={shiftData.slice(-21)} margin={{ top: 5, right: 20, left: 10, bottom: 5 }}>
                      <CartesianGrid strokeDasharray="3 3" stroke="#333" />
                      <XAxis dataKey="date" tick={{ fill: '#6b7280', fontSize: 10 }} />
                      <YAxis tick={{ fill: '#6b7280', fontSize: 10 }} />
                      <Tooltip contentStyle={{ background: '#1e1e1e', border: '1px solid #333', borderRadius: 8, color: '#f1f5f9' }} />
                      <Legend wrapperStyle={{ fontSize: 11 }} />
                      <Bar dataKey="downtimeMinutes" name="Downtime (min)" fill="#ef4444" />
                      <Bar dataKey="downtimeEvents" name="DT Events" fill="#f59e0b" />
                      <Bar dataKey="operatorsClocked" name="Operators" fill="#3b82f6" />
                    </BarChart>
                  </ResponsiveContainer>
                ) : (
                  <div style={{ padding: '2rem', textAlign: 'center', color: '#4b5563' }}>No shift data available</div>
                )}
              </div>

              {/* Drill-Down Section */}
              <DrillDownPanel data={drillDown} path={drillPath} onNavigate={setDrillPath} />
            </div>
          )}

          {/* Downtime Trends Tab */}
          {activeTab === 'downtime' && (
            <div style={cardStyle}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 12 }}>
                <div style={{ fontSize: 14, fontWeight: 700, color: '#f1f5f9' }}>Downtime Trends</div>
                <select
                  value={granularity}
                  onChange={e => setGranularity(e.target.value as 'daily' | 'weekly' | 'monthly')}
                  style={{
                    background: '#1e1e1e', color: '#f1f5f9', border: '1px solid #333',
                    borderRadius: 6, padding: '4px 8px', fontSize: 11, marginLeft: 'auto',
                  }}
                >
                  <option value="daily">Daily</option>
                  <option value="weekly">Weekly</option>
                  <option value="monthly">Monthly</option>
                </select>
              </div>
              {downtimeTrends.length > 0 ? (
                <ResponsiveContainer width="100%" height={350}>
                  <LineChart data={downtimeTrends} margin={{ top: 5, right: 20, left: 10, bottom: 5 }}>
                    <CartesianGrid strokeDasharray="3 3" stroke="#333" />
                    <XAxis dataKey="date" tick={{ fill: '#6b7280', fontSize: 10 }} />
                    <YAxis tick={{ fill: '#6b7280', fontSize: 10 }} />
                    <Tooltip contentStyle={{ background: '#1e1e1e', border: '1px solid #333', borderRadius: 8, color: '#f1f5f9' }} />
                    <Legend wrapperStyle={{ fontSize: 11 }} />
                    <Line type="monotone" dataKey="totalMinutes" name="Total (min)" stroke="#ef4444" strokeWidth={2} dot={{ r: 3 }} />
                    <Line type="monotone" dataKey="plannedMinutes" name="Planned" stroke="#3b82f6" strokeWidth={2} dot={{ r: 3 }} />
                    <Line type="monotone" dataKey="unplannedMinutes" name="Unplanned" stroke="#f59e0b" strokeWidth={2} dot={{ r: 3 }} />
                    <Line type="monotone" dataKey="totalEvents" name="Events" stroke="#8b5cf6" strokeWidth={1} strokeDasharray="5 5" dot={{ r: 2 }} />
                  </LineChart>
                </ResponsiveContainer>
              ) : (
                <div style={{ padding: '2rem', textAlign: 'center', color: '#4b5563' }}>No downtime data for this period</div>
              )}
            </div>
          )}

          {/* Scrap Analysis Tab */}
          {activeTab === 'scrap' && (
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16 }}>
              <div style={cardStyle}>
                <div style={{ fontSize: 14, fontWeight: 700, marginBottom: 12, color: '#f1f5f9' }}>
                  Scrap by Material
                </div>
                {scrapData.length > 0 ? (
                  <ResponsiveContainer width="100%" height={300}>
                    <PieChart>
                      <Pie data={scrapData} dataKey="quantity" nameKey="code" cx="50%" cy="50%" outerRadius={100} label={({ code, percent }) => `${code} (${(percent * 100).toFixed(0)}%)`}>
                        {scrapData.map((_, i) => (
                          <Cell key={i} fill={COLORS[i % COLORS.length]} />
                        ))}
                      </Pie>
                      <Tooltip contentStyle={{ background: '#1e1e1e', border: '1px solid #333', borderRadius: 8, color: '#f1f5f9' }} />
                    </PieChart>
                  </ResponsiveContainer>
                ) : (
                  <div style={{ padding: '2rem', textAlign: 'center', color: '#4b5563' }}>No scrap data</div>
                )}
              </div>
              <div style={cardStyle}>
                <div style={{ fontSize: 14, fontWeight: 700, marginBottom: 12, color: '#f1f5f9' }}>
                  Scrap Details
                </div>
                {scrapData.length > 0 ? (
                  <div style={{ maxHeight: 300, overflow: 'auto' }}>
                    {scrapData.map((item, i) => (
                      <div key={item.code} style={{
                        display: 'flex', alignItems: 'center', gap: 10, padding: '8px 0',
                        borderBottom: i < scrapData.length - 1 ? '1px solid #1e1e1e' : undefined,
                      }}>
                        <div style={{ width: 10, height: 10, borderRadius: '50%', background: COLORS[i % COLORS.length], flexShrink: 0 }} />
                        <div style={{ flex: 1 }}>
                          <div style={{ fontSize: 13, fontWeight: 700, color: '#f1f5f9' }}>{item.code}</div>
                          <div style={{ fontSize: 11, color: '#6b7280' }}>{item.description}</div>
                        </div>
                        <div style={{ textAlign: 'right' }}>
                          <div style={{ fontSize: 13, fontWeight: 800, color: '#f87171', fontFamily: "'DM Mono', monospace" }}>{item.quantity}</div>
                          <div style={{ fontSize: 10, color: '#6b7280' }}>{item.count} events</div>
                        </div>
                      </div>
                    ))}
                  </div>
                ) : (
                  <div style={{ padding: '2rem', textAlign: 'center', color: '#4b5563' }}>No scrap data</div>
                )}
              </div>
            </div>
          )}

          {/* Workers Tab */}
          {activeTab === 'workers' && (
            <div style={cardStyle}>
              <div style={{ fontSize: 14, fontWeight: 700, marginBottom: 12, color: '#f1f5f9' }}>
                Worker Performance (Last {periodDays} days)
              </div>
              {workers.length > 0 ? (
                <>
                  <ResponsiveContainer width="100%" height={300}>
                    <BarChart data={workers.slice(0, 20)} layout="vertical" margin={{ top: 5, right: 20, left: 80, bottom: 5 }}>
                      <CartesianGrid strokeDasharray="3 3" stroke="#333" />
                      <XAxis type="number" tick={{ fill: '#6b7280', fontSize: 10 }} />
                      <YAxis dataKey="operatorName" type="category" tick={{ fill: '#6b7280', fontSize: 10 }} width={70} />
                      <Tooltip contentStyle={{ background: '#1e1e1e', border: '1px solid #333', borderRadius: 8, color: '#f1f5f9' }} />
                      <Legend wrapperStyle={{ fontSize: 11 }} />
                      <Bar dataKey="shiftsWorked" name="Shifts Worked" fill="#3b82f6" />
                      <Bar dataKey="totalClockMinutes" name="Clock Minutes" fill="#10b981" />
                    </BarChart>
                  </ResponsiveContainer>
                  <div style={{ marginTop: 16 }}>
                    <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 12 }}>
                      <thead>
                        <tr style={{ borderBottom: '1px solid #333' }}>
                          <th style={{ padding: '8px', textAlign: 'left', color: '#6b7280' }}>Operator</th>
                          <th style={{ padding: '8px', textAlign: 'left', color: '#6b7280' }}>Badge</th>
                          <th style={{ padding: '8px', textAlign: 'right', color: '#6b7280' }}>Shifts</th>
                          <th style={{ padding: '8px', textAlign: 'right', color: '#6b7280' }}>Hours</th>
                        </tr>
                      </thead>
                      <tbody>
                        {workers.map(w => (
                          <tr key={w.operatorId} style={{ borderBottom: '1px solid #1e1e1e' }}>
                            <td style={{ padding: '8px', color: '#f1f5f9', fontWeight: 600 }}>{w.operatorName}</td>
                            <td style={{ padding: '8px', color: '#6b7280', fontFamily: "'DM Mono', monospace" }}>{w.badgeId || '—'}</td>
                            <td style={{ padding: '8px', textAlign: 'right', color: '#60a5fa', fontWeight: 700 }}>{w.shiftsWorked}</td>
                            <td style={{ padding: '8px', textAlign: 'right', color: '#4ade80', fontWeight: 700, fontFamily: "'DM Mono', monospace" }}>
                              {(w.totalClockMinutes / 60).toFixed(1)}h
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </>
              ) : (
                <div style={{ padding: '2rem', textAlign: 'center', color: '#4b5563' }}>No worker data for this period</div>
              )}
            </div>
          )}

          {/* SAP Sync Tab */}
          {activeTab === 'sap' && (
            <SapSyncPanel syncStatus={syncStatus} onRefresh={loadData} />
          )}
        </>
      )}
    </div>
  );
}

// ─── Sub-Components ───────────────────────────────────────────────────────────

function KPICard({ label, value, subLabel, color }: {
  label: string; value: string; subLabel?: string; color: string;
}) {
  return (
    <div style={kpiCardStyle}>
      <div style={{ fontSize: 10, color: '#6b7280', fontWeight: 600, letterSpacing: '0.05em', textTransform: 'uppercase', marginBottom: 4 }}>
        {label}
      </div>
      <div style={{ fontSize: 24, fontWeight: 800, color, fontFamily: "'DM Mono', monospace" }}>
        {value}
      </div>
      {subLabel && <div style={{ fontSize: 10, color: '#6b7280', marginTop: 2 }}>{subLabel}</div>}
    </div>
  );
}

function DrillDownPanel({ data, path, onNavigate }: {
  data: Record<string, unknown> | null;
  path: string[];
  onNavigate: (path: string[]) => void;
}) {
  if (!data) return null;

  const level = data.level as string;
  const areas = data.plantAreas as Array<{
    id: string; code: string; name: string;
    equipmentCount: number; runningCount: number; downCount: number;
  }> | undefined;

  return (
    <div style={cardStyle}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 12 }}>
        <div style={{ fontSize: 14, fontWeight: 700, color: '#f1f5f9' }}>
          Plant Drill-Down
        </div>
        {path.length > 0 && (
          <button
            onClick={() => onNavigate(path.slice(0, -1))}
            style={{
              background: '#1e1e1e', color: '#60a5fa', border: '1px solid #333',
              borderRadius: 6, padding: '4px 10px', fontSize: 11, cursor: 'pointer',
            }}
          >
            ← Back
          </button>
        )}
        <div style={{ fontSize: 11, color: '#6b7280', marginLeft: 'auto' }}>
          Level: {level}
        </div>
      </div>

      {level === 'plant' && areas && (
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(250px, 1fr))', gap: 10 }}>
          {areas.map(area => (
            <div
              key={area.id}
              onClick={() => onNavigate([...path, area.code])}
              style={{
                padding: '14px 16px', background: '#0a0a0a', border: '1px solid #1e1e1e',
                borderRadius: 10, cursor: 'pointer', transition: 'border-color 0.2s',
              }}
              onMouseEnter={e => (e.currentTarget.style.borderColor = '#3b82f6')}
              onMouseLeave={e => (e.currentTarget.style.borderColor = '#1e1e1e')}
            >
              <div style={{ fontSize: 14, fontWeight: 700, color: '#f1f5f9', marginBottom: 4 }}>
                🏭 {area.name}
              </div>
              <div style={{ display: 'flex', gap: 12, fontSize: 11 }}>
                <span style={{ color: '#6b7280' }}>{area.equipmentCount} equip</span>
                <span style={{ color: '#4ade80' }}>{area.runningCount} running</span>
                {area.downCount > 0 && <span style={{ color: '#f87171' }}>{area.downCount} down</span>}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

function SapSyncPanel({ syncStatus, onRefresh }: {
  syncStatus: Record<string, unknown> | null;
  onRefresh: () => void;
}) {
  if (!syncStatus) {
    return <div style={{ ...cardStyle, textAlign: 'center', color: '#6b7280' }}>Loading SAP sync status…</div>;
  }

  const status = syncStatus as unknown as {
    materials: { lastSync: string | null; status: string };
    batches: { lastSync: string | null; status: string };
    movements: { lastSync: string | null; status: string };
    overallStatus: string;
    lastChecked: string;
  };

  const systems = [
    { label: 'Materials', ...status.materials },
    { label: 'Batches', ...status.batches },
    { label: 'Movements', ...status.movements },
  ];

  return (
    <div style={cardStyle}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 16 }}>
        <div style={{ fontSize: 14, fontWeight: 700, color: '#f1f5f9' }}>SAP Sync Status</div>
        <div style={{
          padding: '4px 10px', borderRadius: 20, fontSize: 11, fontWeight: 700,
          background: status.overallStatus === 'ok' ? '#052e16' : '#450a0a',
          color: status.overallStatus === 'ok' ? '#4ade80' : '#f87171',
          border: `1px solid ${status.overallStatus === 'ok' ? '#14532d' : '#7f1d1d'}`,
        }}>
          {status.overallStatus === 'ok' ? '✓ Healthy' : '⚠ Issues'}
        </div>
        <button
          onClick={onRefresh}
          style={{
            marginLeft: 'auto',
            background: '#1e3a5f', color: '#60a5fa', border: '1px solid #3b82f6',
            borderRadius: 6, padding: '6px 14px', fontSize: 12, fontWeight: 700, cursor: 'pointer',
          }}
        >
          🔄 Sync Now
        </button>
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 12 }}>
        {systems.map(sys => (
          <div key={sys.label} style={{
            padding: '12px 16px', background: '#0a0a0a', border: '1px solid #1e1e1e', borderRadius: 10,
          }}>
            <div style={{ fontSize: 12, fontWeight: 700, color: '#f1f5f9', marginBottom: 6 }}>{sys.label}</div>
            <div style={{
              fontSize: 11,
              color: sys.status === 'ok' ? '#4ade80' : '#f87171',
              fontWeight: 600,
            }}>
              {sys.status === 'ok' ? '✓ Synced' : '⚠ ' + sys.status}
            </div>
            <div style={{ fontSize: 10, color: '#6b7280', marginTop: 4 }}>
              {sys.lastSync ? `Last: ${new Date(sys.lastSync).toLocaleString()}` : 'Never synced'}
            </div>
          </div>
        ))}
      </div>

      <div style={{ marginTop: 12, fontSize: 10, color: '#4b5563', textAlign: 'right' }}>
        Last checked: {new Date(status.lastChecked).toLocaleTimeString()}
      </div>
    </div>
  );
}
