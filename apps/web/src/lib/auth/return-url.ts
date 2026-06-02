// Post-auth landing goes straight to the app. Middleware/client sandbox
// resolution will use the active instance cookie when present, or register the
// primary workspace without forcing the full workspace picker first.
const DEFAULT_AUTH_RETURN_URL = '/dashboard';

export function sanitizeAuthReturnUrl(
  value?: string | null,
  fallback = DEFAULT_AUTH_RETURN_URL,
): string {
  if (!value) return fallback;

  const trimmedValue = value.trim();

  // Must be a relative path: starts with '/' but not '//' (protocol-relative)
  // and not '/\' (some parsers treat as absolute on Windows/IE).
  if (!trimmedValue.startsWith('/') || trimmedValue.startsWith('//') || trimmedValue.startsWith('/\\')) {
    return fallback;
  }

  // Reject URL-encoded protocol-relative attempts (%2F%2F, %2F%5C)
  const lower = trimmedValue.toLowerCase();
  if (lower.includes('%2f%2f') || lower.includes('%2f%5c')) {
    return fallback;
  }

  return trimmedValue;
}

export { DEFAULT_AUTH_RETURN_URL };
