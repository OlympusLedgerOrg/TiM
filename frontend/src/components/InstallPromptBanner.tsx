import React, { useState, useEffect, useCallback } from "react";

/**
 * PWA Install Prompt — "Add to Home Screen" for Android/iOS tablets
 *
 * Shows a banner when the app is installable (beforeinstallprompt event).
 * On iOS (which doesn't support beforeinstallprompt), shows manual instructions.
 */

interface BeforeInstallPromptEvent extends Event {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: "accepted" | "dismissed" }>;
}

export function useInstallPrompt() {
  const [deferredPrompt, setDeferredPrompt] = useState<BeforeInstallPromptEvent | null>(null);
  const [isInstallable, setIsInstallable] = useState(false);
  const [isInstalled, setIsInstalled] = useState(false);
  const [isIOS, setIsIOS] = useState(false);

  useEffect(() => {
    // Check if already installed (standalone mode)
    if (window.matchMedia("(display-mode: standalone)").matches) {
      setIsInstalled(true);
      return;
    }

    // Check if iOS
    const ua = navigator.userAgent;
    const isIOSDevice = /iPad|iPhone|iPod/.test(ua) || (navigator.platform === "MacIntel" && navigator.maxTouchPoints > 1);
    setIsIOS(isIOSDevice);

    // Listen for install prompt (Android/Chrome)
    const handler = (e: Event) => {
      e.preventDefault();
      setDeferredPrompt(e as BeforeInstallPromptEvent);
      setIsInstallable(true);
    };

    window.addEventListener("beforeinstallprompt", handler);
    window.addEventListener("appinstalled", () => {
      setIsInstalled(true);
      setIsInstallable(false);
    });

    return () => window.removeEventListener("beforeinstallprompt", handler);
  }, []);

  const promptInstall = useCallback(async () => {
    if (!deferredPrompt) return false;
    deferredPrompt.prompt();
    const result = await deferredPrompt.userChoice;
    setDeferredPrompt(null);
    if (result.outcome === "accepted") {
      setIsInstalled(true);
      setIsInstallable(false);
    }
    return result.outcome === "accepted";
  }, [deferredPrompt]);

  return { isInstallable, isInstalled, isIOS, promptInstall };
}

interface InstallPromptBannerProps {
  onDismiss?: () => void;
}

export default function InstallPromptBanner({ onDismiss }: InstallPromptBannerProps) {
  const { isInstallable, isInstalled, isIOS, promptInstall } = useInstallPrompt();
  const [dismissed, setDismissed] = useState(false);
  const [showIOSGuide, setShowIOSGuide] = useState(false);

  if (isInstalled || dismissed) return null;
  if (!isInstallable && !isIOS) return null;

  const handleDismiss = () => {
    setDismissed(true);
    onDismiss?.();
  };

  // iOS doesn't support beforeinstallprompt — show manual instructions
  if (isIOS && !isInstallable) {
    return (
      <>
        <div style={{
          position: "fixed", bottom: 0, left: 0, right: 0, zIndex: 999,
          padding: "12px 16px", background: "#1e3a5f", borderTop: "1px solid #3b82f6",
          display: "flex", alignItems: "center", gap: 12,
        }}>
          <span style={{ fontSize: 20 }}>📲</span>
          <div style={{ flex: 1 }}>
            <div style={{ fontSize: 13, fontWeight: 700, color: "#f1f5f9" }}>Install TiM</div>
            <button
              onClick={() => setShowIOSGuide(true)}
              style={{
                fontSize: 11, color: "#93c5fd", background: "none", border: "none",
                cursor: "pointer", padding: 0, textDecoration: "underline",
              }}
            >
              Tap Share → Add to Home Screen
            </button>
          </div>
          <button onClick={handleDismiss} style={{
            background: "none", border: "none", color: "#6b7280", fontSize: 18, cursor: "pointer",
          }}>✕</button>
        </div>

        {showIOSGuide && (
          <div style={{
            position: "fixed", inset: 0, background: "rgba(0,0,0,0.8)", zIndex: 1001,
            display: "flex", alignItems: "center", justifyContent: "center", padding: 20,
          }}
            onClick={() => setShowIOSGuide(false)}
          >
            <div onClick={e => e.stopPropagation()} style={{
              background: "#111", borderRadius: 16, padding: 24, maxWidth: 340,
              border: "1px solid #1e1e1e", textAlign: "center",
            }}>
              <div style={{ fontSize: 40, marginBottom: 12 }}>📲</div>
              <div style={{ fontSize: 16, fontWeight: 800, color: "#f1f5f9", marginBottom: 16 }}>
                Install TiM on Your Device
              </div>
              <div style={{ fontSize: 13, color: "#9ca3af", lineHeight: 1.6, marginBottom: 20 }}>
                1. Tap the <strong>Share</strong> button (⬆️) in Safari<br />
                2. Scroll down and tap <strong>"Add to Home Screen"</strong><br />
                3. Tap <strong>"Add"</strong> to confirm
              </div>
              <button
                onClick={() => setShowIOSGuide(false)}
                style={{
                  padding: "12px 24px", background: "#1e3a5f", border: "1px solid #3b82f6",
                  borderRadius: 10, color: "#60a5fa", fontSize: 14, fontWeight: 700, cursor: "pointer",
                }}
              >
                Got It
              </button>
            </div>
          </div>
        )}
      </>
    );
  }

  // Android/Chrome installable prompt
  return (
    <div style={{
      position: "fixed", bottom: 0, left: 0, right: 0, zIndex: 999,
      padding: "12px 16px", background: "#1e3a5f", borderTop: "1px solid #3b82f6",
      display: "flex", alignItems: "center", gap: 12,
    }}>
      <span style={{ fontSize: 20 }}>📲</span>
      <div style={{ flex: 1 }}>
        <div style={{ fontSize: 13, fontWeight: 700, color: "#f1f5f9" }}>Install TiM</div>
        <div style={{ fontSize: 11, color: "#93c5fd" }}>Add to home screen for offline access</div>
      </div>
      <button onClick={promptInstall} style={{
        padding: "8px 16px", background: "#3b82f6", border: "none", borderRadius: 8,
        color: "#fff", fontSize: 13, fontWeight: 700, cursor: "pointer", minHeight: 40,
      }}>
        Install
      </button>
      <button onClick={handleDismiss} style={{
        background: "none", border: "none", color: "#6b7280", fontSize: 18, cursor: "pointer",
      }}>✕</button>
    </div>
  );
}
