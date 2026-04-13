import React from "react";

/**
 * ShiftBanner — Shows the current operator, shift, and station at a glance
 *
 * This sits at the top of the station dashboard after badge login.
 * Workers want to confirm they're clocked in to the right shift/station.
 */

const SHIFT_LABELS: Record<string, { label: string; time: string; icon: string }> = {
  FIRST:  { label: "1st Shift", time: "7 AM – 3 PM", icon: "🌅" },
  SECOND: { label: "2nd Shift", time: "3 PM – 11 PM", icon: "☀️" },
  THIRD:  { label: "3rd Shift", time: "11 PM – 7 AM", icon: "🌙" },
};

interface ShiftBannerProps {
  operatorId: string;
  shift: string;
  workCenterCode: string;
  onLogout?: () => void;
}

export default function ShiftBanner({ operatorId, shift, workCenterCode, onLogout }: ShiftBannerProps) {
  const s = SHIFT_LABELS[shift] || SHIFT_LABELS.FIRST;

  return (
    <div style={{
      display: "flex", alignItems: "center", gap: 10,
      background: "#0d0d0d", borderBottom: "1px solid #1a1a1a",
      padding: "8px 16px",
    }}>
      <span style={{ fontSize: 18 }}>{s.icon}</span>
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{
          fontSize: 12, fontWeight: 700, color: "#9ca3af",
          fontFamily: "'DM Mono', monospace", letterSpacing: "0.05em",
          overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap",
        }}>
          {s.label} · {s.time}
        </div>
        <div style={{
          fontSize: 11, color: "#4b5563",
          fontFamily: "'DM Mono', monospace",
          overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap",
        }}>
          Station {workCenterCode} · Operator {operatorId}
        </div>
      </div>
      {onLogout && (
        <button
          onClick={onLogout}
          style={{
            background: "#1e1e1e", border: "none", borderRadius: 6,
            color: "#6b7280", fontSize: 11, padding: "6px 10px",
            cursor: "pointer", fontWeight: 600, flexShrink: 0,
          }}
        >
          Switch ↗
        </button>
      )}
    </div>
  );
}
