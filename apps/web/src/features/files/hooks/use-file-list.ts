'use client';

import { useMemo } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useServerStore } from '@/stores/server-store';
import {
  readLSQueryCacheMapEntry,
  writeLSQueryCacheMapEntry,
} from '@/lib/ls-query-cache';
import { listFiles } from '../api/opencode-files';
import { useFilesStore } from '../store/files-store';
import type { FileNode } from '../types';

export const fileListKeys = {
  all: ['opencode-files', 'list'] as const,
  dir: (serverUrl: string, dirPath: string) =>
    ['opencode-files', 'list', serverUrl, dirPath] as const,
};

/**
 * Fetch the directory listing for a path on the active OpenCode server.
 *
 * Uses GET /file?path=<path> which returns FileNode[].
 * Hidden (dot) files are filtered out unless showHidden is enabled in the store.
 */
export function useFileList(
  dirPath: string,
  options?: { enabled?: boolean },
) {
  const serverUrl = useServerStore((s) => s.getActiveServerUrl());
  const urlVersion = useServerStore((s) => s.urlVersion);
  const showHidden = useFilesStore((s) => s.showHidden);

  const query = useQuery<FileNode[]>({
    queryKey: fileListKeys.dir(serverUrl, dirPath),
    queryFn: async () => {
      const nodes = await listFiles(dirPath);
      writeLSQueryCacheMapEntry('file-list', dirPath, nodes);
      return nodes;
    },
    // placeholderData only — see ls-query-cache.ts staleness note. With
    // staleTime of 5s the real listing always refetches right away; the
    // placeholder just removes the empty flash on first open of the tab.
    placeholderData: () => readLSQueryCacheMapEntry<FileNode[]>('file-list', dirPath),
    enabled: !!dirPath && options?.enabled !== false,
    staleTime: 5_000,
    gcTime: 2 * 60_000,
    refetchOnWindowFocus: false,
    retry: (failureCount, error: Error) => {
      // Don't retry on 404 (dir doesn't exist) or access denied
      if (error.message.includes('404') || error.message.includes('403')) return false;
      return failureCount < 3;
    },
    retryDelay: (attempt) => Math.min(1000 * Math.pow(2, attempt), 5000),
  });

  // Filter hidden files client-side so the cache stays complete.
  // .kortix and .opencode are always shown — they are elevated system dirs.
  const data = useMemo(() => {
    if (!query.data) return query.data;
    if (showHidden) return query.data;
    return query.data.filter(
      (node) =>
        !node.name.startsWith('.') ||
        node.name === '.kortix' ||
        node.name === '.opencode',
    );
  }, [query.data, showHidden]);

  return { ...query, data };
}

/**
 * Utility to imperatively invalidate all file list queries for the active server.
 */
export function useInvalidateFileList() {
  const queryClient = useQueryClient();
  const serverUrl = useServerStore((s) => s.getActiveServerUrl());

  return (dirPath?: string) => {
    if (dirPath) {
      queryClient.invalidateQueries({
        queryKey: fileListKeys.dir(serverUrl, dirPath),
      });
    } else {
      queryClient.invalidateQueries({
        queryKey: fileListKeys.all,
      });
    }
  };
}
