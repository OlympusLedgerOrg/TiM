import React, { useState, useEffect } from "react";

// ─── Mock Data ────────────────────────────────────────────────────────────────
const MOCK_OPERATOR = { name: "J. Morales", workCenter: "MIX-01", workCenterName: "Mixing Line 1" };

const MOCK_WORK_ORDER = {
  id: "WO-2026-0047",
  title: "EPDM Compound 70A — Batch Run",
  status: "IN_PROGRESS",
  scheduledEnd: "2026-04-12T18:00:00Z",
  components: [
    { id: "c1", material: "EPDM Base Rubber", matNum: "MAT-7823", required: 1102, consumed: 705, uom: "LB", lotId: "LOT-2024-011", labResult: "PASS" },
    { id: "c2", material: "Carbon Black N330", matNum: "MAT-1142", required: 165, consumed: 165, uom: "LB", lotId: "LOT-2024-018", labResult: "PASS" },
    { id: "c3", material: "Zinc Oxide", matNum: "MAT-0391", required: 27.5, consumed: 0, uom: "LB", lotId: null, labResult: null },
    { id: "c4", material: "Sulfur Cure Pkg", matNum: "MAT-2205", required: 8, consumed: 0, uom: "KG", lotId: "LOT-2024-022", labResult: "PENDING" },
  ],
};

const MOCK_ON_HAND = [
  { id: "l1", lotNumber: "LOT-2024-011", material: "EPDM Base Rubber", matNum: "MAT-7823", quantity: 397, uom: "LB", status: "ACTIVE", expiresAt: "2026-09-01", labResult: "PASS" },
  { id: "l2", lotNumber: "LOT-2024-018", material: "Carbon Black N330", matNum: "MAT-1142", quantity: 93.7, uom: "LB", status: "ACTIVE", expiresAt: "2027-01-15", labResult: "PASS" },
  { id: "l3", lotNumber: "LOT-2024-022", material: "Sulfur Cure Pkg", matNum: "MAT-2205", quantity: 8, uom: "KG", status: "ACTIVE", expiresAt: "2026-05-30", labResult: "PENDING" },
  { id: "l4", lotNumber: "LOT-2024-007", material: "Process Oil 10W", matNum: "MAT-0088", quantity: 15.85, uom: "GAL", status: "QUARANTINED", expiresAt: "2026-06-01", labResult: "FAIL" },
];

const MOCK_INBOUND = [
  { id: "t1", lotNumber: "LOT-2024-031", material: "Zinc Oxide", matNum: "MAT-0391", quantity: 55, uom: "LB", fromStation: "RECEIVING", eta: "~15 min", status: "IN_TRANSIT" },
  { id: "t2", lotNumber: "LOT-2024-033", material: "EPDM Base Rubber", matNum: "MAT-7823", quantity: 1102, uom: "LB", fromStation: "WAREHOUSE", eta: "~1 hr", status: "IN_TRANSIT" },
];

// ─── Types ────────────────────────────────────────────────────────────────────
type WorkOrderComponent = typeof MOCK_WORK_ORDER.components[number];
type WorkOrder = typeof MOCK_WORK_ORDER;
type OnHandLot = typeof MOCK_ON_HAND[number];
type InboundTransfer = typeof MOCK_INBOUND[number];

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

function ActiveWorkOrder({ wo }: { wo: WorkOrder }) {
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
          <div style={{ textAlign: "right", flexShrink: 0, marginLeft: 12 }}>
            <div style={{ fontSize: 11, color: "#6b7280" }}>Due in</div>
            <div style={{ fontSize: 15, fontWeight: 700, color: "#fbbf24" }}>{timeUntil(wo.scheduledEnd)}</div>
          </div>
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
              <div style={{ marginTop: 6, display: "flex", gap: 6, flexWrap: "wrap" }}>
                {c.lotId && <span style={{ fontSize: 11, color: "#4b5563", fontFamily: "'DM Mono', monospace" }}>{c.lotId}</span>}
                {missing && <span style={{ fontSize: 11, color: "#f87171", fontWeight: 600 }}>⚠ No lot assigned</span>}
                {c.labResult && <StatusBadge labResult={c.labResult} />}
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
              <ExpiryChip dateStr={l.expiresAt} />
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
  const [tab, setTab] = useState("work-order");
  const [lastSync, setLastSync] = useState(new Date());
  const [syncing, setSyncing] = useState(false);
  const op = MOCK_OPERATOR;

  // Simulated auto-refresh
  useEffect(() => {
    const id = setInterval(() => setLastSync(new Date()), 60000);
    return () => clearInterval(id);
  }, []);

  function handleSync() {
    setSyncing(true);
    setTimeout(() => { setSyncing(false); setLastSync(new Date()); }, 1200);
  }

  const flagCount = MOCK_ON_HAND.filter(l => l.status === "QUARANTINED" || l.labResult === "FAIL").length;
  const missingLots = MOCK_WORK_ORDER.components.filter(c => !c.lotId).length;

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

      {/* Header */}
      <div style={{ background: "#0d0d0d", borderBottom: "1px solid #1a1a1a", padding: "12px 16px" }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start" }}>
          <div>
            <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 2 }}>
              <span style={{ fontFamily: "'DM Mono', monospace", fontSize: 11, color: "#3b82f6", letterSpacing: "0.15em", fontWeight: 600 }}>TiM</span>
              <span style={{ width: 1, height: 12, background: "#1e1e1e" }} />
              <span style={{ fontFamily: "'DM Mono', monospace", fontSize: 11, color: "#4b5563", letterSpacing: "0.1em" }}>{op.workCenter}</span>
            </div>
            <div style={{ fontSize: 16, fontWeight: 700, color: "#f1f5f9" }}>{op.workCenterName}</div>
            <div style={{ fontSize: 12, color: "#4b5563", marginTop: 1 }}>{op.name}</div>
          </div>
          <div style={{ textAlign: "right" }}>
            <button
              onClick={handleSync}
              style={{ background: "#111", border: "1px solid #1e1e1e", borderRadius: 6, color: syncing ? "#4b5563" : "#6b7280", fontSize: 11, padding: "5px 10px", cursor: "pointer", fontFamily: "'DM Mono', monospace", display: "block", marginLeft: "auto", marginBottom: 4 }}
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
        {tab === "work-order" && <ActiveWorkOrder wo={MOCK_WORK_ORDER} />}
        {tab === "on-hand"    && <OnHand lots={MOCK_ON_HAND} />}
        {tab === "inbound"    && <Inbound transfers={MOCK_INBOUND} />}
      </div>

      {/* Footer */}
      <div style={{ borderTop: "1px solid #1a1a1a", padding: "8px 16px", background: "#0d0d0d", display: "flex", justifyContent: "space-between", alignItems: "center" }}>
        <span style={{ fontSize: 10, color: "#374151", fontFamily: "'DM Mono', monospace" }}>SAP · {op.workCenter} · PLANT-NC01</span>
        <span style={{ fontSize: 10, color: "#1d4ed8", fontFamily: "'DM Mono', monospace" }}>● ONLINE</span>
      </div>
    </div>
  );
}
