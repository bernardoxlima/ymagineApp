'use client';

import { useQuery } from '@tanstack/react-query';
import { readLSQueryCache, writeLSQueryCache } from '@/lib/ls-query-cache';
import { listSkills } from '../api/skills-api';
import type { Skill } from '../types';

// ---------------------------------------------------------------------------
// Query keys
// ---------------------------------------------------------------------------

export const skillsKeys = {
  all: ['opencode', 'skills'] as const,
};

// ---------------------------------------------------------------------------
// Hook
// ---------------------------------------------------------------------------

/**
 * Fetch all available skills from the OpenCode server.
 *
 * This replaces the old `useOpenCodeSkills` hook from use-opencode-sessions.ts
 * with a feature-scoped version that uses the same query key so the cache
 * stays unified.
 */
export function useSkills() {
  return useQuery<Skill[]>({
    queryKey: skillsKeys.all,
    queryFn: async () => {
      const skills = await listSkills();
      writeLSQueryCache('skills', skills);
      return skills;
    },
    // placeholderData only — see ls-query-cache.ts staleness note. Shares the
    // 'skills' LS key with useOpenCodeSkills (same query key, same payload).
    placeholderData: () => readLSQueryCache<Skill[]>('skills'),
    staleTime: 5 * 60 * 1000,
    gcTime: 10 * 60 * 1000,
  });
}
