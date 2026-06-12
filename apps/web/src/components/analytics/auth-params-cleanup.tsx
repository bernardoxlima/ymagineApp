'use client';

import { useEffect } from 'react';
import { useSearchParams, usePathname } from 'next/navigation';

/**
 * Strips the `auth_event` / `auth_method` query params that the auth page
 * appends after OAuth / magic-link redirects.
 *
 * These params used to feed GTM sign_up/login events (tracking removed —
 * self-hosted internal deployment). The URL cleanup must stay: without it the
 * params linger in the address bar and end up in copied/bookmarked URLs.
 */
export function AuthParamsCleanup() {
  const searchParams = useSearchParams();
  const pathname = usePathname();

  useEffect(() => {
    const authEvent = searchParams?.get('auth_event');
    const authMethod = searchParams?.get('auth_method');
    if (!authEvent && !authMethod) return;

    const params = new URLSearchParams(searchParams?.toString() || '');
    params.delete('auth_event');
    params.delete('auth_method');

    const newUrl = params.toString()
      ? `${pathname}?${params.toString()}`
      : pathname;

    // Replace URL without triggering navigation
    window.history.replaceState({}, '', newUrl);
  }, [searchParams, pathname]);

  return null;
}
