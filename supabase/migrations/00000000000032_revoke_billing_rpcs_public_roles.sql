-- Revoke EXECUTE on all billing RPCs from public DB roles.
-- These functions MUST only be callable by service_role (backend API).
--
-- Root cause: PostgreSQL grants EXECUTE to PUBLIC by default on CREATE FUNCTION.
-- Revoking only from anon/authenticated is insufficient — they inherit via PUBLIC.
-- We must REVOKE FROM PUBLIC first, then re-grant explicitly to service_role.
--
-- Reference: PENTEST-REPORT.md PT-001/PT-002 (Critical).
-- Verified 2026-06-02: PUBLIC had EXECUTE on all 5 functions.

REVOKE EXECUTE ON FUNCTION public.atomic_use_credits(
    UUID, NUMERIC, TEXT, TEXT, TEXT
) FROM PUBLIC, anon, authenticated;

REVOKE EXECUTE ON FUNCTION public.atomic_add_credits(
    UUID, NUMERIC, BOOLEAN, TEXT, TIMESTAMPTZ, TEXT, TEXT, TEXT
) FROM PUBLIC, anon, authenticated;

REVOKE EXECUTE ON FUNCTION public.atomic_reset_expiring_credits(
    UUID, NUMERIC, TEXT, TEXT
) FROM PUBLIC, anon, authenticated;

REVOKE EXECUTE ON FUNCTION public.atomic_grant_renewal_credits(
    UUID, BIGINT, BIGINT, NUMERIC, TEXT, TEXT, TEXT
) FROM PUBLIC, anon, authenticated;

REVOKE EXECUTE ON FUNCTION public.atomic_daily_credit_refresh(
    UUID, NUMERIC, TEXT, TEXT, INTEGER
) FROM PUBLIC, anon, authenticated;

-- Re-grant explicitly to service_role (backend) and postgres (admin).
GRANT EXECUTE ON FUNCTION public.atomic_use_credits(UUID, NUMERIC, TEXT, TEXT, TEXT)
    TO service_role;
GRANT EXECUTE ON FUNCTION public.atomic_add_credits(UUID, NUMERIC, BOOLEAN, TEXT, TIMESTAMPTZ, TEXT, TEXT, TEXT)
    TO service_role;
GRANT EXECUTE ON FUNCTION public.atomic_reset_expiring_credits(UUID, NUMERIC, TEXT, TEXT)
    TO service_role;
GRANT EXECUTE ON FUNCTION public.atomic_grant_renewal_credits(UUID, BIGINT, BIGINT, NUMERIC, TEXT, TEXT, TEXT)
    TO service_role;
GRANT EXECUTE ON FUNCTION public.atomic_daily_credit_refresh(UUID, NUMERIC, TEXT, TEXT, INTEGER)
    TO service_role;
