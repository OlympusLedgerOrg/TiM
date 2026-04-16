import React, { useState, useEffect, useCallback } from "react";
import { getEquipment, getOee, type EquipmentSummary, type OeeSnapshot } from "../services/equipmentService";

/**
 * OEE Scorecard — Visual OEE display for equipment
 *
 * Shows OEE (Overall Equipment Effectiveness) for each machine:
 *   OEE = Availability × Performance × Quality
 *
 * Color coded:
 *   🟢 > 85%  (world-class)
 *   🟡 70-85% (needs improvement)
 *   🔴 < 70%  (poor)
 *
 * Uses the existing /api/v1/equipment/:id/oee endpoint.
 */

function oeeColor(value: number): { color: string; bg: string; border: string; icon: string } {
  const pct = value * 100;
  if (pct >= 85) return { color: "#4ade80", bg: "#0a2a14", border: "#166534", icon: "🟢" };
  if (pct >= 70) return { color: "#fbbf24", bg: "#2a1f0a", border: "#92400e", icon: "🟡" };
  return { color: "#f87171", bg: "#2d1010", border: "#991b1b", icon: "🔴" };
}

function pctStr(v: number): string {
  return `${(v * 100).toFixed(1)}%`;
}

function OeeGauge({ label, value, size = 60 }: { label: string; value: number; size?: number }) {
  const { color } = oeeColor(value);
  const pct = value * 100;
  const radius = (size - 8) / 2;
  const circumference = 2 * Math.PI * radius;
  const strokeDashoffset = circumference * (1 - value);

  return (
    <div style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 4 }}>
      <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`}>
        {/* Background ring */}
        <circle
          cx={size / 2} cy={size / 2} r={radius}
          fill="none" stroke="#1e1e1e" strokeWidth={4}
        />
        {/* Value ring */}
        <circle
          cx={size / 2} cy={size / 2} r={radius}
          fill="none" stroke={color} strokeWidth={4}
          strokeDasharray={circumference}
          strokeDashoffset={strokeDashoffset}
          strokeLinecap="round"
          transform={`rotate(-90 ${size / 2} ${size / 2})`}
          style={{ transition: "stroke-dashoffset 0.6s ease" }}
        />
        <text
          x={size / 2} y={size / 2}
          textAnchor="middle" dominantBaseline="central"
          style={{ fontSize: size * 0.22, fontWeight: 800, fill: color, fontFamily: "'DM Mono', monospace" }}
        >
          {pct.toFixed(0)}%
        </text>
      </svg>
      <div style={{ fontSize: 10, color: "#6b7280", fontWeight: 600, textTransform: "uppercase", letterSpacing: "0.06em" }}>
        {label}
      </div>
    </div>
  );
}

interface OeeScorecardProps {
  workCenter?: string;
  equipmentList?: EquipmentSummary[];
}

export default function OeeScorecard({ workCenter, equipmentList }: OeeScorecardProps) {
  const [equipment, setEquipment] = useState<EquipmentSummary[]>(equipmentList || []);
  const [oeeData, setOeeData] = useState<Map<string, OeeSnapshot>>(new Map());
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const loadOee = useCallback(async () => {
    try {
      setLoading(true);
      setError(null);

      let eqs = equipmentList || [];
      if (!eqs.length && workCenter) {
        const result = await getEquipment(workCenter);
        eqs = result.equipment;
        setEquipment(eqs);
      }

      // Fetch OEE for each piece of equipment
      const oeeMap = new Map<string, OeeSnapshot>();
      const results = await Promise.allSettled(
        eqs.map(eq => getOee(eq.id))
      );

      results.forEach((result, i) => {
        if (result.status === "fulfilled") {
          oeeMap.set(eqs[i].id, result.value);
        }
      });

      setOeeData(oeeMap);
    } catch (err: any) {
      setError(err?.message || "Failed to load OEE data");
    } finally {
      setLoading(false);
    }
  }, [workCenter, equipmentList]);

  useEffect(() => {
    loadOee();
    const interval = setInterval(loadOee, 60000); // Refresh every minute
    return () => clearInterval(interval);
  }, [loadOee]);

  if (loading && oeeData.size === 0) {
    return (
      <div style={{ textAlign: "center", padding: "2rem 0", color: "#6b7280" }}>
        Loading OEE data…
      </div>
    );
  }

  if (error) {
    return (
      <div style={{
        padding: "12px 16px", background: "#2d1010", border: "1px solid #7f1d1d",
        borderRadius: 10, color: "#fca5a5", fontSize: 13,
      }}>
        ⚠ {error}
      </div>
    );
  }

  if (equipment.length === 0) {
    return (
      <div style={{ textAlign: "center", padding: "2rem 0", color: "#4b5563" }}>
        <div style={{ fontSize: 24, marginBottom: 8 }}>📊</div>
        <div style={{ fontSize: 13 }}>No equipment for OEE calculation</div>
      </div>
    );
  }

  return (
    <div>
      <div style={{
        fontSize: 11, color: "#6b7280", fontWeight: 600, letterSpacing: "0.1em",
        textTransform: "uppercase", marginBottom: 12, fontFamily: "'DM Mono', monospace",
      }}>
        📊 OEE Scorecard
      </div>

      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(280px, 1fr))", gap: 10 }}>
        {equipment.map(eq => {
          const oee = oeeData.get(eq.id);
          if (!oee) return null;

          const overall = oeeColor(oee.oee);

          return (
            <div
              key={eq.id}
              style={{
                background: overall.bg,
                border: `1px solid ${overall.border}`,
                borderRadius: 12,
                padding: "14px 16px",
              }}
            >
              {/* Equipment header */}
              <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 12 }}>
                <span style={{ fontSize: 16 }}>{overall.icon}</span>
                <div>
                  <div style={{
                    fontSize: 14, fontWeight: 800, color: overall.color,
                    fontFamily: "'DM Mono', monospace",
                  }}>
                    {eq.code}
                  </div>
                  <div style={{ fontSize: 11, color: "#6b7280" }}>{eq.name}</div>
                </div>
                <div style={{
                  marginLeft: "auto", fontSize: 22, fontWeight: 800,
                  color: overall.color, fontFamily: "'DM Mono', monospace",
                }}>
                  {pctStr(oee.oee)}
                </div>
              </div>

              {/* A × P × Q gauges */}
              <div style={{ display: "flex", justifyContent: "space-around" }}>
                <OeeGauge label="Avail" value={oee.availability} />
                <OeeGauge label="Perf" value={oee.performance} />
                <OeeGauge label="Quality" value={oee.quality} />
              </div>

              {/* Target comparison */}
              {oee.targetOee != null && (
                <div style={{
                  marginTop: 8, textAlign: "center", fontSize: 11, color: "#6b7280",
                  fontFamily: "'DM Mono', monospace",
                }}>
                  Target: {pctStr(oee.targetOee)} · {oee.oee >= oee.targetOee ? "✓ On track" : "⚠ Below target"}
                </div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}
