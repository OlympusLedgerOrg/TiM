import React, { useState, useEffect } from "react";
import { isOnline, onConnectivityChange, getQueueSize } from "../services/offlineQueue";

/**
 * OfflineBanner — Global offline indicator
 *
 * Shows a fixed banner when the app detects it's offline.
 * Displays the count of pending queued actions.
 * When back online, briefly shows a "back online" message.
 */

export default function OfflineBanner() {
  const [online, setOnline] = useState(isOnline());
  const [showReconnected, setShowReconnected] = useState(false);
  const [queueSize, setQueueSize] = useState(getQueueSize());

  useEffect(() => {
    let wasOffline = !isOnline();

    const unsub = onConnectivityChange((nowOnline) => {
      setOnline(nowOnline);
      setQueueSize(getQueueSize());

      // Show "back online" toast when reconnecting
      if (nowOnline && wasOffline) {
        setShowReconnected(true);
        setTimeout(() => setShowReconnected(false), 3000);
      }
      wasOffline = !nowOnline;
    });

    // Periodically update queue size while offline
    const interval = setInterval(() => {
      if (!isOnline()) {
        setQueueSize(getQueueSize());
      }
    }, 5000);

    return () => {
      unsub();
      clearInterval(interval);
    };
  }, []);

  // Show reconnected toast
  if (showReconnected && online) {
    return (
      <div style={{
        position: "fixed", top: 0, left: 0, right: 0, zIndex: 1200,
        background: "#166534", padding: "8px 16px", textAlign: "center",
        fontSize: 13, fontWeight: 700, color: "#bbf7d0",
        display: "flex", alignItems: "center", justifyContent: "center", gap: 8,
        transition: "opacity 0.3s ease",
      }}>
        <span style={{ fontSize: 16 }}>✓</span>
        Back online — syncing queued actions…
      </div>
    );
  }

  // Show offline banner
  if (!online) {
    return (
      <div style={{
        position: "fixed", top: 0, left: 0, right: 0, zIndex: 1200,
        background: "#92400e", padding: "8px 16px", textAlign: "center",
        fontSize: 13, fontWeight: 700, color: "#fef3c7",
        display: "flex", alignItems: "center", justifyContent: "center", gap: 8,
      }}>
        <span style={{ fontSize: 16 }}>⚡</span>
        OFFLINE — actions will sync when back
        {queueSize > 0 && (
          <span style={{
            background: "#78350f", borderRadius: 4, padding: "2px 8px",
            fontSize: 11, marginLeft: 4,
          }}>
            {queueSize} pending
          </span>
        )}
      </div>
    );
  }

  return null;
}
