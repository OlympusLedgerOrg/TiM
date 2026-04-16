import React, { useState, useRef, useEffect } from "react";
import { clockIn, type ShiftAssignment } from "../services/equipmentService";
import { startAutoRefocus } from "../services/kioskMode";

/**
 * BadgeLogin — Badge-scan landing screen for factory workers
 *
 * Workers don't have passwords. They scan their badge (a barcode/RFID
 * that resolves to an operator ID), pick their shift, and they're in.
 *
 * The text input auto-submits after a short debounce — barcode scanners
 * type the badge ID and hit Enter automatically.
 */

// Shift labels in worker language
const SHIFTS = [
  { value: "FIRST" as const, label: "1st Shift", time: "7 AM – 3 PM", icon: "🌅" },
  { value: "SECOND" as const, label: "2nd Shift", time: "3 PM – 11 PM", icon: "☀️" },
  { value: "THIRD" as const, label: "3rd Shift", time: "11 PM – 7 AM", icon: "🌙" },
];

function detectCurrentShift(): "FIRST" | "SECOND" | "THIRD" {
  const h = new Date().getHours();
  if (h >= 7 && h < 15) return "FIRST";
  if (h >= 15 && h < 23) return "SECOND";
  return "THIRD";
}

interface BadgeLoginProps {
  workCenterCode: string;
  onLogin: (operator: { id: string; shift: "FIRST" | "SECOND" | "THIRD"; assignment?: ShiftAssignment }) => void;
}

export default function BadgeLogin({ workCenterCode, onLogin }: BadgeLoginProps) {
  const [badgeId, setBadgeId] = useState("");
  const [shift, setShift] = useState<"FIRST" | "SECOND" | "THIRD">(detectCurrentShift);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  // Auto-focus badge input on mount
  useEffect(() => {
    inputRef.current?.focus();
  }, []);

  // Auto-refocus badge input after 30s of inactivity (kiosk mode)
  useEffect(() => {
    return startAutoRefocus(() => inputRef.current);
  }, []);

  async function handleSubmit() {
    const id = badgeId.trim();
    if (!id) return;

    setLoading(true);
    setError(null);

    try {
      const result = await clockIn({
        operatorId: id,
        shift,
        workCenterCode,
      });
      onLogin({
        id,
        shift,
        assignment: {
          id: result.assignment.id,
          operatorId: id,
          // TODO: Extend clock-in API to return operator name from the Operator model
          operatorName: id,
          badgeId: id,
          shift,
          date: new Date().toISOString().slice(0, 10),
          workCenterCode,
          clockInAt: result.assignment.clockInAt,
          clockOutAt: null,
        },
      });
    } catch (err: any) {
      setError(err?.message || "Clock-in failed. Try again.");
      setLoading(false);
    }
  }

  function handleKeyDown(e: React.KeyboardEvent) {
    if (e.key === "Enter") {
      e.preventDefault();
      handleSubmit();
    }
  }

  return (
    <div style={{
      minHeight: "100vh", background: "#0a0a0a", color: "#f1f5f9",
      fontFamily: "'DM Sans', 'Segoe UI', sans-serif",
      display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center",
      padding: 24,
    }}>
      {/* Google Fonts */}
      <style>{`
        @import url('https://fonts.googleapis.com/css2?family=DM+Sans:wght@400;600;700;800&family=DM+Mono:wght@400;500;600&display=swap');
        * { box-sizing: border-box; margin: 0; padding: 0; }
        body { background: #0a0a0a; }
      `}</style>

      {/* Logo area */}
      <div style={{ textAlign: "center", marginBottom: 40 }}>
        <div style={{ fontSize: 48, marginBottom: 8 }}>🏭</div>
        <div style={{
          fontFamily: "'DM Mono', monospace", fontSize: 18, fontWeight: 700,
          color: "#3b82f6", letterSpacing: "0.2em", marginBottom: 4,
        }}>TiM</div>
        <div style={{ fontSize: 14, color: "#6b7280" }}>Station {workCenterCode}</div>
      </div>

      {/* Badge scan input */}
      <div style={{ width: "100%", maxWidth: 400, marginBottom: 32 }}>
        <label style={{ display: "block", fontSize: 13, color: "#6b7280", marginBottom: 8, fontWeight: 600, textAlign: "center" }}>
          Scan Badge or Enter Operator ID
        </label>
        <input
          ref={inputRef}
          type="text"
          value={badgeId}
          onChange={e => setBadgeId(e.target.value)}
          onKeyDown={handleKeyDown}
          placeholder="Badge ID…"
          autoComplete="off"
          style={{
            width: "100%", padding: "18px 20px", background: "#111", border: "2px solid #1e1e1e",
            borderRadius: 14, color: "#f1f5f9", fontSize: 24, fontWeight: 700,
            fontFamily: "'DM Mono', monospace", outline: "none", textAlign: "center",
            letterSpacing: "0.1em",
          }}
          onFocus={e => { e.target.style.borderColor = "#3b82f6"; }}
          onBlur={e => { e.target.style.borderColor = "#1e1e1e"; }}
        />
      </div>

      {/* Shift selection — big touchable buttons */}
      <div style={{ width: "100%", maxWidth: 400, marginBottom: 32 }}>
        <label style={{ display: "block", fontSize: 13, color: "#6b7280", marginBottom: 12, fontWeight: 600, textAlign: "center" }}>
          Select Shift
        </label>
        <div style={{ display: "flex", gap: 10 }}>
          {SHIFTS.map(s => {
            const active = shift === s.value;
            return (
              <button
                key={s.value}
                onClick={() => setShift(s.value)}
                style={{
                  flex: 1, padding: "16px 8px", background: active ? "#1a2a3a" : "#111",
                  border: `2px solid ${active ? "#3b82f6" : "#1e1e1e"}`,
                  borderRadius: 12, cursor: "pointer", textAlign: "center",
                  minHeight: 80,
                }}
              >
                <div style={{ fontSize: 24, marginBottom: 4 }}>{s.icon}</div>
                <div style={{ fontSize: 13, fontWeight: 700, color: active ? "#60a5fa" : "#9ca3af" }}>{s.label}</div>
                <div style={{ fontSize: 11, color: "#4b5563", marginTop: 2 }}>{s.time}</div>
              </button>
            );
          })}
        </div>
      </div>

      {/* Error */}
      {error && (
        <div style={{
          width: "100%", maxWidth: 400, marginBottom: 16,
          background: "#2d1010", border: "1px solid #7f1d1d", borderRadius: 10,
          padding: "12px 16px", fontSize: 13, color: "#fca5a5", textAlign: "center",
        }}>
          {error}
        </div>
      )}

      {/* Clock In button */}
      <button
        onClick={handleSubmit}
        disabled={loading || !badgeId.trim()}
        style={{
          width: "100%", maxWidth: 400, padding: "18px 0",
          background: badgeId.trim() ? "#1a3a2a" : "#1e1e1e",
          border: `2px solid ${badgeId.trim() ? "#166534" : "#1e1e1e"}`,
          borderRadius: 14, color: badgeId.trim() ? "#4ade80" : "#4b5563",
          fontSize: 18, fontWeight: 700, cursor: badgeId.trim() ? "pointer" : "default",
          fontFamily: "'DM Sans', sans-serif", letterSpacing: "0.03em",
          minHeight: 60,
          opacity: loading ? 0.6 : 1,
        }}
      >
        {loading ? "Clocking in…" : "🔓 Clock In"}
      </button>

      {/* Skip link for dev/demo */}
      <button
        onClick={() => onLogin({ id: "demo-operator", shift })}
        style={{
          marginTop: 24, background: "none", border: "none", color: "#374151",
          fontSize: 12, cursor: "pointer", textDecoration: "underline",
        }}
      >
        Skip (demo mode)
      </button>
    </div>
  );
}
