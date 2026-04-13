import React, { useRef, useEffect, useState } from "react";

/**
 * ScanModal — Barcode/QR scan modal for lot consumption
 *
 * When the worker taps "Scan Lot", this modal opens with:
 *  1. A text input that receives barcode scanner output (auto-focus)
 *  2. The input auto-submits on Enter (barcode scanners send Enter after scan)
 *  3. Manual entry fallback for damaged barcodes
 *
 * The scanned value is the lot ID or lot number. The parent component
 * uses it to look up the lot and pre-fill the consume modal.
 *
 * NOTE: Camera-based scanning requires a third-party library (e.g. zxing).
 * For now we use the text-input approach which works with Bluetooth and
 * USB barcode scanners — the most common setup on factory floors.
 */

interface ScanModalProps {
  title: string;
  onScan: (value: string) => void;
  onClose: () => void;
}

export default function ScanModal({ title, onScan, onClose }: ScanModalProps) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [value, setValue] = useState("");

  // Auto-focus the input for barcode scanner
  useEffect(() => {
    // Small delay to ensure modal is rendered
    const t = setTimeout(() => inputRef.current?.focus(), 100);
    return () => clearTimeout(t);
  }, []);

  function handleKeyDown(e: React.KeyboardEvent) {
    if (e.key === "Enter" && value.trim()) {
      e.preventDefault();
      onScan(value.trim());
    }
  }

  return (
    <div
      style={{
        position: "fixed", inset: 0, background: "rgba(0,0,0,0.7)", zIndex: 1000,
        display: "flex", alignItems: "flex-end", justifyContent: "center",
      }}
      onClick={onClose}
    >
      <div
        onClick={e => e.stopPropagation()}
        style={{
          background: "#111", border: "1px solid #1e1e1e", borderRadius: "16px 16px 0 0",
          padding: "20px 16px 28px", width: "100%", maxWidth: 600,
        }}
      >
        {/* Title */}
        <div style={{ fontSize: 15, fontWeight: 700, color: "#f1f5f9", marginBottom: 16, textAlign: "center" }}>
          {title}
        </div>

        {/* Scan icon */}
        <div style={{ textAlign: "center", marginBottom: 16 }}>
          <div style={{ fontSize: 48, marginBottom: 8 }}>📷</div>
          <div style={{ fontSize: 12, color: "#6b7280" }}>
            Point scanner at barcode or type lot number
          </div>
        </div>

        {/* Input */}
        <input
          ref={inputRef}
          type="text"
          value={value}
          onChange={e => setValue(e.target.value)}
          onKeyDown={handleKeyDown}
          placeholder="Scan or type lot number…"
          autoComplete="off"
          style={{
            width: "100%", padding: "16px 20px", background: "#0a0a0a",
            border: "2px solid #1e3a5f", borderRadius: 12, color: "#f1f5f9",
            fontSize: 20, fontWeight: 700, fontFamily: "'DM Mono', monospace",
            outline: "none", textAlign: "center", letterSpacing: "0.05em",
            marginBottom: 16,
          }}
        />

        {/* Buttons */}
        <div style={{ display: "flex", gap: 10 }}>
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
            onClick={() => value.trim() && onScan(value.trim())}
            disabled={!value.trim()}
            style={{
              flex: 2, padding: "14px 0",
              background: value.trim() ? "#1a2a3a" : "#1e1e1e",
              border: `1px solid ${value.trim() ? "#1e3a5f" : "#1e1e1e"}`,
              borderRadius: 10, color: value.trim() ? "#60a5fa" : "#4b5563",
              fontSize: 14, fontWeight: 700, cursor: value.trim() ? "pointer" : "default",
              minHeight: 48,
            }}
          >
            Use This Lot
          </button>
        </div>
      </div>
    </div>
  );
}
