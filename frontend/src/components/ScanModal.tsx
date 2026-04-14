import React, { useRef, useEffect, useState, useCallback } from "react";
import { Html5Qrcode, Html5QrcodeScannerState } from "html5-qrcode";

/**
 * ScanModal — Dual-mode barcode/QR scan modal for lot consumption
 *
 * Two modes, switchable via tabs:
 *  1. 📷 Camera — Uses the device camera to scan QR codes and 1D barcodes
 *     via html5-qrcode. Works on phones, tablets, and laptops with webcams.
 *  2. ⌨️ Manual — Text input for Bluetooth/USB barcode scanners and manual
 *     entry (fallback for damaged labels). Auto-submits on Enter.
 *
 * The scanned value is the lot ID or lot number. The parent component
 * uses it to look up the lot and pre-fill the consume modal.
 */

type ScanMode = "camera" | "manual";

interface ScanModalProps {
  title: string;
  onScan: (value: string) => void;
  onClose: () => void;
}

const SCANNER_REGION_ID = "tim-qr-scanner-region";

export default function ScanModal({ title, onScan, onClose }: ScanModalProps) {
  const inputRef = useRef<HTMLInputElement>(null);
  const scannerRef = useRef<Html5Qrcode | null>(null);
  const [mode, setMode] = useState<ScanMode>("camera");
  const [value, setValue] = useState("");
  const [cameraError, setCameraError] = useState<string | null>(null);
  const [scanning, setScanning] = useState(false);
  const [lastScanned, setLastScanned] = useState<string | null>(null);

  // Track last scanned value to deduplicate rapid repeated scans
  const lastScannedRef = useRef<string | null>(null);

  // Stabilize the onScan callback to avoid re-triggering effects
  const onScanRef = useRef(onScan);
  onScanRef.current = onScan;

  // ─── Camera scanner lifecycle ──────────────────────────────────────
  const startCamera = useCallback(async () => {
    setCameraError(null);
    setScanning(false);

    // Wait for the DOM element to be available
    await new Promise(r => setTimeout(r, 150));

    const el = document.getElementById(SCANNER_REGION_ID);
    if (!el) return;

    try {
      const scanner = new Html5Qrcode(SCANNER_REGION_ID);
      scannerRef.current = scanner;

      await scanner.start(
        { facingMode: "environment" },
        {
          fps: 10,
          qrbox: { width: 250, height: 250 },
          aspectRatio: 1,
        },
        (decodedText) => {
          // Deduplicate rapid scans of the same code
          if (decodedText === lastScannedRef.current) return;
          lastScannedRef.current = decodedText;
          setLastScanned(decodedText);

          // Haptic feedback
          if (navigator.vibrate) navigator.vibrate(150);

          // Stop scanner and submit
          scanner
            .stop()
            .catch(() => {})
            .finally(() => {
              onScanRef.current(decodedText);
            });
        },
        // Ignore scan failures (no match yet)
        () => {},
      );
      setScanning(true);
    } catch (err: any) {
      const msg = err?.message || String(err);
      if (msg.includes("NotAllowedError") || msg.includes("Permission")) {
        setCameraError("Camera permission denied. Tap the lock icon in your browser to allow camera access, or use Manual mode.");
      } else if (msg.includes("NotFoundError") || msg.includes("Requested device not found")) {
        setCameraError("No camera found on this device. Use Manual mode instead.");
      } else {
        setCameraError(msg);
      }
    }
  }, []);

  const stopCamera = useCallback(async () => {
    const scanner = scannerRef.current;
    if (!scanner) return;
    try {
      const state = scanner.getState();
      if (
        state === Html5QrcodeScannerState.SCANNING ||
        state === Html5QrcodeScannerState.PAUSED
      ) {
        await scanner.stop();
      }
    } catch {
      // ignore — already stopped
    }
    scannerRef.current = null;
    setScanning(false);
  }, []);

  // Start/stop camera when mode changes
  useEffect(() => {
    let cancelled = false;

    if (mode === "camera") {
      // Small guard — if the effect re-runs before startCamera resolves,
      // the cancelled flag prevents us from operating on a stale scanner.
      if (!cancelled) startCamera();
    } else {
      stopCamera();
      // Focus the text input after switching to manual
      setTimeout(() => inputRef.current?.focus(), 100);
    }

    // Cleanup only stops the camera on unmount or when mode switches away
    return () => {
      cancelled = true;
      if (mode === "camera") stopCamera();
    };
  }, [mode, startCamera, stopCamera]);

  // ─── Manual input handler ──────────────────────────────────────────
  function handleKeyDown(e: React.KeyboardEvent) {
    if (e.key === "Enter" && value.trim()) {
      e.preventDefault();
      onScan(value.trim());
    }
  }

  // ─── Render ────────────────────────────────────────────────────────
  return (
    <div
      style={{
        position: "fixed", inset: 0, background: "rgba(0,0,0,0.85)", zIndex: 1000,
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
        <div style={{ fontSize: 15, fontWeight: 700, color: "#f1f5f9", marginBottom: 14, textAlign: "center" }}>
          {title}
        </div>

        {/* Mode tabs */}
        <div style={{ display: "flex", gap: 8, marginBottom: 16 }}>
          {([
            { key: "camera" as ScanMode, label: "📷 Camera", desc: "Use device camera" },
            { key: "manual" as ScanMode, label: "⌨️ Manual", desc: "Type or scan gun" },
          ]).map(t => {
            const active = mode === t.key;
            return (
              <button
                key={t.key}
                onClick={() => setMode(t.key)}
                style={{
                  flex: 1, padding: "10px 8px", background: active ? "#1a2a3a" : "#0a0a0a",
                  border: `2px solid ${active ? "#3b82f6" : "#1e1e1e"}`,
                  borderRadius: 10, cursor: "pointer", textAlign: "center",
                }}
              >
                <div style={{ fontSize: 14, fontWeight: 700, color: active ? "#60a5fa" : "#6b7280" }}>{t.label}</div>
                <div style={{ fontSize: 10, color: "#4b5563", marginTop: 2 }}>{t.desc}</div>
              </button>
            );
          })}
        </div>

        {/* Camera mode */}
        {mode === "camera" && (
          <div style={{ marginBottom: 16 }}>
            {cameraError ? (
              <div style={{
                background: "#2d1010", border: "1px solid #7f1d1d", borderRadius: 10,
                padding: "16px", textAlign: "center",
              }}>
                <div style={{ fontSize: 28, marginBottom: 8 }}>🚫</div>
                <div style={{ fontSize: 13, color: "#fca5a5", lineHeight: 1.5 }}>{cameraError}</div>
                <button
                  onClick={() => setMode("manual")}
                  style={{
                    marginTop: 12, background: "#1e1e1e", border: "1px solid #2a2a2a",
                    borderRadius: 8, color: "#9ca3af", padding: "8px 16px", fontSize: 12,
                    fontWeight: 600, cursor: "pointer",
                  }}
                >
                  Switch to Manual
                </button>
              </div>
            ) : (
              <>
                <div
                  id={SCANNER_REGION_ID}
                  style={{
                    width: "100%", minHeight: 280, borderRadius: 12, overflow: "hidden",
                    background: "#000", border: "2px solid #1e3a5f",
                  }}
                />
                {scanning && (
                  <div style={{ textAlign: "center", marginTop: 10 }}>
                    <div style={{ fontSize: 12, color: "#60a5fa", fontWeight: 600 }}>
                      🔍 Scanning… point camera at QR code or barcode
                    </div>
                  </div>
                )}
                {!scanning && !cameraError && (
                  <div style={{ textAlign: "center", marginTop: 10 }}>
                    <div style={{ fontSize: 12, color: "#6b7280" }}>Starting camera…</div>
                  </div>
                )}
              </>
            )}
          </div>
        )}

        {/* Manual mode */}
        {mode === "manual" && (
          <div style={{ marginBottom: 16 }}>
            <div style={{ textAlign: "center", marginBottom: 12 }}>
              <div style={{ fontSize: 36, marginBottom: 6 }}>⌨️</div>
              <div style={{ fontSize: 12, color: "#6b7280" }}>
                Point scanner at barcode or type lot number
              </div>
            </div>
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
              }}
            />
          </div>
        )}

        {/* Action buttons */}
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
          {mode === "manual" && (
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
