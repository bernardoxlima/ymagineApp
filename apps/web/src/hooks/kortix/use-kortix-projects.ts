/**
 * Kortix workspace compatibility hooks.
 *
 * Fetches from kortix-master's legacy /kortix/projects API through the currently
 * active sandbox route (/v1/p/.../8000/kortix/projects). This keeps Kortix
 * workspace data on the same authenticated transport path as the rest of the
 * dashboard/OpenCode APIs.
 */

import { useCallback } from 'react';
import { useQuery, useMutation, useQueryClient, keepPreviousData } from '@tanstack/react-query';
import { useServerStore } from '@/stores/server-store';
import { authenticatedFetch } from '@/lib/auth-token';
import { readLSQueryCache, writeLSQueryCache } from '@/lib/ls-query-cache';
import { useAuth } from '@/components/AuthProvider';

// ── Types ────────────────────────────────────────────────────────────────────

export interface KortixProject {
  id: string;
  name: string;
  path: string;
  description: string;
  created_at: string;
  opencode_id: string | null;
  /** 1 = legacy tasks layout, 2 = new tickets/board. */
  structure_version?: number;
  sessionCount?: number;
  // Extended properties from OpenCode Project (optional for compatibility)
  worktree?: string;
  time?: {
    created: number;
    updated: number;
    initialized?: number;
  };
}

// ── Fetch helper ─────────────────────────────────────────────────────────────

async function kortixFetch<T>(serverUrl: string, apiPath: string, init?: RequestInit): Promise<T> {
  const url = `${serverUrl.replace(/\/+$/, '')}/kortix/projects${apiPath}`;
  const res = await authenticatedFetch(url, init);
  if (!res.ok) {
    const text = await res.text().catch(() => '');
    throw new Error(`Kortix API ${res.status}: ${text.slice(0, 100)}`);
  }
  return res.json();
}

// ── Query keys ───────────────────────────────────────────────────────────────

export const kortixKeys = {
  projects: () => ['kortix', 'projects'] as const,
  project: (id: string) => ['kortix', 'projects', id] as const,
};

interface KortixProjectQueryOptions {
  enabled?: boolean;
}

// ── Hooks ────────────────────────────────────────────────────────────────────

export function useKortixProjects(_args?: undefined, options: KortixProjectQueryOptions = {}) {
  const { user, isLoading: isAuthLoading } = useAuth();
  const serverVersion = useServerStore((s) => s.serverVersion);
  const serverUrl = useServerStore((s) => s.getActiveServerUrl());
  return useQuery<KortixProject[]>({
    queryKey: [...kortixKeys.projects(), user?.id ?? 'anonymous', serverUrl, serverVersion],
    queryFn: async () => {
      const projects = await kortixFetch<KortixProject[]>(serverUrl, '');
      writeLSQueryCache('kortix-projects', projects);
      return projects;
    },
    // placeholderData only — see ls-query-cache.ts staleness note.
    placeholderData: () => readLSQueryCache<KortixProject[]>('kortix-projects'),
    enabled: !isAuthLoading && !!user && !!serverUrl && (options.enabled ?? true),
    staleTime: 30_000,
    gcTime: 5 * 60 * 1000,
    refetchOnWindowFocus: true,
    retry: 3,
    retryDelay: (attempt) => Math.min(1000 * 2 ** attempt, 10000),
  });
}

export function useKortixProject(id: string) {
  const { user, isLoading: isAuthLoading } = useAuth();
  const queryClient = useQueryClient();
  const serverVersion = useServerStore((s) => s.serverVersion);
  const serverUrl = useServerStore((s) => s.getActiveServerUrl());
  return useQuery<KortixProject>({
    queryKey: [...kortixKeys.project(id), user?.id ?? 'anonymous', serverUrl, serverVersion],
    queryFn: () => kortixFetch<KortixProject>(serverUrl, `/${encodeURIComponent(id)}`),
    enabled: !isAuthLoading && !!user && !!serverUrl && !!id,
    staleTime: 15_000,
    gcTime: 5 * 60 * 1000,
    retry: 2,
    placeholderData: (prev) => {
      // Preserve the prior keepPreviousData behavior across serverVersion bumps
      // (e.g. another tab closes) to avoid a skeleton flash.
      if (prev) return prev;
      // Otherwise seed the breadcrumb name instantly from the already-cached
      // projects LIST (warmed by the sidebar) so /tasks/[id] paints without a
      // stacked ~141ms round-trip. The mounted query still fetches & replaces,
      // so nothing goes stale.
      const list = queryClient.getQueryData<KortixProject[]>([
        ...kortixKeys.projects(),
        user?.id ?? 'anonymous',
        serverUrl,
        serverVersion,
      ]);
      return list?.find((p) => p.id === id);
    },
  });
}

/**
 * Prefetch a project's detail query on sidebar hover/focus so the click paints
 * from a warm, FRESH cache instead of a cold ~141ms round-trip (BR↔Boston).
 * Uses the EXACT same queryKey + queryFn + staleTime as useKortixProject so it
 * dedupes — a mismatched key would double-fetch (cf. the tab-bar prefetch bug).
 * Reads the server store at call time (hover is an event, not render). The
 * staleTime only guards against re-fetching on rapid re-hover; ongoing
 * freshness is governed by the mounted query, so this never serves stale data.
 */
export function usePrefetchKortixProject() {
  const qc = useQueryClient();
  const { user } = useAuth();
  return useCallback((id: string) => {
    if (!id) return;
    const store = useServerStore.getState();
    const serverUrl = store.getActiveServerUrl();
    if (!serverUrl) return;
    qc.prefetchQuery({
      queryKey: [...kortixKeys.project(id), user?.id ?? 'anonymous', serverUrl, store.serverVersion],
      queryFn: () => kortixFetch<KortixProject>(serverUrl, `/${encodeURIComponent(id)}`),
      staleTime: 15_000,
    });
  }, [qc, user?.id]);
}

export function useKortixProjectForSession(sessionId: string, options: KortixProjectQueryOptions = {}) {
  const { user, isLoading: isAuthLoading } = useAuth();
  const serverVersion = useServerStore((s) => s.serverVersion);
  const serverUrl = useServerStore((s) => s.getActiveServerUrl());
  return useQuery<KortixProject | null>({
    queryKey: ['kortix', 'projects', 'by-session', sessionId, user?.id ?? 'anonymous', serverUrl, serverVersion],
    queryFn: async () => {
      try {
        return await kortixFetch<KortixProject>(serverUrl, `/by-session/${encodeURIComponent(sessionId)}`);
      } catch {
        return null;
      }
    },
    enabled: !isAuthLoading && !!user && !!serverUrl && !!sessionId && (options.enabled ?? true),
    staleTime: 15_000,
    gcTime: 5 * 60 * 1000,
    placeholderData: keepPreviousData,
  });
}

/**
 * Fetch sessions linked to a specific project.
 * Returns OpenCode session objects enriched with title, time, etc.
 */
export function useKortixProjectSessions(
  projectId: string,
  options: KortixProjectQueryOptions & { usage?: boolean } = {},
) {
  const { user, isLoading: isAuthLoading } = useAuth();
  const serverVersion = useServerStore((s) => s.serverVersion);
  const serverUrl = useServerStore((s) => s.getActiveServerUrl());
  const wantUsage = options.usage === true;
  return useQuery<any[]>({
    queryKey: ['kortix', 'projects', projectId, 'sessions', wantUsage ? 'usage' : 'base', user?.id ?? 'anonymous', serverUrl, serverVersion],
    queryFn: () => kortixFetch<any[]>(serverUrl, `/${encodeURIComponent(projectId)}/sessions${wantUsage ? '?usage=1' : ''}`),
    enabled: !isAuthLoading && !!user && !!serverUrl && !!projectId && (options.enabled ?? true),
    staleTime: 15_000,
    gcTime: 5 * 60 * 1000,
    refetchOnWindowFocus: true,
    retry: 2,
    placeholderData: keepPreviousData,
  });
}

export function useDeleteProject() {
  const qc = useQueryClient();
  const serverUrl = useServerStore((s) => s.getActiveServerUrl());
  return useMutation({
    mutationFn: (id: string) =>
      kortixFetch<{ deleted: boolean; name: string; path: string }>(serverUrl, `/${encodeURIComponent(id)}`, {
        method: 'DELETE',
      }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: kortixKeys.projects() });
    },
  });
}

export function usePatchProject() {
  const qc = useQueryClient();
  const serverUrl = useServerStore((s) => s.getActiveServerUrl());
  return useMutation({
    mutationFn: ({ id, ...body }: { id: string; name?: string; description?: string; user_handle?: string | null }) =>
      kortixFetch<KortixProject>(serverUrl, `/${encodeURIComponent(id)}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      }),
    onSuccess: (_d, vars) => {
      qc.invalidateQueries({ queryKey: kortixKeys.project(vars.id) });
      qc.invalidateQueries({ queryKey: kortixKeys.projects() });
    },
  });
}
