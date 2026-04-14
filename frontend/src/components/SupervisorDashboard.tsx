import React, { useState, useEffect, useCallback } from "react";
import { getEquipment, getDowntimeHistory, getShiftAssignments, type EquipmentSummary, type DowntimeEvent, type ShiftAssignment } from "../services/equipmentService";
import { getPlantAreas, getPlantAreaDetail, type PlantAreaSummary } from "../services/plantAreaService";
import EquipmentTiles from "./EquipmentTiles";
import OeeScorecard from "./OeeScorecard";

/**
 * SupervisorDashboard — Shift lead overview
 *
 * Real-time view of:
 *  - All stations and their operators (who's clocked in)
 *  - Downtime summary for current shift (total minutes, by reason, by machine)
 *  - OEE scorecards per machine
 *  - Equipment status across plant areas
 *
 * Requires authentication (Supervisor or Admin role).
 */

function getCurrentShift(): "FIRST" | "SECOND" | "THIRD" {
  const h = new Date().getHours();
  if (h >= 7 && h < 15) return "FIRST";
  if (h >= 15 && h < 23) return "SECOND";
  return "THIRD";
}

function getShiftLabel(shift: string): string {
  const labels: Record<string, string> = {
    FIRST: "1st Shift (7am – 3pm)",
    SECOND: "2nd Shift (3pm – 11pm)",
    THIRD: "3rd Shift (11pm – 7am)",
  };
  return labels[shift] || shift;
}

interface DowntimeSummary {
  totalMinutes: number;
  totalEvents: number;
  byReason: Array<{ reason: string; minutes: number; count: number }>;
  byMachine: Array<{ code: string; name: string; minutes: number; count: number }>;
}

function summarizeDowntime(events: DowntimeEvent[]): DowntimeSummary {
  let totalMinutes = 0;
  const reasonMap = new Map<string, { minutes: number; count: number }>();
  const machineMap = new Map<string, { code: string; name: string; minutes: number; count: number }>();

  for (const evt of events) {
    const mins = evt.durationMin || 0;
    totalMinutes += mins;

    const reason = evt.reasonCode;
    const existing = reasonMap.get(reason) || { minutes: 0, count: 0 };
    existing.minutes += mins;
    existing.count++;
    reasonMap.set(reason, existing);
  }

  return {
    totalMinutes: Math.round(totalMinutes),
    totalEvents: events.length,
    byReason: Array.from(reasonMap.entries())
      .map(([reason, data]) => ({ reason, minutes: Math.round(data.minutes), count: data.count }))
      .sort((a, b) => b.minutes - a.minutes),
    byMachine: Array.from(machineMap.entries())
      .map(([, data]) => data)
      .sort((a, b) => b.minutes - a.minutes),
  };
}

export default function SupervisorDashboard() {
  const [plantAreas, setPlantAreas] = useState<PlantAreaSummary[]>([]);
  const [selectedArea, setSelectedArea] = useState<string | null>(null);
  const [equipment, setEquipment] = useState<EquipmentSummary[]>([]);
  const [assignments, setAssignments] = useState<ShiftAssignment[]>([]);
  const [downtimeEvents, setDowntimeEvents] = useState<DowntimeEvent[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [activeTab, setActiveTab] = useState<"overview" | "downtime" | "oee">("overview");

  const currentShift = getCurrentShift();
  const today = new Date().toISOString().slice(0, 10);

  const loadData = useCallback(async () => {
    try {
      setLoading(true);
      setError(null);

      // Load plant areas
      const areasResult = await getPlantAreas();
      setPlantAreas(areasResult.plantAreas);

      // Load shift assignments
      const assignResult = await getShiftAssignments(today, currentShift);
      setAssignments(assignResult.assignments);

      // If we have a selected area, load its equipment
      if (selectedArea) {
        const detail = await getPlantAreaDetail(selectedArea);
        // Load equipment for each work center in this area
        const allEq: EquipmentSummary[] = [];
        const allDowntime: DowntimeEvent[] = [];

        for (const wc of detail.plantArea.workCenters) {
          try {
            const eqResult = await getEquipment(wc.code);
            allEq.push(...eqResult.equipment);

            // Get downtime for each piece of equipment (last 8 hours = current shift)
            for (const eq of eqResult.equipment) {
              try {
                const dtResult = await getDowntimeHistory(eq.id, 8);
                allDowntime.push(...dtResult.events);
              } catch {
                // non-critical
              }
            }
          } catch {
            // work center might have no equipment
          }
        }

        setEquipment(allEq);
        setDowntimeEvents(allDowntime);
      }
    } catch (err: any) {
      setError(err?.message || "Failed to load supervisor data");
    } finally {
      setLoading(false);
    }
  }, [selectedArea, currentShift, today]);

  useEffect(() => {
    loadData();
    const interval = setInterval(loadData, 30000);
    return () => clearInterval(interval);
  }, [loadData]);

  const downtimeSummary = summarizeDowntime(downtimeEvents);
  const downEquipment = equipment.filter(e => e.status === "DOWN");
  const runningEquipment = equipment.filter(e => e.status === "RUNNING");
  const clockedIn = assignments.filter(a => a.clockInAt);

  const tabs = [
    { key: "overview" as const, label: "📋 Overview" },
    { key: "downtime" as const, label: `⬇ Downtime (${downtimeSummary.totalEvents})` },
    { key: "oee" as const, label: "📊 OEE" },
  ];

  return (
    <div style={{
      minHeight: "100vh",
      background: "#0a0a0a",
      color: "#f1f5f9",
      fontFamily: "-apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif",
      padding: "12px 16px",
      maxWidth: 1200,
      margin: "0 auto",
    }}>
      {/* Header */}
      <div style={{
        display: "flex", alignItems: "center", gap: 12, marginBottom: 16,
        padding: "10px 14px", background: "#111", borderRadius: 10, border: "1px solid #1e1e1e",
      }}>
        <div>
          <div style={{ fontSize: 18, fontWeight: 800 }}>👷 Supervisor Dashboard</div>
          <div style={{ fontSize: 12, color: "#6b7280" }}>{getShiftLabel(currentShift)} · {today}</div>
        </div>

        {/* Quick stats */}
        <div style={{ marginLeft: "auto", display: "flex", gap: 12 }}>
          <div style={{ textAlign: "center" }}>
            <div style={{ fontSize: 20, fontWeight: 800, color: "#4ade80", fontFamily: "'DM Mono', monospace" }}>{clockedIn.length}</div>
            <div style={{ fontSize: 10, color: "#6b7280" }}>Clocked In</div>
          </div>
          <div style={{ textAlign: "center" }}>
            <div style={{ fontSize: 20, fontWeight: 800, color: "#4ade80", fontFamily: "'DM Mono', monospace" }}>{runningEquipment.length}</div>
            <div style={{ fontSize: 10, color: "#6b7280" }}>Running</div>
          </div>
          <div style={{ textAlign: "center" }}>
            <div style={{ fontSize: 20, fontWeight: 800, color: downEquipment.length > 0 ? "#f87171" : "#4ade80", fontFamily: "'DM Mono', monospace" }}>
              {downEquipment.length}
            </div>
            <div style={{ fontSize: 10, color: "#6b7280" }}>Down</div>
          </div>
          <div style={{ textAlign: "center" }}>
            <div style={{ fontSize: 20, fontWeight: 800, color: "#fbbf24", fontFamily: "'DM Mono', monospace" }}>{downtimeSummary.totalMinutes}m</div>
            <div style={{ fontSize: 10, color: "#6b7280" }}>DT This Shift</div>
          </div>
        </div>
      </div>

      {/* Plant area filter */}
      <div style={{ display: "flex", gap: 6, marginBottom: 12 }}>
        {plantAreas.map(area => (
          <button
            key={area.code}
            onClick={() => setSelectedArea(selectedArea === area.code ? null : area.code)}
            style={{
              padding: "8px 16px",
              background: selectedArea === area.code ? "#1e3a5f" : "#1e1e1e",
              border: `1px solid ${selectedArea === area.code ? "#3b82f6" : "#1e1e1e"}`,
              borderRadius: 8,
              color: selectedArea === area.code ? "#60a5fa" : "#6b7280",
              fontSize: 13,
              fontWeight: 700,
              cursor: "pointer",
              minHeight: 48,
            }}
          >
            🏭 {area.name} ({area.equipmentCount})
          </button>
        ))}
      </div>

      {/* Error */}
      {error && (
        <div style={{
          padding: "12px 16px", background: "#2d1010", border: "1px solid #7f1d1d",
          borderRadius: 10, marginBottom: 12, color: "#fca5a5", fontSize: 13,
        }}>
          ⚠ {error}
        </div>
      )}

      {/* Tabs */}
      <div style={{ display: "flex", gap: 4, marginBottom: 16 }}>
        {tabs.map(tab => (
          <button
            key={tab.key}
            onClick={() => setActiveTab(tab.key)}
            style={{
              padding: "10px 20px",
              background: activeTab === tab.key ? "#1e3a5f" : "#111",
              border: `1px solid ${activeTab === tab.key ? "#3b82f6" : "#1e1e1e"}`,
              borderRadius: "8px 8px 0 0",
              color: activeTab === tab.key ? "#60a5fa" : "#6b7280",
              fontSize: 13,
              fontWeight: 700,
              cursor: "pointer",
              minHeight: 48,
            }}
          >
            {tab.label}
          </button>
        ))}
      </div>

      {/* Tab content */}
      {loading && equipment.length === 0 ? (
        <div style={{ textAlign: "center", padding: "3rem 0", color: "#6b7280" }}>
          {selectedArea ? "Loading data…" : "Select a plant area to view details"}
        </div>
      ) : (
        <>
          {activeTab === "overview" && (
            <div>
              {/* Operators section */}
              <div style={{
                fontSize: 11, color: "#6b7280", fontWeight: 600, letterSpacing: "0.1em",
                textTransform: "uppercase", marginBottom: 10, fontFamily: "'DM Mono', monospace",
              }}>
                👥 Operators This Shift ({clockedIn.length} clocked in)
              </div>
              {clockedIn.length > 0 ? (
                <div style={{
                  display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(220px, 1fr))",
                  gap: 8, marginBottom: 20,
                }}>
                  {clockedIn.map(a => (
                    <div key={a.id} style={{
                      padding: "10px 12px", background: "#111", border: "1px solid #1e1e1e",
                      borderRadius: 10,
                    }}>
                      <div style={{ fontSize: 13, fontWeight: 700, color: "#f1f5f9" }}>{a.operatorName}</div>
                      <div style={{ fontSize: 11, color: "#6b7280" }}>
                        {a.workCenterCode || "—"} · Badge: {a.badgeId || "—"}
                      </div>
                      <div style={{ fontSize: 10, color: "#4b5563" }}>
                        In: {a.clockInAt ? new Date(a.clockInAt).toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit" }) : "—"}
                      </div>
                    </div>
                  ))}
                </div>
              ) : (
                <div style={{ padding: "1rem", color: "#4b5563", fontSize: 13, marginBottom: 20 }}>
                  No operators clocked in for {getShiftLabel(currentShift)}
                </div>
              )}

              {/* Equipment status */}
              <div style={{
                fontSize: 11, color: "#6b7280", fontWeight: 600, letterSpacing: "0.1em",
                textTransform: "uppercase", marginBottom: 10, fontFamily: "'DM Mono', monospace",
              }}>
                🏭 Equipment Status ({equipment.length})
              </div>
              <EquipmentTiles equipment={equipment} />
            </div>
          )}

          {activeTab === "downtime" && (
            <div>
              <div style={{
                fontSize: 11, color: "#6b7280", fontWeight: 600, letterSpacing: "0.1em",
                textTransform: "uppercase", marginBottom: 12, fontFamily: "'DM Mono', monospace",
              }}>
                ⬇ Downtime This Shift — {downtimeSummary.totalMinutes} total minutes
              </div>

              {/* Downtime by reason (mini Pareto) */}
              {downtimeSummary.byReason.length > 0 ? (
                <div style={{ marginBottom: 20 }}>
                  {downtimeSummary.byReason.map((r, i) => {
                    const pct = downtimeSummary.totalMinutes > 0
                      ? (r.minutes / downtimeSummary.totalMinutes) * 100
                      : 0;
                    return (
                      <div key={r.reason} style={{
                        display: "flex", alignItems: "center", gap: 10, marginBottom: 6,
                        padding: "8px 12px", background: "#111", borderRadius: 8,
                        border: "1px solid #1e1e1e",
                      }}>
                        <span style={{
                          fontSize: 12, fontWeight: 800, color: "#f1f5f9", width: 24,
                          textAlign: "center", fontFamily: "'DM Mono', monospace",
                        }}>
                          #{i + 1}
                        </span>
                        <span style={{ fontSize: 13, fontWeight: 700, color: "#f1f5f9", flex: 1 }}>
                          {r.reason}
                        </span>
                        <span style={{ fontSize: 11, color: "#6b7280" }}>
                          {r.count}x
                        </span>
                        <div style={{ width: 100, height: 6, background: "#1e1e1e", borderRadius: 3, overflow: "hidden" }}>
                          <div style={{ height: "100%", width: `${pct}%`, background: "#f87171", borderRadius: 3 }} />
                        </div>
                        <span style={{
                          fontSize: 13, fontWeight: 800, color: "#f87171",
                          fontFamily: "'DM Mono', monospace", minWidth: 50, textAlign: "right",
                        }}>
                          {r.minutes}m
                        </span>
                      </div>
                    );
                  })}
                </div>
              ) : (
                <div style={{ padding: "2rem", textAlign: "center", color: "#4b5563" }}>
                  ✓ No downtime events this shift
                </div>
              )}
            </div>
          )}

          {activeTab === "oee" && selectedArea && (
            <OeeScorecard equipmentList={equipment} />
          )}

          {activeTab === "oee" && !selectedArea && (
            <div style={{ textAlign: "center", padding: "3rem 0", color: "#4b5563" }}>
              Select a plant area to view OEE scorecards
            </div>
          )}
        </>
      )}
    </div>
  );
}
