import React, { useState } from "react";
import { logDowntime, closeDowntime, type EquipmentSummary, type DowntimeCategoryValue } from "../services/equipmentService";

/**
 * DowntimeGrid — One-tap downtime reporting for floor workers
 *
 * Instead of dropdowns and text fields, workers see large colored buttons
 * for the most common downtime reasons. One tap = machine is down with
 * that reason. Workers wear gloves — buttons must be 60px+ tall.
 *
 * Reason buttons are grouped by urgency color:
 *  🔴 Red = Breakdowns (UNPLANNED)
 *  🟡 Yellow = Waiting (MATERIAL_WAIT, QUALITY_HOLD)
 *  🔵 Blue = Planned (CHANGEOVER, MAINTENANCE, PLANNED)
 */

// Standard downtime reasons — these map to the backend's reasonCode field
const DOWNTIME_REASONS: Array<{
  label: string;
  reasonCode: string;
  category: DowntimeCategoryValue;
  color: string;
  bg: string;
  border: string;
  icon: string;
}> = [
  { label: "Breakdown", reasonCode: "BREAKDOWN", category: "UNPLANNED", color: "#f87171", bg: "#2d1010", border: "#7f1d1d", icon: "🔴" },
  { label: "Hydraulic", reasonCode: "BREAKDOWN-HYDRAULIC", category: "UNPLANNED", color: "#f87171", bg: "#2d1010", border: "#7f1d1d", icon: "💧" },
  { label: "Electrical", reasonCode: "BREAKDOWN-ELECTRICAL", category: "UNPLANNED", color: "#f87171", bg: "#2d1010", border: "#7f1d1d", icon: "⚡" },
  { label: "Material Wait", reasonCode: "MAT-WAIT", category: "MATERIAL_WAIT", color: "#fbbf24", bg: "#2a1f0a", border: "#92400e", icon: "📦" },
  { label: "Quality Hold", reasonCode: "QUALITY-HOLD", category: "QUALITY_HOLD", color: "#fbbf24", bg: "#2a1f0a", border: "#92400e", icon: "🧪" },
  { label: "Mold Change", reasonCode: "MOLD-CHANGE", category: "CHANGEOVER", color: "#60a5fa", bg: "#1a2a3a", border: "#1e3a5f", icon: "🔧" },
  { label: "Maintenance", reasonCode: "SCHEDULED-MAINT", category: "MAINTENANCE", color: "#60a5fa", bg: "#1a2a3a", border: "#1e3a5f", icon: "🛠️" },
  { label: "Setup", reasonCode: "SETUP", category: "PLANNED", color: "#60a5fa", bg: "#1a2a3a", border: "#1e3a5f", icon: "⚙️" },
];

interface DowntimeGridProps {
  equipment: EquipmentSummary | null;
  onDowntimeLogged: () => void;
  onToast: (msg: string, type: "success" | "error") => void;
}

export default function DowntimeGrid({ equipment, onDowntimeLogged, onToast }: DowntimeGridProps) {
  const [loading, setLoading] = useState<string | null>(null);
  const [showNoteFor, setShowNoteFor] = useState<string | null>(null);
  const [noteText, setNoteText] = useState("");

  if (!equipment) {
    return (
      <div style={{ textAlign: "center", padding: "2rem 0", color: "#4b5563" }}>
        <div style={{ fontSize: 24, marginBottom: 8 }}>🏭</div>
        <div style={{ fontSize: 13 }}>Select equipment to report downtime</div>
      </div>
    );
  }

  // If equipment is already down, show "Machine Back Up" button
  if (equipment.currentDowntime) {
    const dt = equipment.currentDowntime;
    const mins = Math.round(dt.durationMin);
    return (
      <div>
        <div style={{
          background: "#2d1010", border: "1px solid #7f1d1d", borderRadius: 12,
          padding: "16px", marginBottom: 12, textAlign: "center",
        }}>
          <div style={{ fontSize: 11, color: "#fca5a5", fontWeight: 600, marginBottom: 4, letterSpacing: "0.1em", textTransform: "uppercase" }}>
            Machine Down — {dt.reasonCode}
          </div>
          <div style={{ fontSize: 28, fontWeight: 800, color: "#f87171", fontFamily: "'DM Mono', monospace" }}>
            {mins} min
          </div>
          {dt.reasonText && (
            <div style={{ fontSize: 12, color: "#9ca3af", marginTop: 6 }}>{dt.reasonText}</div>
          )}
        </div>
        <button
          onClick={async () => {
            setLoading("resolve");
            try {
              await closeDowntime(dt.id);
              onToast(`✓ ${equipment.code} back up after ${mins} min`, "success");
              onDowntimeLogged();
            } catch (err: any) {
              onToast(err?.message || "Failed to close downtime", "error");
            } finally {
              setLoading(null);
            }
          }}
          disabled={loading === "resolve"}
          style={{
            width: "100%", padding: "18px 0", background: "#1a3a2a", border: "2px solid #166534",
            borderRadius: 12, color: "#4ade80", fontSize: 16, fontWeight: 700, cursor: "pointer",
            minHeight: 60, opacity: loading === "resolve" ? 0.6 : 1,
          }}
        >
          {loading === "resolve" ? "Starting up…" : "✓ Machine Back Up"}
        </button>
      </div>
    );
  }

  async function reportDowntime(reason: typeof DOWNTIME_REASONS[0]) {
    if (!equipment) return;
    setLoading(reason.reasonCode);

    try {
      await logDowntime(equipment.id, {
        category: reason.category,
        reasonCode: reason.reasonCode,
        reasonText: showNoteFor === reason.reasonCode ? noteText.trim() || undefined : undefined,
      });

      // Haptic feedback
      if (navigator.vibrate) navigator.vibrate(100);

      onToast(`⬇ ${equipment.code} marked DOWN — ${reason.label}`, "success");
      setShowNoteFor(null);
      setNoteText("");
      onDowntimeLogged();
    } catch (err: any) {
      onToast(err?.message || "Failed to log downtime", "error");
    } finally {
      setLoading(null);
    }
  }

  return (
    <div>
      <div style={{
        fontSize: 11, color: "#6b7280", fontWeight: 600, letterSpacing: "0.1em",
        textTransform: "uppercase", marginBottom: 12, fontFamily: "'DM Mono', monospace",
      }}>
        ⚠ Report Downtime — {equipment.code}
      </div>

      {/* Note input (optional — shown when long-pressing a reason) */}
      {showNoteFor && (
        <div style={{
          background: "#111", border: "1px solid #1e1e1e", borderRadius: 10,
          padding: "12px", marginBottom: 12,
        }}>
          <input
            type="text"
            value={noteText}
            onChange={e => setNoteText(e.target.value)}
            placeholder="Add note (optional)…"
            style={{
              width: "100%", padding: "10px 12px", background: "#0a0a0a", border: "1px solid #1e1e1e",
              borderRadius: 8, color: "#f1f5f9", fontSize: 14, outline: "none",
            }}
          />
        </div>
      )}

      {/* Reason buttons — 2 columns, big touch targets */}
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10 }}>
        {DOWNTIME_REASONS.map(reason => (
          <button
            key={reason.reasonCode}
            onClick={() => reportDowntime(reason)}
            onContextMenu={e => {
              e.preventDefault();
              setShowNoteFor(showNoteFor === reason.reasonCode ? null : reason.reasonCode);
            }}
            disabled={loading !== null}
            style={{
              padding: "14px 10px", background: reason.bg,
              border: `2px solid ${reason.border}`, borderRadius: 12,
              color: reason.color, fontSize: 13, fontWeight: 700,
              cursor: loading ? "default" : "pointer", textAlign: "center",
              minHeight: 64, opacity: loading && loading !== reason.reasonCode ? 0.4 : 1,
              display: "flex", flexDirection: "column", alignItems: "center",
              justifyContent: "center", gap: 4,
            }}
          >
            <span style={{ fontSize: 20 }}>{reason.icon}</span>
            <span>{loading === reason.reasonCode ? "Reporting…" : reason.label}</span>
          </button>
        ))}
      </div>
    </div>
  );
}
