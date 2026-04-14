import React, { useEffect, useRef, useState } from "react";
import QRCode from "qrcode";

/**
 * QrPrintModal — Generate and print QR code labels for lots
 *
 * Workers can print QR labels to stick on material containers.
 * The QR code encodes the lot number (or lot ID) so it can be
 * scanned later with the ScanModal camera scanner.
 *
 * The label includes:
 *  - QR code (large, high contrast for factory floor scanning)
 *  - Lot number (human-readable fallback)
 *  - Material description + material number
 *  - Quantity + UOM
 *
 * Print uses a dedicated print window with label-optimized CSS.
 * Works with standard thermal label printers (2" x 1", 4" x 2", etc.)
 * and regular office printers.
 */

export interface QrLabelData {
  /** Value encoded in the QR code — typically the lot number */
  lotNumber: string;
  /** Lot UUID (optional, for internal reference) */
  lotId?: string;
  /** Human-readable material name */
  material: string;
  /** SAP material number or internal code */
  materialNumber: string;
  /** Current quantity */
  quantity: number;
  /** Unit of measure */
  uom: string;
  /** Optional expiry date ISO string */
  expiresAt?: string | null;
}

interface QrPrintModalProps {
  label: QrLabelData;
  onClose: () => void;
}

export default function QrPrintModal({ label, onClose }: QrPrintModalProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [qrDataUrl, setQrDataUrl] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [copies, setCopies] = useState(1);
  const [labelSize, setLabelSize] = useState<"small" | "medium" | "large">("medium");

  // Generate QR code on mount or when label changes
  useEffect(() => {
    async function generateQR() {
      try {
        setError(null);
        // Encode lot number as QR content — compact, easy to decode
        const qrContent = label.lotNumber;

        const dataUrl = await QRCode.toDataURL(qrContent, {
          errorCorrectionLevel: "H", // High correction for factory environments (dirty/damaged labels)
          margin: 2,
          width: 300,
          color: {
            dark: "#000000",
            light: "#ffffff",
          },
        });
        setQrDataUrl(dataUrl);

        // Also render to the preview canvas
        if (canvasRef.current) {
          await QRCode.toCanvas(canvasRef.current, qrContent, {
            errorCorrectionLevel: "H",
            margin: 2,
            width: 200,
            color: {
              dark: "#000000",
              light: "#ffffff",
            },
          });
        }
      } catch (err: any) {
        setError(err?.message || "Failed to generate QR code");
      }
    }

    generateQR();
  }, [label.lotNumber]);

  function handlePrint() {
    if (!qrDataUrl) return;

    const sizes = {
      small: { width: "2in", qr: "1in", fontSize: "8pt", titleSize: "9pt" },
      medium: { width: "3in", qr: "1.5in", fontSize: "9pt", titleSize: "10pt" },
      large: { width: "4in", qr: "2in", fontSize: "10pt", titleSize: "12pt" },
    };
    const s = sizes[labelSize];

    const expiryHtml = label.expiresAt
      ? `<div style="font-size: ${s.fontSize}; margin-top: 2px;">EXP: ${new Date(label.expiresAt).toLocaleDateString()}</div>`
      : "";

    // Build label HTML for N copies
    const labelHtml = Array.from({ length: copies }, () => `
      <div class="label" style="
        width: ${s.width}; 
        padding: 8px; 
        border: 1px dashed #ccc; 
        text-align: center; 
        font-family: 'Arial', 'Helvetica', sans-serif;
        page-break-inside: avoid;
        margin-bottom: 4px;
      ">
        <img src="${qrDataUrl}" style="width: ${s.qr}; height: ${s.qr}; image-rendering: pixelated;" />
        <div style="font-size: ${s.titleSize}; font-weight: bold; margin-top: 4px; letter-spacing: 0.05em;">
          ${escapeHtml(label.lotNumber)}
        </div>
        <div style="font-size: ${s.fontSize}; color: #333; margin-top: 2px;">
          ${escapeHtml(label.material)}
        </div>
        <div style="font-size: ${s.fontSize}; color: #666; font-family: monospace;">
          ${escapeHtml(label.materialNumber)}
        </div>
        <div style="font-size: ${s.fontSize}; font-weight: bold; margin-top: 2px;">
          ${label.quantity} ${escapeHtml(label.uom)}
        </div>
        ${expiryHtml}
      </div>
    `).join("\n");

    const printWindow = window.open("", "_blank", "width=400,height=600");
    if (!printWindow) {
      setError("Pop-up blocked — allow pop-ups for this site to print labels.");
      return;
    }

    printWindow.document.write(`
      <!DOCTYPE html>
      <html>
      <head>
        <title>QR Label — ${escapeHtml(label.lotNumber)}</title>
        <style>
          @media print {
            body { margin: 0; padding: 0; }
            .label { border: none !important; }
            .no-print { display: none !important; }
          }
          body { 
            margin: 8px; 
            display: flex; 
            flex-wrap: wrap; 
            gap: 8px; 
            justify-content: center; 
          }
        </style>
      </head>
      <body>
        ${labelHtml}
        <script>
          window.onload = function() {
            window.print();
            window.onafterprint = function() { window.close(); };
          };
        </script>
      </body>
      </html>
    `);
    printWindow.document.close();
  }

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
          padding: "20px 16px 28px", width: "100%", maxWidth: 500,
        }}
      >
        {/* Title */}
        <div style={{ fontSize: 15, fontWeight: 700, color: "#f1f5f9", marginBottom: 16, textAlign: "center" }}>
          🏷️ Print QR Label
        </div>

        {error && (
          <div style={{
            background: "#2d1010", border: "1px solid #7f1d1d", borderRadius: 8,
            padding: "10px 14px", marginBottom: 12, fontSize: 13, color: "#fca5a5", textAlign: "center",
          }}>
            {error}
          </div>
        )}

        {/* QR Preview */}
        <div style={{
          background: "#fff", borderRadius: 12, padding: 16, marginBottom: 16,
          textAlign: "center",
        }}>
          <canvas
            ref={canvasRef}
            style={{ width: 160, height: 160, imageRendering: "pixelated" }}
          />
          <div style={{ fontFamily: "'Courier New', monospace", fontSize: 16, fontWeight: 700, color: "#000", marginTop: 8, letterSpacing: "0.05em" }}>
            {label.lotNumber}
          </div>
          <div style={{ fontSize: 13, color: "#333", marginTop: 4 }}>
            {label.material}
          </div>
          <div style={{ fontSize: 12, color: "#666", fontFamily: "monospace" }}>
            {label.materialNumber}
          </div>
          <div style={{ fontSize: 13, fontWeight: 700, color: "#000", marginTop: 4 }}>
            {label.quantity} {label.uom}
          </div>
          {label.expiresAt && (
            <div style={{ fontSize: 12, color: "#c00", marginTop: 2 }}>
              EXP: {new Date(label.expiresAt).toLocaleDateString()}
            </div>
          )}
        </div>

        {/* Print options */}
        <div style={{ display: "flex", gap: 10, marginBottom: 16 }}>
          {/* Label size */}
          <div style={{ flex: 1 }}>
            <label style={{ display: "block", fontSize: 11, color: "#6b7280", marginBottom: 6, fontWeight: 600, letterSpacing: "0.05em", textTransform: "uppercase" }}>
              Label Size
            </label>
            <div style={{ display: "flex", gap: 6 }}>
              {(["small", "medium", "large"] as const).map(sz => {
                const active = labelSize === sz;
                return (
                  <button
                    key={sz}
                    onClick={() => setLabelSize(sz)}
                    style={{
                      flex: 1, padding: "8px 4px", background: active ? "#1a2a3a" : "#0a0a0a",
                      border: `1px solid ${active ? "#3b82f6" : "#1e1e1e"}`,
                      borderRadius: 6, cursor: "pointer",
                      fontSize: 11, fontWeight: 600, color: active ? "#60a5fa" : "#6b7280",
                      textTransform: "capitalize",
                    }}
                  >
                    {sz}
                  </button>
                );
              })}
            </div>
          </div>

          {/* Copies */}
          <div style={{ width: 120 }}>
            <label style={{ display: "block", fontSize: 11, color: "#6b7280", marginBottom: 6, fontWeight: 600, letterSpacing: "0.05em", textTransform: "uppercase" }}>
              Copies
            </label>
            <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
              <button
                onClick={() => setCopies(c => Math.max(1, c - 1))}
                style={{
                  width: 36, height: 36, background: "#1e1e1e", border: "1px solid #2a2a2a",
                  borderRadius: 6, color: "#f87171", fontSize: 18, fontWeight: 700, cursor: "pointer",
                  display: "flex", alignItems: "center", justifyContent: "center",
                }}
              >
                −
              </button>
              <span style={{
                flex: 1, textAlign: "center", fontSize: 18, fontWeight: 700,
                color: "#f1f5f9", fontFamily: "'DM Mono', monospace",
              }}>
                {copies}
              </span>
              <button
                onClick={() => setCopies(c => Math.min(20, c + 1))}
                style={{
                  width: 36, height: 36, background: "#1a3a2a", border: "1px solid #166534",
                  borderRadius: 6, color: "#4ade80", fontSize: 18, fontWeight: 700, cursor: "pointer",
                  display: "flex", alignItems: "center", justifyContent: "center",
                }}
              >
                +
              </button>
            </div>
          </div>
        </div>

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
          <button
            onClick={handlePrint}
            disabled={!qrDataUrl}
            style={{
              flex: 2, padding: "14px 0",
              background: qrDataUrl ? "#1a3a2a" : "#1e1e1e",
              border: `2px solid ${qrDataUrl ? "#166534" : "#1e1e1e"}`,
              borderRadius: 10, color: qrDataUrl ? "#4ade80" : "#4b5563",
              fontSize: 15, fontWeight: 700, cursor: qrDataUrl ? "pointer" : "default",
              minHeight: 52,
            }}
          >
            🖨️ Print {copies > 1 ? `${copies} Labels` : "Label"}
          </button>
        </div>
      </div>
    </div>
  );
}

/** Escape HTML entities to prevent XSS in the print window */
function escapeHtml(str: string): string {
  const div = document.createElement("div");
  div.appendChild(document.createTextNode(str));
  return div.innerHTML;
}
