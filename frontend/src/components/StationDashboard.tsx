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
import {
  getEquipment,
  type EquipmentSummary,
} from "../services/equipmentService";
import { socketManager } from "../services/socketService";
import {
  isOnline,
  onConnectivityChange,
  cacheData,
  getCachedData,
  enqueueAction,
  flushQueue,
  getQueueSize,
  listenForSWSync,
} from "../services/offlineQueue";
import {
  alertMachineDown,
  alertMachineUp,
  alertSuccess,
  alertNotification,
  initAudio,
} from "../services/alertSounds";
import {
  requestWakeLock,
  releaseWakeLock,
  setupWakeLockReacquire,
  startAutoLogoutTimer,
} from "../services/kioskMode";
import BadgeLogin from "./BadgeLogin";
import ShiftBanner from "./ShiftBanner";
import EquipmentTiles from "./EquipmentTiles";
import DowntimeGrid from "./DowntimeGrid";
import ScanModal from "./ScanModal";

// ─── Types ────────────────────────────────────────────────────────────────────

// UI-layer types (extend API types with display fields)
type WorkOrderComponent = StationComponent & { matNum: string };
type WorkOrder = StationWorkOrder & { components: WorkOrderComponent[] };
type OnHandLot = StationLot & { matNum: string };
type InboundTransfer = StationTransfer & { matNum: string; movedAgo: string };

// Operator session
interface OperatorSession {
  id: string;
  shift: "FIRST" | "SECOND" | "THIRD";
}

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

// ─── Input Modal (touch-friendly for workers with gloves) ─────────────────────

function InputModal({ title, fields, onSubmit, onClose }: {
  title: string;
  fields: Array<{ label: string; key: string; type?: string; defaultValue?: string; placeholder?: string; step?: number }>;
  onSubmit: (values: Record<string, string>) => void;
  onClose: () => void;
}) {
  const [values, setValues] = useState<Record<string, string>>(() => {
    const init: Record<string, string> = {};
    fields.forEach(f => { init[f.key] = f.defaultValue || ""; });
    return init;
  });

  // Stepper buttons for numeric fields (glove-friendly +/- buttons)
  function adjustValue(key: string, delta: number, step: number) {
    setValues(v => {
      const current = Number(v[key]) || 0;
      const next = Math.max(0, +(current + delta * step).toFixed(2));
      return { ...v, [key]: next.toString() };
    });
  }

  return (
    <div style={{
      position: "fixed", inset: 0, background: "rgba(0,0,0,0.7)", zIndex: 1000,
      display: "flex", alignItems: "flex-end", justifyContent: "center",
    }} onClick={onClose}>
      <div
        onClick={e => e.stopPropagation()}
        style={{
          background: "#111", border: "1px solid #1e1e1e", borderRadius: "16px 16px 0 0",
          padding: "20px 16px 24px", width: "100%", maxWidth: 600,
        }}
      >
        <div style={{ fontSize: 15, fontWeight: 700, color: "#f1f5f9", marginBottom: 16 }}>{title}</div>
        {fields.map(f => {
          const isNumber = f.type === "number";
          const stepSize = f.step || (isNumber ? 1 : 0);
          return (
            <div key={f.key} style={{ marginBottom: 14 }}>
              <label style={{ display: "block", fontSize: 12, color: "#6b7280", marginBottom: 6, fontWeight: 600 }}>{f.label}</label>
              <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
                {/* Minus stepper button (glove mode) */}
                {isNumber && (
                  <button
                    onClick={() => adjustValue(f.key, -1, stepSize)}
                    style={{
                      width: 56, height: 56, background: "#1e1e1e", border: "1px solid #2a2a2a",
                      borderRadius: 10, color: "#f87171", fontSize: 24, fontWeight: 700,
                      cursor: "pointer", flexShrink: 0, display: "flex", alignItems: "center", justifyContent: "center",
                    }}
                  >
                    −
                  </button>
                )}
                <input
                  type={f.type || "text"}
                  inputMode={isNumber ? "decimal" : undefined}
                  placeholder={f.placeholder}
                  value={values[f.key]}
                  onChange={e => setValues(v => ({ ...v, [f.key]: e.target.value }))}
                  style={{
                    width: "100%", padding: "14px 16px", background: "#0a0a0a", border: "1px solid #1e1e1e",
                    borderRadius: 10, color: "#f1f5f9", fontSize: 18, fontWeight: 700,
                    fontFamily: "'DM Mono', monospace", outline: "none",
                    textAlign: isNumber ? "center" : "left",
                  }}
                  autoFocus={fields.indexOf(f) === 0}
                />
                {/* Plus stepper button (glove mode) */}
                {isNumber && (
                  <button
                    onClick={() => adjustValue(f.key, 1, stepSize)}
                    style={{
                      width: 56, height: 56, background: "#1a3a2a", border: "1px solid #166534",
                      borderRadius: 10, color: "#4ade80", fontSize: 24, fontWeight: 700,
                      cursor: "pointer", flexShrink: 0, display: "flex", alignItems: "center", justifyContent: "center",
                    }}
                  >
                    +
                  </button>
                )}
              </div>
            </div>
          );
        })}
        <div style={{ display: "flex", gap: 10, marginTop: 8 }}>
          <button
            onClick={onClose}
            style={{
              flex: 1, padding: "14px 0", background: "#1e1e1e", border: "none",
              borderRadius: 10, color: "#6b7280", fontSize: 14, fontWeight: 600, cursor: "pointer",
              minHeight: 48,
            }}
          >
            Cancel
          </button>
          <button
            onClick={() => onSubmit(values)}
            style={{
              flex: 2, padding: "14px 0", background: "#1a3a2a", border: "1px solid #166534",
              borderRadius: 10, color: "#4ade80", fontSize: 14, fontWeight: 700, cursor: "pointer",
              minHeight: 48,
            }}
          >
            Confirm
          </button>
        </div>
      </div>
    </div>
  );
}

// ─── Panels ───────────────────────────────────────────────────────────────────

function ActiveWorkOrder({ wo, onConsume, onScanLot }: {
  wo: WorkOrder;
  onConsume?: (componentId: string, lotId: string) => void;
  onScanLot?: () => void;
}) {
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

        {/* Action row: toggle + scan */}
        <div style={{ display: "flex", gap: 8, alignItems: "center", marginBottom: open ? 10 : 0 }}>
          <button
            onClick={() => setOpen(o => !o)}
            style={{ background: "none", border: "none", color: "#6b7280", fontSize: 12, cursor: "pointer", padding: 0 }}
          >
            {open ? "▾ Hide components" : "▸ Show components"}
          </button>
          {onScanLot && (
            <button
              onClick={onScanLot}
              style={{
                marginLeft: "auto", background: "#1a2a3a", border: "1px solid #1e3a5f",
                color: "#60a5fa", borderRadius: 8, padding: "6px 14px", fontSize: 12,
                fontWeight: 700, cursor: "pointer", minHeight: 36,
              }}
            >
              📷 Scan Lot
            </button>
          )}
        </div>

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
              <div style={{ marginTop: 4, fontSize: 11, color: "#c084fc", fontWeight: 600 }}>{t.movedAgo}</div>
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
  { id: "equipment",  label: "Equipment",  icon: "🏭" },
  { id: "on-hand",    label: "On Hand",    icon: "📦" },
  { id: "inbound",    label: "Inbound",    icon: "🚚" },
];

// ─── Main ─────────────────────────────────────────────────────────────────────

export default function StationDashboard() {
  // Work center from URL param or default
  const params = new URLSearchParams(window.location.search);
  const workCenterCode = params.get("wc") || "MIX-01";

  // ─── Auth: Badge scan login ───────────────────────────────────────────
  const [operator, setOperator] = useState<OperatorSession | null>(() => {
    // Restore session from localStorage
    try {
      const raw = localStorage.getItem("tim_operator");
      return raw ? JSON.parse(raw) : null;
    } catch { return null; }
  });

  function handleLogin(op: { id: string; shift: "FIRST" | "SECOND" | "THIRD" }) {
    const session: OperatorSession = { id: op.id, shift: op.shift };
    setOperator(session);
    localStorage.setItem("tim_operator", JSON.stringify(session));
    // Initialize audio context on first user interaction
    initAudio();
  }

  const handleLogout = useCallback(() => {
    setOperator(null);
    localStorage.removeItem("tim_operator");
  }, []);

  // Show badge login if not authenticated
  if (!operator) {
    return <BadgeLogin workCenterCode={workCenterCode} onLogin={handleLogin} />;
  }

  return (
    <StationDashboardInner
      workCenterCode={workCenterCode}
      operator={operator}
      onLogout={handleLogout}
    />
  );
}

// ─── Inner Dashboard (after login) ────────────────────────────────────────────

function StationDashboardInner({ workCenterCode, operator, onLogout }: {
  workCenterCode: string;
  operator: OperatorSession;
  onLogout: () => void;
}) {
  const [tab, setTab] = useState("work-order");
  const [lastSync, setLastSync] = useState(new Date());
  const [syncing, setSyncing] = useState(false);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [online, setOnline] = useState(isOnline());

  // Live data from API
  const [workOrder, setWorkOrder] = useState<WorkOrder | null>(null);
  const [lots, setLots] = useState<OnHandLot[]>([]);
  const [transfers, setTransfers] = useState<InboundTransfer[]>([]);
  const [equipment, setEquipment] = useState<EquipmentSummary[]>([]);
  const [selectedEquipment, setSelectedEquipment] = useState<string | undefined>();
  const [toast, setToast] = useState<{ msg: string; type: "success" | "error" } | null>(null);
  const [modal, setModal] = useState<{
    type: "consume" | "produce";
    componentId?: string;
    lotId?: string;
    material?: string;
    remaining?: number;
    uom?: string;
  } | null>(null);
  const [showScanModal, setShowScanModal] = useState(false);
  const queueSize = getQueueSize();

  // ─── Online/Offline detection ─────────────────────────────────────────
  useEffect(() => {
    return onConnectivityChange(setOnline);
  }, []);

  // ─── Kiosk: Wake Lock (prevent screen dimming on tablets) ─────────────
  useEffect(() => {
    requestWakeLock();
    const cleanupReacquire = setupWakeLockReacquire();
    return () => {
      releaseWakeLock();
      cleanupReacquire();
    };
  }, []);

  // ─── Kiosk: Auto-logout at shift end ──────────────────────────────────
  useEffect(() => {
    return startAutoLogoutTimer(operator.shift, onLogout);
  }, [operator.shift, onLogout]);

  // ─── SW Background Sync: flush offline queue on connectivity restore ──
  useEffect(() => {
    return listenForSWSync(
      async (action) => {
        if (action.type === "consume") {
          const p = action.payload as { workOrderId: string; lotId: string; quantity: number; operatorId?: string };
          await consumeMaterial(p);
        } else {
          const p = action.payload as { workOrderId: string; quantity: number; uom: string; operatorId?: string };
          await recordProduction(p);
        }
      },
      (count) => {
        showToast(`✓ Synced ${count} offline action${count > 1 ? "s" : ""}`, "success");
        loadData();
      },
    );
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // ─── Socket.IO real-time events ───────────────────────────────────────
  useEffect(() => {
    // Connect to event bus
    socketManager.connect("default");

    const handleEquipmentChange = (evt: any) => {
      setEquipment(prev => prev.map(eq =>
        eq.id === evt.equipmentId
          ? { ...eq, status: evt.status, statusSince: evt.statusSince }
          : eq
      ));
      // Sound/vibration alerts
      if (evt.status === "DOWN") {
        alertMachineDown();
        showToast(`⬇ ${evt.code} went DOWN`, "error");
      } else if (evt.previousStatus === "DOWN") {
        alertMachineUp();
        showToast(`✓ ${evt.code} back up`, "success");
      }
    };

    const handleDowntimeAlert = (evt: any) => {
      showToast(`⚠ ${evt.equipmentCode} — ${evt.reasonCode}`, "error");
      alertMachineDown();
      // Refresh equipment data
      loadEquipment();
    };

    const handleDowntimeResolved = (evt: any) => {
      const mins = evt.durationMin ? Math.round(evt.durationMin) : 0;
      showToast(`✓ ${evt.equipmentCode} back up after ${mins}m`, "success");
      alertMachineUp();
      loadEquipment();
    };

    const handleQueueUpdated = () => {
      // Auto-refresh work order and on-hand data
      alertNotification();
      loadData();
    };

    socketManager.on("equipmentStateChanged", handleEquipmentChange);
    socketManager.on("downtimeAlert", handleDowntimeAlert);
    socketManager.on("downtimeResolved", handleDowntimeResolved);
    socketManager.on("queueUpdated", handleQueueUpdated);

    return () => {
      socketManager.off("equipmentStateChanged", handleEquipmentChange);
      socketManager.off("downtimeAlert", handleDowntimeAlert);
      socketManager.off("downtimeResolved", handleDowntimeResolved);
      socketManager.off("queueUpdated", handleQueueUpdated);
      socketManager.disconnect();
    };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  function showToast(msg: string, type: "success" | "error") {
    setToast({ msg, type });
  }

  // Clear toast after 3s
  useEffect(() => {
    if (!toast) return;
    const id = setTimeout(() => setToast(null), 3000);
    return () => clearTimeout(id);
  }, [toast]);

  // ─── Data loading ─────────────────────────────────────────────────────
  const loadEquipment = useCallback(async () => {
    try {
      const eqRes = await getEquipment(workCenterCode);
      setEquipment(eqRes.equipment);
      cacheData(`equipment_${workCenterCode}`, eqRes.equipment);
    } catch {
      // Use cache if available
      const cached = getCachedData<EquipmentSummary[]>(`equipment_${workCenterCode}`);
      if (cached) setEquipment(cached.data);
    }
  }, [workCenterCode]);

  const loadData = useCallback(async () => {
    try {
      setSyncing(true);
      setError(null);
      const warnings: string[] = [];

      const [woRes, onHandRes, inboundRes] = await Promise.all([
        getStationWorkOrder(workCenterCode).catch(e => { warnings.push(`Work order: ${e.message}`); return { workOrder: null }; }),
        getStationOnHand(workCenterCode).catch(e => { warnings.push(`On-hand: ${e.message}`); return { lots: [] as StationLot[] }; }),
        getStationInbound(workCenterCode).catch(e => { warnings.push(`Inbound: ${e.message}`); return { transfers: [] as StationTransfer[] }; }),
      ]);

      // Map API data to UI types
      if (woRes.workOrder) {
        const woData: WorkOrder = {
          ...woRes.workOrder,
          components: woRes.workOrder.components.map(c => ({
            ...c,
            matNum: c.materialNumber,
          })),
        };
        setWorkOrder(woData);
        cacheData(`workorder_${workCenterCode}`, woData);
      } else {
        setWorkOrder(null);
      }

      const lotsData = onHandRes.lots.map(l => ({
        ...l,
        matNum: l.materialNumber,
      }));
      setLots(lotsData);
      cacheData(`lots_${workCenterCode}`, lotsData);

      setTransfers(inboundRes.transfers.map(t => ({
        ...t,
        matNum: t.materialNumber,
        movedAgo: timeSince(t.movedAt),
      })));

      setLastSync(new Date());
      if (warnings.length > 0) {
        setError(`Partial data: ${warnings.join('; ')}`);
      }

      // Flush offline queue if back online
      if (isOnline() && getQueueSize() > 0) {
        const synced = await flushQueue(async (action) => {
          if (action.type === "consume") {
            const p = action.payload as { workOrderId: string; lotId: string; quantity: number; operatorId?: string };
            await consumeMaterial(p);
          } else {
            const p = action.payload as { workOrderId: string; quantity: number; uom: string; operatorId?: string };
            await recordProduction(p);
          }
        });
        if (synced > 0) {
          showToast(`✓ Synced ${synced} offline action${synced > 1 ? "s" : ""}`, "success");
        }
      }
    } catch (err: any) {
      // Try to load from cache when offline
      if (!isOnline()) {
        const cachedWo = getCachedData<WorkOrder>(`workorder_${workCenterCode}`);
        const cachedLots = getCachedData<OnHandLot[]>(`lots_${workCenterCode}`);
        if (cachedWo) setWorkOrder(cachedWo.data);
        if (cachedLots) setLots(cachedLots.data);
        setError("Offline — showing cached data");
      } else {
        setError(err?.message || "Failed to load station data");
      }
    } finally {
      setSyncing(false);
      setLoading(false);
    }
  }, [workCenterCode]);

  // Initial load + auto-refresh every 30s
  useEffect(() => {
    loadData();
    loadEquipment();
    const id = setInterval(() => {
      loadData();
      loadEquipment();
    }, 30000);
    return () => clearInterval(id);
  }, [loadData, loadEquipment]);

  // ─── Handlers ─────────────────────────────────────────────────────────

  function handleConsume(componentId: string, lotId: string) {
    if (!workOrder) return;
    const comp = workOrder.components.find(c => c.id === componentId);
    if (!comp) return;
    setModal({
      type: "consume",
      componentId,
      lotId,
      material: comp.material,
      remaining: comp.required - comp.consumed,
      uom: comp.uom,
    });
  }

  async function submitConsume(values: Record<string, string>) {
    if (!workOrder || !modal || modal.type !== "consume") return;
    const qty = Number(values.quantity);
    if (!qty || qty <= 0) { setModal(null); return; }

    const payload = {
      workOrderId: workOrder.id,
      lotId: modal.lotId!,
      quantity: qty,
      operatorId: operator.id,
    };

    try {
      if (isOnline()) {
        await consumeMaterial(payload);
      } else {
        enqueueAction("consume", payload);
      }
      alertSuccess();
      showToast(`✓ Added ${fmtQty(qty)} ${modal.uom} of ${modal.material}`, "success");
      setModal(null);
      loadData();
    } catch (err: any) {
      // Queue offline if network error
      if (!isOnline()) {
        enqueueAction("consume", payload);
        showToast(`📋 Queued offline — will sync when back`, "success");
      } else {
        showToast(err?.message || "Failed to consume material", "error");
      }
      setModal(null);
    }
  }

  function handleProduce() {
    if (!workOrder) return;
    setModal({ type: "produce", uom: workOrder.components[0]?.uom || "LB" });
  }

  async function submitProduce(values: Record<string, string>) {
    if (!workOrder) return;
    const qty = Number(values.quantity);
    const uom = values.uom || "LB";
    if (!qty || qty <= 0) { setModal(null); return; }

    const payload = {
      workOrderId: workOrder.id,
      quantity: qty,
      uom,
      operatorId: operator.id,
    };

    try {
      if (isOnline()) {
        await recordProduction(payload);
      } else {
        enqueueAction("produce", payload);
      }
      alertSuccess();
      showToast(`✓ Recorded ${fmtQty(qty)} ${uom} production output`, "success");
      setModal(null);
      loadData();
    } catch (err: any) {
      if (!isOnline()) {
        enqueueAction("produce", payload);
        showToast(`📋 Queued offline — will sync when back`, "success");
      } else {
        showToast(err?.message || "Failed to record production", "error");
      }
      setModal(null);
    }
  }

  function handleScanLot(lotValue: string) {
    setShowScanModal(false);
    if (!workOrder) return;

    // Find a matching lot in on-hand inventory by lot number or ID
    const matchedLot = lots.find(
      l => l.lotNumber === lotValue || l.id === lotValue,
    );

    if (matchedLot) {
      // Find the component that needs this material
      const comp = workOrder.components.find(
        c => c.materialNumber === matchedLot.materialNumber && c.consumed < c.required,
      );
      if (comp) {
        setModal({
          type: "consume",
          componentId: comp.id,
          lotId: matchedLot.id,
          material: comp.material,
          remaining: comp.required - comp.consumed,
          uom: comp.uom,
        });
        return;
      }
    }

    // Fallback: show toast indicating lot not found
    showToast(`Lot "${lotValue}" not found in on-hand inventory`, "error");
  }

  function handleEquipmentRefresh() {
    loadEquipment();
    loadData();
  }

  const flagCount = lots.filter(l => l.status === "QUARANTINED" || l.labResult === "FAIL").length;
  const missingLots = workOrder?.components.filter(c => !c.lotId).length ?? 0;
  const downCount = equipment.filter(e => e.status === "DOWN").length;
  const selectedEq = equipment.find(e => e.id === selectedEquipment) || null;

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
          zIndex: 1100, boxShadow: "0 4px 20px rgba(0,0,0,0.5)",
          maxWidth: "90vw",
        }}>
          {toast.msg}
        </div>
      )}

      {/* Offline banner */}
      {!online && (
        <div style={{
          background: "#92400e", padding: "8px 16px", textAlign: "center",
          fontSize: 13, fontWeight: 700, color: "#fef3c7",
          display: "flex", alignItems: "center", justifyContent: "center", gap: 8,
        }}>
          <span style={{ fontSize: 16 }}>⚡</span>
          OFFLINE — actions will sync when back
          {queueSize > 0 && (
            <span style={{ background: "#78350f", borderRadius: 4, padding: "2px 8px", fontSize: 11 }}>
              {queueSize} queued
            </span>
          )}
        </div>
      )}

      {/* Shift banner */}
      <ShiftBanner
        operatorId={operator.id}
        shift={operator.shift}
        workCenterCode={workCenterCode}
        onLogout={onLogout}
      />

      {/* Header */}
      <div style={{ background: "#0d0d0d", borderBottom: "1px solid #1a1a1a", padding: "10px 16px" }}>
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
              onClick={() => { loadData(); loadEquipment(); }}
              disabled={syncing}
              style={{ background: "#111", border: "1px solid #1e1e1e", borderRadius: 6, color: syncing ? "#4b5563" : "#6b7280", fontSize: 11, padding: "5px 10px", cursor: syncing ? "default" : "pointer", fontFamily: "'DM Mono', monospace", display: "block", marginLeft: "auto", marginBottom: 4, minHeight: 28 }}
            >
              {syncing ? "syncing…" : "↻ sync"}
            </button>
            <div style={{ fontSize: 10, color: "#374151", fontFamily: "'DM Mono', monospace" }}>
              {lastSync.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}
            </div>
          </div>
        </div>

        {/* Alert pills */}
        {(flagCount > 0 || missingLots > 0 || downCount > 0) && (
          <div style={{ display: "flex", gap: 6, marginTop: 8, flexWrap: "wrap" }}>
            {downCount > 0 && (
              <span style={{ background: "#2d1010", border: "1px solid #7f1d1d", color: "#fca5a5", borderRadius: 6, padding: "3px 9px", fontSize: 11, fontWeight: 700 }}>
                🔴 {downCount} machine{downCount > 1 ? "s" : ""} down
              </span>
            )}
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
          <div style={{ marginTop: 8, background: "#2d1010", border: "1px solid #7f1d1d", borderRadius: 8, padding: "8px 14px", fontSize: 12, color: "#fca5a5" }}>
            {error}
          </div>
        )}
      </div>

      {/* Tab bar — bigger touch targets */}
      <div style={{ display: "flex", borderBottom: "1px solid #1a1a1a", background: "#0d0d0d" }}>
        {TABS.map(t => {
          const active = tab === t.id;
          const badge = t.id === "equipment" && downCount > 0;
          return (
            <button
              key={t.id}
              onClick={() => setTab(t.id)}
              style={{
                flex: 1, padding: "12px 0", background: "none", border: "none",
                borderBottom: active ? "2px solid #3b82f6" : "2px solid transparent",
                color: active ? "#60a5fa" : "#4b5563",
                fontSize: 11, fontWeight: active ? 700 : 500,
                cursor: "pointer", fontFamily: "'DM Sans', sans-serif",
                transition: "color 0.15s", position: "relative",
                minHeight: 52,
              }}
            >
              <span style={{ display: "block", fontSize: 18, marginBottom: 2 }}>{t.icon}</span>
              {t.label}
              {badge && (
                <span style={{
                  position: "absolute", top: 6, right: "50%", transform: "translateX(14px)",
                  width: 8, height: 8, borderRadius: "50%", background: "#ef4444",
                }} />
              )}
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
                  <ActiveWorkOrder
                    wo={workOrder}
                    onConsume={handleConsume}
                    onScanLot={() => setShowScanModal(true)}
                  />
                  {/* Record production button */}
                  <div style={{ marginTop: 16 }}>
                    <button
                      onClick={handleProduce}
                      style={{
                        width: "100%", padding: "16px 0", background: "#1a3a2a", border: "2px solid #166534",
                        borderRadius: 12, color: "#4ade80", fontSize: 15, fontWeight: 700, cursor: "pointer",
                        fontFamily: "'DM Sans', sans-serif", letterSpacing: "0.02em",
                        minHeight: 56,
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

            {tab === "equipment" && (
              <>
                <SectionHeader icon="🏭" title="Equipment Status" accent="#60a5fa" />
                <EquipmentTiles
                  equipment={equipment}
                  selectedId={selectedEquipment}
                  onSelect={eq => setSelectedEquipment(eq.id === selectedEquipment ? undefined : eq.id)}
                />
                {selectedEquipment && (
                  <div style={{ marginTop: 16 }}>
                    <DowntimeGrid
                      equipment={selectedEq}
                      onDowntimeLogged={handleEquipmentRefresh}
                      onToast={showToast}
                    />
                  </div>
                )}
              </>
            )}

            {tab === "on-hand" && <OnHand lots={lots} />}
            {tab === "inbound" && <Inbound transfers={transfers} />}
          </>
        )}
      </div>

      {/* Footer */}
      <div style={{ borderTop: "1px solid #1a1a1a", padding: "8px 16px", background: "#0d0d0d", display: "flex", justifyContent: "space-between", alignItems: "center" }}>
        <span style={{ fontSize: 10, color: "#374151", fontFamily: "'DM Mono', monospace" }}>{workCenterCode} · TiM</span>
        <span style={{ fontSize: 10, color: online ? "#1d4ed8" : "#f87171", fontFamily: "'DM Mono', monospace" }}>
          {online ? "● ONLINE" : "● OFFLINE"}
          {queueSize > 0 && ` · ${queueSize} queued`}
        </span>
      </div>

      {/* Touch-friendly input modals */}
      {modal?.type === "consume" && (
        <InputModal
          title={`Weigh & Add — ${modal.material}`}
          fields={[
            {
              label: `Weight (${modal.uom}) — ${fmtQty(modal.remaining || 0)} ${modal.uom} remaining`,
              key: "quantity",
              type: "number",
              placeholder: `Enter ${modal.uom}`,
              step: 0.5,
            },
          ]}
          onSubmit={submitConsume}
          onClose={() => setModal(null)}
        />
      )}
      {modal?.type === "produce" && (
        <InputModal
          title="Record Production Output"
          fields={[
            { label: "Finished product weight", key: "quantity", type: "number", placeholder: "Enter weight", step: 1 },
            { label: "Unit of measure", key: "uom", defaultValue: modal.uom || "LB", placeholder: "LB, KG, etc" },
          ]}
          onSubmit={submitProduce}
          onClose={() => setModal(null)}
        />
      )}

      {/* Barcode scan modal */}
      {showScanModal && (
        <ScanModal
          title="Scan Lot Barcode"
          onScan={handleScanLot}
          onClose={() => setShowScanModal(false)}
        />
      )}
    </div>
  );
}
