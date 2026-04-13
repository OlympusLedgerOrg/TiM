import React from "react";
import type { EquipmentSummary, EquipmentStatusValue } from "../services/equipmentService";

/**
 * EquipmentTiles — Large color-coded equipment status tiles
 *
 * Workers should see machine status from 10 feet away on a wall-mounted
 * tablet. Each tile is a big colored block:
 *   🟢 Green  = RUNNING
 *   🟡 Yellow = IDLE
 *   🔴 Red    = DOWN
 *   🔵 Blue   = SETUP / CHANGEOVER
 *   🟣 Purple = MAINTENANCE
 */

const STATUS_STYLES: Record<EquipmentStatusValue, {
  bg: string; border: string; color: string; glow: string; label: string; icon: string;
}> = {
  RUNNING:    { bg: "#0a2a14", border: "#166534", color: "#4ade80", glow: "0 0 20px rgba(74,222,128,0.15)", label: "Running", icon: "🟢" },
  IDLE:       { bg: "#2a2a0a", border: "#854d0e", color: "#fbbf24", glow: "0 0 20px rgba(251,191,36,0.15)", label: "Idle", icon: "🟡" },
  DOWN:       { bg: "#2d1010", border: "#991b1b", color: "#f87171", glow: "0 0 20px rgba(248,113,113,0.2)", label: "Down", icon: "🔴" },
  MAINTENANCE:{ bg: "#1a1a2e", border: "#6b21a8", color: "#c084fc", glow: "0 0 20px rgba(192,132,252,0.15)", label: "Maintenance", icon: "🟣" },
  SETUP:      { bg: "#0a1a2e", border: "#1e3a5f", color: "#60a5fa", glow: "0 0 20px rgba(96,165,250,0.15)", label: "Setup", icon: "🔵" },
  CHANGEOVER: { bg: "#0a1a2e", border: "#1e3a5f", color: "#60a5fa", glow: "0 0 20px rgba(96,165,250,0.15)", label: "Changeover", icon: "🔵" },
};

function timeSince(isoStr: string): string {
  const diff = Date.now() - new Date(isoStr).getTime();
  const m = Math.floor(diff / 60000);
  if (m < 60) return `${m}m`;
  const h = Math.floor(m / 60);
  return `${h}h ${m % 60}m`;
}

interface EquipmentTilesProps {
  equipment: EquipmentSummary[];
  selectedId?: string;
  onSelect?: (eq: EquipmentSummary) => void;
}

export default function EquipmentTiles({ equipment, selectedId, onSelect }: EquipmentTilesProps) {
  if (equipment.length === 0) {
    return (
      <div style={{ textAlign: "center", padding: "2rem 0", color: "#4b5563" }}>
        <div style={{ fontSize: 24, marginBottom: 8 }}>🏭</div>
        <div style={{ fontSize: 13 }}>No equipment at this station</div>
      </div>
    );
  }

  return (
    <div style={{ display: "grid", gridTemplateColumns: equipment.length === 1 ? "1fr" : "1fr 1fr", gap: 10 }}>
      {equipment.map(eq => {
        const s = STATUS_STYLES[eq.status] || STATUS_STYLES.IDLE;
        const selected = selectedId === eq.id;
        const isDown = eq.status === "DOWN";
        const downMin = eq.currentDowntime ? Math.round(eq.currentDowntime.durationMin) : 0;

        return (
          <button
            key={eq.id}
            onClick={() => onSelect?.(eq)}
            style={{
              padding: "14px 12px", background: s.bg,
              border: `2px solid ${selected ? s.color : s.border}`,
              borderRadius: 14, cursor: "pointer", textAlign: "center",
              minHeight: 90, boxShadow: selected ? s.glow : "none",
              transition: "all 0.2s ease",
              display: "flex", flexDirection: "column", alignItems: "center",
              justifyContent: "center", gap: 4,
              animation: isDown ? "pulse-border 2s ease-in-out infinite" : "none",
            }}
          >
            <div style={{ fontSize: 24, lineHeight: 1 }}>{s.icon}</div>
            <div style={{
              fontSize: 14, fontWeight: 800, color: s.color,
              fontFamily: "'DM Mono', monospace", letterSpacing: "0.05em",
            }}>
              {eq.code}
            </div>
            <div style={{ fontSize: 11, color: "#6b7280", fontWeight: 600 }}>{eq.name}</div>
            <div style={{
              fontSize: 11, fontWeight: 700, color: s.color,
              fontFamily: "'DM Mono', monospace",
            }}>
              {s.label} · {timeSince(eq.statusSince)}
            </div>
            {isDown && eq.currentDowntime && (
              <div style={{
                fontSize: 10, color: "#fca5a5", fontWeight: 600, marginTop: 2,
              }}>
                {eq.currentDowntime.reasonCode} · {downMin}m
              </div>
            )}
          </button>
        );
      })}

      {/* Pulse animation for DOWN equipment */}
      <style>{`
        @keyframes pulse-border {
          0%, 100% { opacity: 1; }
          50% { opacity: 0.7; }
        }
      `}</style>
    </div>
  );
}
