import React, { useState, useEffect, useCallback } from "react";
import { getAndonBoard, type AndonBoardData, type AndonEquipment, type AndonPlantArea } from "../services/andonService";

/**
 * AndonBoard — Read-only plant floor visibility for wall-mounted TVs
 *
 * Shows all equipment across the plant in a large grid:
 *  🟢 Green = RUNNING    🟡 Yellow = IDLE    🔴 Red = DOWN
 *  🔵 Blue = SETUP/CHANGEOVER   🟣 Purple = MAINTENANCE
 *
 * Features:
 *  - Auto-refreshes every 10 seconds
 *  - Flash/pulse when machines go DOWN
 *  - Running downtime timers
 *  - Filter by plant area
 *  - No auth required
 *  - Full-screen optimized for TV displays
 */

const STATUS_COLORS: Record<string, { bg: string; border: string; color: string; label: string; icon: string }> = {
  RUNNING:     { bg: "#0a2a14", border: "#166534", color: "#4ade80", label: "Running", icon: "🟢" },
  IDLE:        { bg: "#2a2a0a", border: "#854d0e", color: "#fbbf24", label: "Idle", icon: "🟡" },
  DOWN:        { bg: "#2d1010", border: "#991b1b", color: "#f87171", label: "DOWN", icon: "🔴" },
  MAINTENANCE: { bg: "#1a1a2e", border: "#6b21a8", color: "#c084fc", label: "Maint", icon: "🟣" },
  SETUP:       { bg: "#0a1a2e", border: "#1e3a5f", color: "#60a5fa", label: "Setup", icon: "🔵" },
  CHANGEOVER:  { bg: "#0a1a2e", border: "#1e3a5f", color: "#60a5fa", label: "Change", icon: "🔵" },
};

function formatDuration(startedAt: string): string {
  const ms = Date.now() - new Date(startedAt).getTime();
  const totalMin = Math.floor(ms / 60000);
  if (totalMin < 60) return `${totalMin}m`;
  const h = Math.floor(totalMin / 60);
  const m = totalMin % 60;
  return `${h}h ${m}m`;
}

function formatTime(iso: string): string {
  return new Date(iso).toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit" });
}

function EquipmentTile({ eq }: { eq: AndonEquipment }) {
  const s = STATUS_COLORS[eq.status] || STATUS_COLORS.IDLE;
  const isDown = eq.status === "DOWN";
  const downMin = eq.currentDowntime ? Math.round(eq.currentDowntime.durationMin) : 0;

  return (
    <div
      style={{
        padding: "12px 10px",
        background: s.bg,
        border: `2px solid ${s.border}`,
        borderRadius: 12,
        textAlign: "center",
        minHeight: 100,
        display: "flex",
        flexDirection: "column",
        alignItems: "center",
        justifyContent: "center",
        gap: 3,
        animation: isDown ? "andon-pulse 1.5s ease-in-out infinite" : "none",
        position: "relative",
        overflow: "hidden",
      }}
    >
      <div style={{ fontSize: 20, lineHeight: 1 }}>{s.icon}</div>
      <div style={{
        fontSize: 14,
        fontWeight: 800,
        color: s.color,
        fontFamily: "'DM Mono', monospace",
        letterSpacing: "0.05em",
      }}>
        {eq.code}
      </div>
      <div style={{ fontSize: 10, color: "#6b7280", fontWeight: 600 }}>{eq.name}</div>
      <div style={{
        fontSize: 11,
        fontWeight: 700,
        color: s.color,
        fontFamily: "'DM Mono', monospace",
      }}>
        {s.label} · {formatDuration(eq.statusSince)}
      </div>
      {isDown && eq.currentDowntime && (
        <div style={{
          fontSize: 10,
          color: "#fca5a5",
          fontWeight: 600,
          marginTop: 2,
        }}>
          {eq.currentDowntime.reasonCode} · {downMin}m
        </div>
      )}
    </div>
  );
}

function PlantAreaSection({ area }: { area: AndonPlantArea }) {
  const downCount = area.equipment.filter(e => e.status === "DOWN").length;
  const runCount = area.equipment.filter(e => e.status === "RUNNING").length;

  return (
    <div style={{ marginBottom: 20 }}>
      {/* Area header */}
      <div style={{
        display: "flex",
        alignItems: "center",
        gap: 12,
        marginBottom: 10,
        padding: "6px 12px",
        background: "#111",
        borderRadius: 8,
        border: "1px solid #1e1e1e",
      }}>
        <span style={{ fontSize: 14, fontWeight: 800, color: "#f1f5f9" }}>🏭 {area.name}</span>
        <span style={{
          fontSize: 11,
          color: "#6b7280",
          fontFamily: "'DM Mono', monospace",
          fontWeight: 600,
        }}>
          {area.code}
        </span>
        <span style={{ marginLeft: "auto", display: "flex", gap: 8 }}>
          <span style={{ fontSize: 11, color: "#4ade80", fontWeight: 700 }}>🟢 {runCount}</span>
          {downCount > 0 && (
            <span style={{ fontSize: 11, color: "#f87171", fontWeight: 700, animation: "andon-pulse 1.5s ease-in-out infinite" }}>
              🔴 {downCount}
            </span>
          )}
          <span style={{ fontSize: 11, color: "#6b7280", fontWeight: 600 }}>Total: {area.equipment.length}</span>
        </span>
      </div>

      {/* Equipment grid */}
      <div style={{
        display: "grid",
        gridTemplateColumns: "repeat(auto-fill, minmax(140px, 1fr))",
        gap: 8,
      }}>
        {area.equipment.map(eq => (
          <EquipmentTile key={eq.id} eq={eq} />
        ))}
      </div>
    </div>
  );
}

export default function AndonBoard() {
  const [data, setData] = useState<AndonBoardData | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [selectedArea, setSelectedArea] = useState<string | null>(null);
  const [lastRefresh, setLastRefresh] = useState<string>("");

  // Read tenant from URL params
  const params = new URLSearchParams(window.location.search);
  const tenant = params.get("tenant") || "default";

  const refresh = useCallback(async () => {
    try {
      const result = await getAndonBoard(selectedArea || undefined, tenant);
      setData(result);
      setError(null);
      setLastRefresh(new Date().toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit", second: "2-digit" }));
    } catch (err: any) {
      setError(err?.message || "Failed to load andon board");
    }
  }, [selectedArea, tenant]);

  // Initial load + auto-refresh every 10s
  useEffect(() => {
    refresh();
    const interval = setInterval(refresh, 10000);
    return () => clearInterval(interval);
  }, [refresh]);

  // Full-screen on double-click
  const handleDoubleClick = useCallback(() => {
    if (!document.fullscreenElement) {
      document.documentElement.requestFullscreen?.();
    } else {
      document.exitFullscreen?.();
    }
  }, []);

  const allAreas = data?.plantAreas || [];
  const totalDown = data?.downCount || 0;
  const totalEquipment = data?.totalEquipment || 0;

  return (
    <div
      onDoubleClick={handleDoubleClick}
      style={{
        minHeight: "100vh",
        background: "#0a0a0a",
        color: "#f1f5f9",
        fontFamily: "-apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif",
        padding: "12px 16px",
      }}
    >
      {/* Header bar */}
      <div style={{
        display: "flex",
        alignItems: "center",
        gap: 16,
        marginBottom: 16,
        padding: "8px 12px",
        background: "#111",
        borderRadius: 10,
        border: "1px solid #1e1e1e",
      }}>
        <div style={{ fontSize: 20, fontWeight: 800, color: "#f1f5f9" }}>📊 Andon Board</div>

        {/* Area filter tabs */}
        <div style={{ display: "flex", gap: 6, marginLeft: 16 }}>
          <button
            onClick={() => setSelectedArea(null)}
            style={{
              padding: "6px 14px",
              background: !selectedArea ? "#1e3a5f" : "#1e1e1e",
              border: `1px solid ${!selectedArea ? "#3b82f6" : "#1e1e1e"}`,
              borderRadius: 6,
              color: !selectedArea ? "#60a5fa" : "#6b7280",
              fontSize: 12,
              fontWeight: 700,
              cursor: "pointer",
            }}
          >
            All
          </button>
          {allAreas.filter(a => a.code !== "UNASSIGNED").map(area => (
            <button
              key={area.code}
              onClick={() => setSelectedArea(area.code)}
              style={{
                padding: "6px 14px",
                background: selectedArea === area.code ? "#1e3a5f" : "#1e1e1e",
                border: `1px solid ${selectedArea === area.code ? "#3b82f6" : "#1e1e1e"}`,
                borderRadius: 6,
                color: selectedArea === area.code ? "#60a5fa" : "#6b7280",
                fontSize: 12,
                fontWeight: 700,
                cursor: "pointer",
              }}
            >
              {area.name}
            </button>
          ))}
        </div>

        {/* Status summary */}
        <div style={{ marginLeft: "auto", display: "flex", gap: 16, alignItems: "center" }}>
          {totalDown > 0 && (
            <div style={{
              display: "flex", alignItems: "center", gap: 6,
              padding: "4px 12px", background: "#2d1010", borderRadius: 6,
              border: "1px solid #7f1d1d",
              animation: "andon-pulse 1.5s ease-in-out infinite",
            }}>
              <span style={{ fontSize: 14 }}>🔴</span>
              <span style={{ fontSize: 13, fontWeight: 800, color: "#f87171", fontFamily: "'DM Mono', monospace" }}>
                {totalDown} DOWN
              </span>
            </div>
          )}
          <div style={{ fontSize: 11, color: "#6b7280" }}>
            {totalEquipment} machines · Updated {lastRefresh}
          </div>
        </div>
      </div>

      {/* Error */}
      {error && (
        <div style={{
          padding: "12px 16px", background: "#2d1010", border: "1px solid #7f1d1d",
          borderRadius: 10, marginBottom: 16, color: "#fca5a5", fontSize: 13,
        }}>
          ⚠ {error}
        </div>
      )}

      {/* Plant area sections */}
      {allAreas.map(area => (
        <PlantAreaSection key={area.code} area={area} />
      ))}

      {/* Empty state */}
      {allAreas.length === 0 && !error && (
        <div style={{ textAlign: "center", padding: "4rem 0", color: "#4b5563" }}>
          <div style={{ fontSize: 48, marginBottom: 16 }}>🏭</div>
          <div style={{ fontSize: 16 }}>No equipment data available</div>
          <div style={{ fontSize: 12, marginTop: 8 }}>Check tenant parameter or backend connection</div>
        </div>
      )}

      {/* Animations */}
      <style>{`
        @keyframes andon-pulse {
          0%, 100% { opacity: 1; }
          50% { opacity: 0.5; }
        }
      `}</style>
    </div>
  );
}
