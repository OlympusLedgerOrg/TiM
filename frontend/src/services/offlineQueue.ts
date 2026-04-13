/**
 * Offline Queue — Resilient action queue for factory floor use
 *
 * Factory WiFi is unreliable. This module:
 *  1. Caches the current work order + BOM in localStorage
 *  2. Queues consume/produce actions when offline
 *  3. Syncs queued actions when connectivity returns
 *  4. Provides online/offline status
 *
 * Workers can keep working even when the network drops.
 */

// ─── Types ────────────────────────────────────────────────────────────────────

export interface QueuedAction {
  id: string;
  type: 'consume' | 'produce';
  payload: Record<string, unknown>;
  createdAt: string;
  retries: number;
}

type SyncCallback = (action: QueuedAction) => Promise<void>;

// ─── Storage Keys ─────────────────────────────────────────────────────────────

const QUEUE_KEY = 'tim_offline_queue';
const CACHE_PREFIX = 'tim_cache_';

// ─── Online/Offline Detection ─────────────────────────────────────────────────

let _online = navigator.onLine;
const _listeners: Set<(online: boolean) => void> = new Set();

if (typeof window !== 'undefined') {
  window.addEventListener('online', () => {
    _online = true;
    _listeners.forEach(fn => fn(true));
  });
  window.addEventListener('offline', () => {
    _online = false;
    _listeners.forEach(fn => fn(false));
  });
}

export function isOnline(): boolean {
  return _online;
}

export function onConnectivityChange(listener: (online: boolean) => void): () => void {
  _listeners.add(listener);
  return () => { _listeners.delete(listener); };
}

// ─── Cache ────────────────────────────────────────────────────────────────────

export function cacheData(key: string, data: unknown): void {
  try {
    localStorage.setItem(CACHE_PREFIX + key, JSON.stringify({
      data,
      cachedAt: new Date().toISOString(),
    }));
  } catch {
    // Storage full — non-critical
  }
}

export function getCachedData<T>(key: string): { data: T; cachedAt: string } | null {
  try {
    const raw = localStorage.getItem(CACHE_PREFIX + key);
    if (!raw) return null;
    return JSON.parse(raw);
  } catch {
    return null;
  }
}

// ─── Action Queue ─────────────────────────────────────────────────────────────

function getQueue(): QueuedAction[] {
  try {
    const raw = localStorage.getItem(QUEUE_KEY);
    return raw ? JSON.parse(raw) : [];
  } catch {
    return [];
  }
}

function saveQueue(queue: QueuedAction[]): void {
  try {
    localStorage.setItem(QUEUE_KEY, JSON.stringify(queue));
  } catch {
    // Storage full — non-critical
  }
}

export function enqueueAction(type: 'consume' | 'produce', payload: Record<string, unknown>): QueuedAction {
  const id = typeof crypto !== "undefined" && crypto.randomUUID
    ? crypto.randomUUID()
    : `${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;
  const action: QueuedAction = {
    id,
    type,
    payload,
    createdAt: new Date().toISOString(),
    retries: 0,
  };
  const queue = getQueue();
  queue.push(action);
  saveQueue(queue);
  return action;
}

export function getQueuedActions(): QueuedAction[] {
  return getQueue();
}

export function removeAction(id: string): void {
  const queue = getQueue().filter(a => a.id !== id);
  saveQueue(queue);
}

export function getQueueSize(): number {
  return getQueue().length;
}

/**
 * Flush the offline queue — attempt to sync all queued actions.
 * Returns the number of successfully synced actions.
 */
export async function flushQueue(syncFn: SyncCallback): Promise<number> {
  const queue = getQueue();
  if (queue.length === 0) return 0;

  let synced = 0;
  const remaining: QueuedAction[] = [];

  for (const action of queue) {
    try {
      await syncFn(action);
      synced++;
    } catch {
      action.retries++;
      if (action.retries < 5) {
        remaining.push(action);
      }
      // Drop after 5 retries
    }
  }

  saveQueue(remaining);
  return synced;
}
