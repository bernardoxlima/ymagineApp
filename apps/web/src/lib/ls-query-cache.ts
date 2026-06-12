/**
 * localStorage-backed paint cache for React Query hooks.
 *
 * Purpose: let hot screens paint their last-known content INSTANTLY on cold
 * load / first tab open while the real fetch runs — the server is a full
 * Atlantic round-trip away, so "stale content + background refetch" beats
 * a loader every time.
 *
 * ── Staleness safety (the "stuck until F5" trap) ──────────────────────────
 * Values read from here must ONLY ever be passed to React Query's
 * `placeholderData`. Placeholder data is observer-level: it is NOT written to
 * the query cache and does NOT mark the query as fresh, so the query still
 * fires its real fetch immediately on first mount, and fresh data replaces
 * the placeholder the moment it lands. NEVER pass these values to
 * `initialData` — initialData seeds the cache as real data, and combined with
 * `staleTime: Infinity` (common in this codebase) it would suppress the real
 * fetch entirely, leaving the UI stale until a hard refresh.
 *
 * Keys are scoped by the active server id so an instance switch never paints
 * another workspace's data.
 */

import { useServerStore } from '@/stores/server-store';

const PREFIX = 'kortix_qcache';

function scopedKey(key: string): string {
  let serverId = 'default';
  try {
    serverId = useServerStore.getState().activeServerId || 'default';
  } catch {
    /* store not ready (SSR) — fall through */
  }
  return `${PREFIX}:${key}:${serverId}`;
}

export function readLSQueryCache<T>(key: string): T | undefined {
  if (typeof window === 'undefined') return undefined;
  try {
    const raw = localStorage.getItem(scopedKey(key));
    if (!raw) return undefined;
    return JSON.parse(raw) as T;
  } catch {
    return undefined;
  }
}

export function writeLSQueryCache(key: string, value: unknown): void {
  if (typeof window === 'undefined') return;
  const storageKey = scopedKey(key);
  let raw: string;
  try {
    raw = JSON.stringify(value);
  } catch {
    return; // non-serializable — skip silently
  }
  try {
    localStorage.setItem(storageKey, raw);
  } catch {
    // Quota exceeded — evict our own cache entries and retry once. Never
    // touch keys outside our prefix.
    try {
      for (let i = localStorage.length - 1; i >= 0; i--) {
        const k = localStorage.key(i);
        if (k && k.startsWith(`${PREFIX}:`)) localStorage.removeItem(k);
      }
      localStorage.setItem(storageKey, raw);
    } catch {
      /* still failing — give up, cache is best-effort */
    }
  }
}

// ── Bounded map variant (e.g. directory listings keyed by path) ────────────

interface LSCacheMap<T> {
  order: string[];
  entries: Record<string, T>;
}

export function readLSQueryCacheMapEntry<T>(key: string, field: string): T | undefined {
  const map = readLSQueryCache<LSCacheMap<T>>(key);
  return map?.entries?.[field];
}

/** FIFO-bounded map write — keeps at most `maxEntries` fields per key. */
export function writeLSQueryCacheMapEntry<T>(
  key: string,
  field: string,
  value: T,
  maxEntries = 24,
): void {
  const map = readLSQueryCache<LSCacheMap<T>>(key) ?? { order: [], entries: {} };
  if (!(field in map.entries)) {
    map.order.push(field);
    while (map.order.length > maxEntries) {
      const evicted = map.order.shift();
      if (evicted !== undefined) delete map.entries[evicted];
    }
  }
  map.entries[field] = value;
  writeLSQueryCache(key, map);
}
