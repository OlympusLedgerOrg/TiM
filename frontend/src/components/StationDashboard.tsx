import React, { useState, useEffect, useCallback } from "react";
import {
  getStationWorkOrder,
  getStationOnHand,
  getStationInbound,
  consumeMaterial,
  recordProduction,
  type StationWorkOrder,
  type StationComponent,
  type StationLot,
  type StationTransfer,
} from "../services/stationService";

// ─── Types ────────────────────────────────────────────────────────────────────

// UI-layer types (extend API types with display fields)
type WorkOrderComponent = StationComponent & { matNum: string };
type WorkOrder = StationWorkOrder & { components: WorkOrderComponent[] };
type OnHandLot = StationLot & { matNum: string };
type InboundTransfer = StationTransfer & { matNum: string; eta: string };

// ─── UOM Conversion ───────────────────────────────────────────────────────────
const UOM_CONVERSIONS: Record<string, { factor: number; target: string }> = {
  LB:  { factor: 0.453592, target: "KG" },
  KG:  { factor: 2.20462,  target: "LB" },
  GAL: { factor: 3.78541,  target: "L"  },
  L:   { factor: 0.264172, target: "GAL" },
  OZ:  { factor: 28.3495,  target: "G"  },
  G:   { factor: 0.035274, target: "OZ" },
  FT:  { factor: 0.3048,   target: "M"  },
  M:   { factor: 3.28084,  target: "FT" },
};

function fmtDual(quantity: number, uom: string): string | { primary: string; secondary: string } {
  const conv = UOM_CONVERSIONS[uom?.toUpperCase()];
  const base = Number(quantity).toLocaleString("en-US", { maximumFractionDigits: 1 });
  if (!conv) return `${base} ${uom}`;
  const converted = (Number(quantity) * conv.factor).toLocaleString("en-US", { maximumFractionDigits: 1 });
  return { primary: `${base} ${uom}`, secondary: `${converted} ${conv.target}` };
}

// ─── Helpers ──────────────────────────────────────────────────────────────────
function daysUntil(dateStr: string): number {
  const diff = new Date(dateStr).getTime() - Date.now();
  return Math.ceil(diff / (1000 * 60 * 60 * 24));
}

function fmtQty(n: number): string {
  return Number(n).toLocaleString("en-US", { maximumFractionDigits: 1 });
}

function QtyDisplay({ quantity, uom, size = 16 }: { quantity: number; uom: string; size?: number }) {
  const result = fmtDual(quantity, uom);
  if (typeof result === "string") {
    return <span style={{ fontSize: size, fontWeight: 800, color: "#f1f5f9", fontFamily: "'DM Mono', monospace" }}>{result}</span>;
  }
  return (
    <div>
      <div style={{ fontSize: size, fontWeight: 800, color: "#f1f5f9", fontFamily: "'DM Mono', monospace", lineHeight: 1.1 }}>{result.primary}</div>
      <div style={{ fontSize: 11, color: "#4b5563", fontFamily: "'DM Mono', monospace" }}>{result.secondary}</div>
    </div>
  );
}

function timeUntil(isoStr: string): string {
  const diff = new Date(isoStr).getTime() - Date.now();
  const h = Math.floor(diff / 3600000);
  const m = Math.floor((diff % 3600000) / 60000);
  if (h > 0) return `${h}h ${m}m`;
  return `${m}m`;
}

function timeSince(isoStr: string): string {
  const diff = Date.now() - new Date(isoStr).getTime();
  const m = Math.floor(diff / 60000);
  if (m < 60) return `~${m} min ago`;
  const h = Math.floor(m / 60);
  return `~${h}h ago`;
}

// ─── Sub-components ───────────────────────────────────────────────────────────

function StatusBadge({ status, labResult }: { status?: string; labResult?: string | null }) {
  const map: Record<string, { bg: string; color: string; label: string }> = {
    ACTIVE:      { bg: "#1a3a2a", color: "#4ade80", label: "Active" },
    QUARANTINED: { bg: "#3a1a1a", color: "#f87171", label: "Quarantined" },
    RESERVED:    { bg: "#1a2a3a", color: "#60a5fa", label: "Reserved" },
    CONSUMED:    { bg: "#2a2a2a", color: "#9ca3af", label: "Consumed" },
  };
  const lab: Record<string, { bg: string; color: string; label: string }> = {
    PASS:    { bg: "#1a3a2a", color: "#4ade80", label: "Lab ✓" },
    FAIL:    { bg: "#3a1a1a", color: "#f87171", label: "Lab ✗" },
    PENDING: { bg: "#2a1f0a", color: "#fbbf24", label: "Lab ?" },
  };
  const s = (status && map[status]) || map.ACTIVE;
  const l = labResult ? lab[labResult] : null;
  return (
    <span style={{ display: "inline-flex", gap: 4 }}>
      <span style={{ background: s.bg, color: s.color, borderRadius: 4, padding: "2px 7px", fontSize: 11, fontWeight: 700, letterSpacing: "0.04em" }}>{s.label}</span>
      {l && <span style={{ background: l.bg, color: l.color, borderRadius: 4, padding: "2px 7px", fontSize: 11, fontWeight: 700, letterSpacing: "0.04em" }}>{l.label}</span>}
    </span>
  );
}

function ExpiryChip({ dateStr }: { dateStr: string }) {
  const days = daysUntil(dateStr);
  const urgent = days <= 30;
  const warn = days <= 90;
  const color = urgent ? "#f87171" : warn ? "#fbbf24" : "#6b7280";
  const bg = urgent ? "#3a1a1a" : warn ? "#2a1f0a" : "#1e1e1e";
  return (
    <span style={{ background: bg, color, borderRadius: 4, padding: "2px 7px", fontSize: 11, fontWeight: 600 }}>
      {urgent ? "⚠ " : ""}{days}d exp
    </span>
  );
}

function ProgressBar({ value, max, color = "#22c55e" }: { value: number; max: number; color?: string }) {
  const pct = Math.min(100, (value / max) * 100);
  const done = pct >= 100;
  return (
    <div style={{ position: "relative", height: 6, background: "#1e1e1e", borderRadius: 3, overflow: "hidden", flex: 1 }}>
      <div style={{ position: "absolute", left: 0, top: 0, bottom: 0, width: `${pct}%`, background: done ? "#4ade80" : color, borderRadius: 3, transition: "width 0.4s ease" }} />
    </div>
  );
}

function SectionHeader({ icon, title, count, accent }: { icon: string; title: string; count?: number; accent?: string }) {
  return (
    <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 14 }}>
      <span style={{ fontSize: 18 }}>{icon}</span>
      <span style={{ fontFamily: "'DM Mono', monospace", fontSize: 12, fontWeight: 600, letterSpacing: "0.12em", color: accent || "#6b7280", textTransform: "uppercase" }}>{title}</span>
      {count !== undefined && (
        <span style={{ marginLeft: "auto", background: "#1e1e1e", color: "#6b7280", borderRadius: 4, padding: "2px 8px", fontSize: 11, fontWeight: 700 }}>{count}</span>
      )}
    </div>
  );
}

function Card({ children, style, alert }: { children: React.ReactNode; style?: React.CSSProperties; alert?: boolean }) {
  return (
    <div style={{ background: "#111", border: `1px solid ${alert ? "#7f1d1d" : "#1e1e1e"}`, borderRadius: 10, padding: "14px 16px", marginBottom: 10, boxShadow: alert ? "0 0 0 1px #3a1a1a" : "none", ...style }}>
      {children}
    </div>
  );
}

// ─── Panels ───────────────────────────────────────────────────────────────────

function ActiveWorkOrder({ wo, onConsume }: { wo: WorkOrder; onConsume?: (componentId: string, lotId: string) => void }) {
  const [open, setOpen] = useState(true);
  const total = wo.components.length;
  const done = wo.components.filter(c => c.consumed >= c.required).length;

  return (
    <section>
      <SectionHeader icon="⚙️" title="Active Work Order" accent="#60a5fa" />
      <Card style={{ borderColor: "#1a2a3a" }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: 10 }}>
          <div>
            <div style={{ fontFamily: "'DM Mono', monospace", fontSize: 11, color: "#3b82f6", letterSpacing: "0.1em", marginBottom: 3 }}>{wo.id}</div>
            <div style={{ fontSize: 14, fontWeight: 600, color: "#f1f5f9", lineHeight: 1.3 }}>{wo.title}</div>
          </div>
          {wo.scheduledEnd && (
            <div style={{ textAlign: "right", flexShrink: 0, marginLeft: 12 }}>
              <div style={{ fontSize: 11, color: "#6b7280" }}>Due in</div>
              <div style={{ fontSize: 15, fontWeight: 700, color: "#fbbf24" }}>{timeUntil(wo.scheduledEnd)}</div>
            </div>
          )}
        </div>

        <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 12 }}>
          <ProgressBar value={done} max={total} color="#3b82f6" />
          <span style={{ fontSize: 11, color: "#6b7280", whiteSpace: "nowrap", fontFamily: "'DM Mono', monospace" }}>{done}/{total}</span>
        </div>

        <button
          onClick={() => setOpen(o => !o)}
          style={{ background: "none", border: "none", color: "#6b7280", fontSize: 12, cursor: "pointer", padding: 0, marginBottom: open ? 10 : 0 }}
        >
          {open ? "▾ Hide components" : "▸ Show components"}
        </button>

        {open && wo.components.map(c => {
          const compDone = c.consumed >= c.required;
          const missing = !c.lotId;
          return (
            <div key={c.id} style={{ borderTop: "1px solid #1e1e1e", paddingTop: 10, marginTop: 10 }}>
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: 6 }}>
                <div>
                  <div style={{ fontSize: 13, fontWeight: 600, color: missing ? "#f87171" : "#e2e8f0" }}>{c.material}</div>
                  <div style={{ fontSize: 11, color: "#4b5563", fontFamily: "'DM Mono', monospace" }}>{c.matNum}</div>
                </div>
                <div style={{ textAlign: "right", flexShrink: 0 }}>
                  <div style={{ textAlign: "right" }}>
                    <span style={{ fontSize: 13, fontWeight: 700, color: compDone ? "#4ade80" : "#f1f5f9", fontFamily: "'DM Mono', monospace" }}>
                      {fmtQty(c.consumed)}<span style={{ color: "#4b5563" }}>/{fmtQty(c.required)} {c.uom}</span>
                    </span>
                    {(() => {
                      const r = fmtDual(c.required, c.uom);
                      return typeof r !== "string"
                        ? <div style={{ fontSize: 10, color: "#374151", fontFamily: "'DM Mono', monospace" }}>{r.secondary} total</div>
                        : null;
                    })()}
                  </div>
                </div>
              </div>
              <ProgressBar value={c.consumed} max={c.required} />
              <div style={{ marginTop: 6, display: "flex", gap: 6, flexWrap: "wrap", alignItems: "center" }}>
                {c.lotId && <span style={{ fontSize: 11, color: "#4b5563", fontFamily: "'DM Mono', monospace" }}>{c.lotNumber || c.lotId}</span>}
                {missing && <span style={{ fontSize: 11, color: "#f87171", fontWeight: 600 }}>⚠ No lot assigned</span>}
                {c.labResult && <StatusBadge labResult={c.labResult} />}
                {!compDone && c.lotId && onConsume && (
                  <button
                    onClick={() => onConsume(c.id, c.lotId!)}
                    style={{
                      marginLeft: "auto", background: "#1a2a3a", border: "1px solid #1e3a5f",
                      color: "#60a5fa", borderRadius: 6, padding: "4px 12px", fontSize: 11,
                      fontWeight: 700, cursor: "pointer", fontFamily: "'DM Sans', sans-serif",
                    }}
                  >
                    ⏲ Weigh &amp; Add
                  </button>
                )}
              </div>
            </div>
          );
        })}
      </Card>
    </section>
  );
}

function OnHand({ lots }: { lots: OnHandLot[] }) {
  const flagged = lots.filter(l => l.status === "QUARANTINED" || l.labResult === "FAIL");
  return (
    <section>
      <SectionHeader icon="📦" title="On Hand" count={lots.length} accent="#a3e635" />
      {flagged.length > 0 && (
        <div style={{ background: "#2d1010", border: "1px solid #7f1d1d", borderRadius: 8, padding: "10px 14px", marginBottom: 10, fontSize: 13, color: "#fca5a5", fontWeight: 600 }}>
          ⚠ {flagged.length} lot{flagged.length > 1 ? "s" : ""} flagged — check before use
        </div>
      )}
      {lots.map(l => {
        const alert = l.status === "QUARANTINED" || l.labResult === "FAIL";
        return (
          <Card key={l.id} alert={alert}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: 8 }}>
              <div>
                <div style={{ fontSize: 13, fontWeight: 600, color: alert ? "#fca5a5" : "#e2e8f0", marginBottom: 2 }}>{l.material}</div>
                <div style={{ fontSize: 11, color: "#4b5563", fontFamily: "'DM Mono', monospace" }}>{l.matNum} · {l.lotNumber}</div>
              </div>
              <div style={{ textAlign: "right", flexShrink: 0, marginLeft: 12 }}>
                <QtyDisplay quantity={l.quantity} uom={l.uom} />
              </div>
            </div>
            <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
              <StatusBadge status={l.status} labResult={l.labResult} />
              {l.expiresAt && <ExpiryChip dateStr={l.expiresAt} />}
            </div>
          </Card>
        );
      })}
    </section>
  );
}

function Inbound({ transfers }: { transfers: InboundTransfer[] }) {
  return (
    <section>
      <SectionHeader icon="🚚" title="Inbound" count={transfers.length} accent="#c084fc" />
      {transfers.length === 0 && (
        <div style={{ color: "#4b5563", fontSize: 13, padding: "10px 0" }}>No inbound transfers</div>
      )}
      {transfers.map(t => (
        <Card key={t.id}>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start" }}>
            <div>
              <div style={{ fontSize: 13, fontWeight: 600, color: "#e2e8f0", marginBottom: 2 }}>{t.material}</div>
              <div style={{ fontSize: 11, color: "#4b5563", fontFamily: "'DM Mono', monospace" }}>{t.matNum} · {t.lotNumber}</div>
              <div style={{ fontSize: 11, color: "#6b7280", marginTop: 4 }}>From <span style={{ color: "#9ca3af" }}>{t.fromStation}</span></div>
            </div>
            <div style={{ textAlign: "right", flexShrink: 0, marginLeft: 12 }}>
              <QtyDisplay quantity={t.quantity} uom={t.uom} />
              <div style={{ marginTop: 4, fontSize: 11, color: "#c084fc", fontWeight: 600 }}>{t.eta}</div>
            </div>
          </div>
        </Card>
      ))}
    </section>
  );
}

// ─── Nav ──────────────────────────────────────────────────────────────────────

const TABS = [
  { id: "work-order", label: "Work Order", icon: "⚙️" },
  { id: "on-hand",    label: "On Hand",    icon: "📦" },
  { id: "inbound",    label: "Inbound",    icon: "🚚" },
];

// ─── Main ─────────────────────────────────────────────────────────────────────

export default function StationDashboard() {
  // Work center from URL param or default
  const params = new URLSearchParams(window.location.search);
  const workCenterCode = params.get("wc") || "MIX-01";

  const [tab, setTab] = useState("work-order");
  const [lastSync, setLastSync] = useState(new Date());
  const [syncing, setSyncing] = useState(false);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Live data from API
  const [workOrder, setWorkOrder] = useState<WorkOrder | null>(null);
  const [lots, setLots] = useState<OnHandLot[]>([]);
  const [transfers, setTransfers] = useState<InboundTransfer[]>([]);
  const [toast, setToast] = useState<{ msg: string; type: "success" | "error" } | null>(null);

  // Fetch all station data
  const loadData = useCallback(async () => {
    try {
      setSyncing(true);
      setError(null);

      const [woRes, onHandRes, inboundRes] = await Promise.all([
        getStationWorkOrder(workCenterCode).catch(() => ({ workOrder: null })),
        getStationOnHand(workCenterCode).catch(() => ({ lots: [] as StationLot[] })),
        getStationInbound(workCenterCode).catch(() => ({ transfers: [] as StationTransfer[] })),
      ]);

      // Map API data to UI types
      if (woRes.workOrder) {
        setWorkOrder({
          ...woRes.workOrder,
          components: woRes.workOrder.components.map(c => ({
            ...c,
            matNum: c.materialNumber,
          })),
        });
      } else {
        setWorkOrder(null);
      }

      setLots(onHandRes.lots.map(l => ({
        ...l,
        matNum: l.materialNumber,
      })));

      setTransfers(inboundRes.transfers.map(t => ({
        ...t,
        matNum: t.materialNumber,
        eta: timeSince(t.movedAt),
      })));

      setLastSync(new Date());
    } catch (err: any) {
      setError(err?.message || "Failed to load station data");
    } finally {
      setSyncing(false);
      setLoading(false);
    }
  }, [workCenterCode]);

  // Initial load + auto-refresh every 30s
  useEffect(() => {
    loadData();
    const id = setInterval(loadData, 30000);
    return () => clearInterval(id);
  }, [loadData]);

  // Clear toast after 3s
  useEffect(() => {
    if (!toast) return;
    const id = setTimeout(() => setToast(null), 3000);
    return () => clearTimeout(id);
  }, [toast]);

  // Handle material consumption
  async function handleConsume(componentId: string, lotId: string) {
    if (!workOrder) return;
    const comp = workOrder.components.find(c => c.id === componentId);
    if (!comp) return;
    const remaining = comp.required - comp.consumed;
    const qty = Number(prompt(`Enter weight to add (${comp.uom}):\nRemaining: ${fmtQty(remaining)} ${comp.uom}`));
    if (!qty || qty <= 0) return;

    try {
      await consumeMaterial({
        workOrderId: workOrder.id,
        lotId,
        quantity: qty,
      });
      setToast({ msg: `✓ Added ${fmtQty(qty)} ${comp.uom} of ${comp.material}`, type: "success" });
      loadData(); // Refresh
    } catch (err: any) {
      setToast({ msg: err?.message || "Failed to consume material", type: "error" });
    }
  }

  // Handle production output recording
  async function handleProduce() {
    if (!workOrder) return;
    const qty = Number(prompt("Enter finished product weight:"));
    if (!qty || qty <= 0) return;
    const uom = prompt("Unit of measure (LB, KG, etc):") || "LB";

    try {
      await recordProduction({
        workOrderId: workOrder.id,
        quantity: qty,
        uom,
      });
      setToast({ msg: `✓ Recorded ${fmtQty(qty)} ${uom} production output`, type: "success" });
      loadData();
    } catch (err: any) {
      setToast({ msg: err?.message || "Failed to record production", type: "error" });
    }
  }

  const flagCount = lots.filter(l => l.status === "QUARANTINED" || l.labResult === "FAIL").length;
  const missingLots = workOrder?.components.filter(c => !c.lotId).length ?? 0;

  return (
    <div style={{ minHeight: "100vh", background: "#0a0a0a", color: "#f1f5f9", fontFamily: "'DM Sans', 'Segoe UI', sans-serif", display: "flex", flexDirection: "column", maxWidth: 600, margin: "0 auto" }}>
      {/* Google Fonts */}
      <style>{`
        @import url('https://fonts.googleapis.com/css2?family=DM+Sans:wght@400;600;700;800&family=DM+Mono:wght@400;500;600&display=swap');
        * { box-sizing: border-box; margin: 0; padding: 0; }
        body { background: #0a0a0a; }
        ::-webkit-scrollbar { width: 4px; }
        ::-webkit-scrollbar-track { background: #0a0a0a; }
        ::-webkit-scrollbar-thumb { background: #1e1e1e; border-radius: 2px; }
      `}</style>

      {/* Toast notification */}
      {toast && (
        <div style={{
          position: "fixed", top: 16, left: "50%", transform: "translateX(-50%)",
          background: toast.type === "success" ? "#1a3a2a" : "#3a1a1a",
          border: `1px solid ${toast.type === "success" ? "#166534" : "#7f1d1d"}`,
          color: toast.type === "success" ? "#4ade80" : "#fca5a5",
          borderRadius: 8, padding: "10px 20px", fontSize: 13, fontWeight: 600,
          zIndex: 1000, boxShadow: "0 4px 20px rgba(0,0,0,0.5)",
        }}>
          {toast.msg}
        </div>
      )}

      {/* Header */}
      <div style={{ background: "#0d0d0d", borderBottom: "1px solid #1a1a1a", padding: "12px 16px" }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start" }}>
          <div>
            <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 2 }}>
              <span style={{ fontFamily: "'DM Mono', monospace", fontSize: 11, color: "#3b82f6", letterSpacing: "0.15em", fontWeight: 600 }}>TiM</span>
              <span style={{ width: 1, height: 12, background: "#1e1e1e" }} />
              <span style={{ fontFamily: "'DM Mono', monospace", fontSize: 11, color: "#4b5563", letterSpacing: "0.1em" }}>{workCenterCode}</span>
            </div>
            <div style={{ fontSize: 16, fontWeight: 700, color: "#f1f5f9" }}>Station Dashboard</div>
          </div>
          <div style={{ textAlign: "right" }}>
            <button
              onClick={loadData}
              disabled={syncing}
              style={{ background: "#111", border: "1px solid #1e1e1e", borderRadius: 6, color: syncing ? "#4b5563" : "#6b7280", fontSize: 11, padding: "5px 10px", cursor: syncing ? "default" : "pointer", fontFamily: "'DM Mono', monospace", display: "block", marginLeft: "auto", marginBottom: 4 }}
            >
              {syncing ? "syncing…" : "↻ sync"}
            </button>
            <div style={{ fontSize: 10, color: "#374151", fontFamily: "'DM Mono', monospace" }}>
              {lastSync.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}
            </div>
          </div>
        </div>

        {/* Alert pills */}
        {(flagCount > 0 || missingLots > 0) && (
          <div style={{ display: "flex", gap: 6, marginTop: 10, flexWrap: "wrap" }}>
            {flagCount > 0 && (
              <span style={{ background: "#2d1010", border: "1px solid #7f1d1d", color: "#fca5a5", borderRadius: 6, padding: "3px 9px", fontSize: 11, fontWeight: 700 }}>
                ⚠ {flagCount} flagged lot{flagCount > 1 ? "s" : ""}
              </span>
            )}
            {missingLots > 0 && (
              <span style={{ background: "#2a1f0a", border: "1px solid #92400e", color: "#fbbf24", borderRadius: 6, padding: "3px 9px", fontSize: 11, fontWeight: 700 }}>
                ⚠ {missingLots} component{missingLots > 1 ? "s" : ""} unassigned
              </span>
            )}
          </div>
        )}

        {/* Error banner */}
        {error && (
          <div style={{ marginTop: 10, background: "#2d1010", border: "1px solid #7f1d1d", borderRadius: 8, padding: "8px 14px", fontSize: 12, color: "#fca5a5" }}>
            {error}
          </div>
        )}
      </div>

      {/* Tab bar */}
      <div style={{ display: "flex", borderBottom: "1px solid #1a1a1a", background: "#0d0d0d" }}>
        {TABS.map(t => {
          const active = tab === t.id;
          return (
            <button
              key={t.id}
              onClick={() => setTab(t.id)}
              style={{
                flex: 1, padding: "11px 0", background: "none", border: "none",
                borderBottom: active ? "2px solid #3b82f6" : "2px solid transparent",
                color: active ? "#60a5fa" : "#4b5563",
                fontSize: 12, fontWeight: active ? 700 : 500,
                cursor: "pointer", fontFamily: "'DM Sans', sans-serif",
                transition: "color 0.15s",
              }}
            >
              <span style={{ display: "block", fontSize: 16, marginBottom: 2 }}>{t.icon}</span>
              {t.label}
            </button>
          );
        })}
      </div>

      {/* Content */}
      <div style={{ flex: 1, padding: 16, overflowY: "auto" }}>
        {loading ? (
          <div style={{ textAlign: "center", padding: "3rem 0", color: "#4b5563" }}>
            <div style={{ fontSize: 28, marginBottom: 8 }}>⏳</div>
            <div style={{ fontSize: 13 }}>Loading station data…</div>
          </div>
        ) : (
          <>
            {tab === "work-order" && (
              workOrder ? (
                <>
                  <ActiveWorkOrder wo={workOrder} onConsume={handleConsume} />
                  {/* Record production button */}
                  <div style={{ marginTop: 16 }}>
                    <button
                      onClick={handleProduce}
                      style={{
                        width: "100%", padding: "14px 0", background: "#1a3a2a", border: "1px solid #166534",
                        borderRadius: 10, color: "#4ade80", fontSize: 14, fontWeight: 700, cursor: "pointer",
                        fontFamily: "'DM Sans', sans-serif", letterSpacing: "0.02em",
                      }}
                    >
                      ✓ Record Production Output
                    </button>
                  </div>
                </>
              ) : (
                <div style={{ textAlign: "center", padding: "3rem 0", color: "#4b5563" }}>
                  <div style={{ fontSize: 28, marginBottom: 8 }}>📋</div>
                  <div style={{ fontSize: 13 }}>No active work order at this station</div>
                </div>
              )
            )}
            {tab === "on-hand" && <OnHand lots={lots} />}
            {tab === "inbound" && <Inbound transfers={transfers} />}
          </>
        )}
      </div>

      {/* Footer */}
      <div style={{ borderTop: "1px solid #1a1a1a", padding: "8px 16px", background: "#0d0d0d", display: "flex", justifyContent: "space-between", alignItems: "center" }}>
        <span style={{ fontSize: 10, color: "#374151", fontFamily: "'DM Mono', monospace" }}>SAP · {workCenterCode} · TiM</span>
        <span style={{ fontSize: 10, color: error ? "#f87171" : "#1d4ed8", fontFamily: "'DM Mono', monospace" }}>{error ? "● OFFLINE" : "● ONLINE"}</span>
      </div>
    </div>
  );
}
