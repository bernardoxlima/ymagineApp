"use client";

import { useCallback, useEffect, useRef } from "react";
import { getClient } from "@/lib/opencode-sdk";
import { useSyncStore } from "@/stores/opencode-sync-store";
import { useSandboxConnectionStore } from "@/stores/sandbox-connection-store";
import {
  saveSessionToIDB,
  loadSessionFromIDB,
  pruneIDBCache,
} from "@/lib/idb-sync-cache";
import type { Session } from "./use-opencode-sessions";

/** How many of the most recent root sessions get warmed in the background. */
const BACKGROUND_PREFETCH_COUNT = 10;

const prefetchedSessions = new Set<string>();
const inFlightPrefetches = new Map<string, Promise<void>>();

/**
 * Prefetch a single session's messages into the sync store + IDB cache.
 * Skips if the session is already in the sync store.
 */
export async function prefetchSession(sessionId: string): Promise<void> {
  if (useSandboxConnectionStore.getState().healthy !== true) return;
  if (prefetchedSessions.has(sessionId)) return;
  const existingPrefetch = inFlightPrefetches.get(sessionId);
  if (existingPrefetch) return existingPrefetch;

  const run = (async () => {
    const state = useSyncStore.getState();
    if (sessionId in state.messages && (state.messages[sessionId]?.length ?? 0) > 0) {
      prefetchedSessions.add(sessionId);
      return;
    }

    // Try IDB cache first
    const cached = await loadSessionFromIDB(sessionId);
    if (cached && cached.messages.length > 0) {
      const currentState = useSyncStore.getState();
      if (!(sessionId in currentState.messages) || (currentState.messages[sessionId]?.length ?? 0) === 0) {
        currentState.hydrate(
          sessionId,
          cached.messages.map((info) => ({
            info,
            parts: cached.parts[info.id] ?? [],
          })),
        );
      }
    }

    // Fetch fresh data from server in background
    try {
      const res = await getClient().session.messages({ sessionID: sessionId });
      const data = (res.data ?? []) as any[];
      if (data.length > 0) {
        useSyncStore.getState().hydrate(sessionId, data);
        const parts = useSyncStore.getState().parts;
        const msgs = useSyncStore.getState().messages[sessionId] ?? [];
        saveSessionToIDB(sessionId, msgs, parts);
      }
      prefetchedSessions.add(sessionId);
    } catch {
      // Non-critical — cache is still warm from IDB
    }
  })().finally(() => {
    inFlightPrefetches.delete(sessionId);
  });

  inFlightPrefetches.set(sessionId, run);
  return run;
}

/**
 * Reset prefetch tracking (e.g., on server switch).
 */
export function resetPrefetchState(): void {
  prefetchedSessions.clear();
  inFlightPrefetches.clear();
}

/**
 * Hook: background-prefetch top N sessions after session list loads.
 * Uses requestIdleCallback to avoid blocking UI.
 */
export function useBackgroundSessionPrefetch(sessions: Session[] | undefined) {
  useEffect(() => {
    if (!sessions || sessions.length === 0) return;
    void pruneIDBCache();
  }, [sessions]);

  // Warm the most recent root sessions during browser idle time, one at a
  // time, so clicking any of them opens with messages already in memory —
  // zero network on the click path. prefetchSession dedupes (in-flight map +
  // prefetched set) and is IDB-first, so re-runs are cheap no-ops.
  const warmedRef = useRef(false);
  const healthy = useSandboxConnectionStore((s) => s.healthy === true);
  useEffect(() => {
    if (warmedRef.current) return;
    if (!healthy || !sessions || sessions.length === 0) return;
    warmedRef.current = true;

    const top = sessions
      .filter((s) => !s.parentID)
      .slice(0, BACKGROUND_PREFETCH_COUNT);
    let cancelled = false;

    const warm = () => {
      void (async () => {
        for (const s of top) {
          if (cancelled) return;
          await prefetchSession(s.id).catch(() => {
            /* best-effort warmup */
          });
        }
      })();
    };

    const idleHandle =
      typeof window.requestIdleCallback === "function"
        ? window.requestIdleCallback(warm, { timeout: 8000 })
        : window.setTimeout(warm, 2500);

    return () => {
      cancelled = true;
      if (typeof window.cancelIdleCallback === "function") {
        window.cancelIdleCallback(idleHandle as number);
      } else {
        clearTimeout(idleHandle as number);
      }
    };
  }, [healthy, sessions]);

  const prefetchOnHover = useCallback((sessionId: string) => {
    prefetchSession(sessionId);
  }, []);

  return { prefetchOnHover };
}
