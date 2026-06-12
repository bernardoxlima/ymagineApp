'use client';

import { useSandboxConnectionStore } from '@/stores/sandbox-connection-store';
import { useServerStore } from '@/stores/server-store';

/**
 * True when OpenCode data hooks may fire their queries.
 *
 * Two windows:
 *
 * 1. Confirmed — the health check passed (`status === 'connected' && healthy`).
 *
 * 2. Optimistic boot — the FIRST health check of a cold load is still in
 *    flight (`!initialCheckDone`) but this browser successfully connected to
 *    the persisted active server before (`wasConnected`). Data fetches run in
 *    parallel with the health check instead of being serialized behind it,
 *    saving a full user↔server round trip on every cold load.
 *
 * Staleness/error safety: the optimistic window self-closes when the first
 * health check completes (`initialCheckDone` latches). If that check failed,
 * `enabled` collapses to the confirmed term (false), so the eventual recovery
 * flips `enabled` false→true and React Query refetches anything the optimistic
 * window left errored or unfetched — same semantics as before this hook
 * existed. No query result is ever trusted without a fetch.
 *
 * The `hasUrl` guard keeps optimistic queries from firing before the persisted
 * server store has resolved a URL (`getClient()` throws on an empty URL).
 */
export function useOpenCodeRuntimeReady(): boolean {
  const hasUrl = useServerStore((s) => !!s.getActiveServerUrl());
  return useSandboxConnectionStore(
    (s) =>
      (s.status === 'connected' && s.healthy === true) ||
      (hasUrl && s.status === 'connecting' && s.wasConnected && !s.initialCheckDone),
  );
}
