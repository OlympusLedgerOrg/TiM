import React, { useRef, useEffect, useState, useCallback } from "react";
import { Html5Qrcode } from "html5-qrcode";

/**
 * ScanModal — Barcode/QR scan modal for lot consumption
 *
 * Supports two scanning modes:
 *  1. Camera-based scanning using html5-qrcode (no hardware needed)
 *  2. Text input for Bluetooth/USB barcode scanners (auto-submit on Enter)
 *
 * Supports:
 *  - 1D barcodes (Code128 for lot numbers)
 *  - QR codes
 *  - Manual entry fallback for damaged barcodes
 *
 * Camera scanning removes the dependency on external hardware scanners.
 */

interface ScanModalProps {
  title: string;
  onScan: (value: string) => void;
  onClose: () => void;
}

export default function ScanModal({ title, onScan, onClose }: ScanModalProps) {
  const inputRef = useRef<HTMLInputElement>(null);
  const scannerRef = useRef<Html5Qrcode | null>(null);
  const [value, setValue] = useState("");
  const [mode, setMode] = useState<"input" | "camera">("input");
  const [cameraError, setCameraError] = useState<string | null>(null);
  const [scanning, setScanning] = useState(false);

  // Auto-focus the input for barcode scanner
  useEffect(() => {
    if (mode === "input") {
      const t = setTimeout(() => inputRef.current?.focus(), 100);
      return () => clearTimeout(t);
    }
  }, [mode]);

  // Start camera scanner
  const startCamera = useCallback(async () => {
    setCameraError(null);
    setScanning(true);

    try {
      const scanner = new Html5Qrcode("scan-camera-region");
      scannerRef.current = scanner;

      await scanner.start(
        { facingMode: "environment" },
        {
          fps: 10,
          qrbox: { width: 250, height: 150 },
          aspectRatio: 1.777,
        },
        (decodedText) => {
          // Got a scan result
          onScan(decodedText.trim());
          scanner.stop().catch(() => {});
        },
        () => {
          // QR code scanning in progress — no-op for error callback
        },
      );
    } catch (err: any) {
      setCameraError(err?.message || "Camera not available. Use text input instead.");
      setScanning(false);
      setMode("input");
    }
  }, [onScan]);

  // Stop camera scanner on unmount or mode change
  useEffect(() => {
    return () => {
      if (scannerRef.current) {
        scannerRef.current.stop().catch(() => {});
        scannerRef.current = null;
      }
    };
  }, []);

  // Start camera when switching to camera mode
  useEffect(() => {
    if (mode === "camera") {
      startCamera();
    } else {
      if (scannerRef.current) {
        scannerRef.current.stop().catch(() => {});
        scannerRef.current = null;
        setScanning(false);
      }
    }
  }, [mode, startCamera]);

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

        {/* Mode toggle */}
        <div style={{ display: "flex", gap: 4, marginBottom: 16 }}>
          <button
            onClick={() => setMode("input")}
            style={{
              flex: 1, padding: "10px 0",
              background: mode === "input" ? "#1e3a5f" : "#1e1e1e",
              border: `1px solid ${mode === "input" ? "#3b82f6" : "#1e1e1e"}`,
              borderRadius: 8, color: mode === "input" ? "#60a5fa" : "#6b7280",
              fontSize: 13, fontWeight: 700, cursor: "pointer", minHeight: 48,
            }}
          >
            ⌨️ Scanner / Type
          </button>
          <button
            onClick={() => setMode("camera")}
            style={{
              flex: 1, padding: "10px 0",
              background: mode === "camera" ? "#1e3a5f" : "#1e1e1e",
              border: `1px solid ${mode === "camera" ? "#3b82f6" : "#1e1e1e"}`,
              borderRadius: 8, color: mode === "camera" ? "#60a5fa" : "#6b7280",
              fontSize: 13, fontWeight: 700, cursor: "pointer", minHeight: 48,
            }}
          >
            📷 Camera Scan
          </button>
        </div>

        {/* Camera mode */}
        {mode === "camera" && (
          <div style={{ marginBottom: 16 }}>
            <div
              id="scan-camera-region"
              style={{
                width: "100%",
                minHeight: 200,
                background: "#0a0a0a",
                borderRadius: 12,
                overflow: "hidden",
                border: "2px solid #1e3a5f",
              }}
            />
            {cameraError && (
              <div style={{
                marginTop: 8, padding: "8px 12px", background: "#2d1010",
                borderRadius: 8, color: "#fca5a5", fontSize: 12,
              }}>
                ⚠ {cameraError}
              </div>
            )}
            {scanning && (
              <div style={{
                marginTop: 8, textAlign: "center", fontSize: 12, color: "#6b7280",
              }}>
                Point camera at barcode or QR code…
              </div>
            )}
          </div>
        )}

        {/* Input mode */}
        {mode === "input" && (
          <>
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
          </>
        )}

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
          {mode === "input" && (
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
          )}
        </div>
      </div>
    </div>
  );
}
