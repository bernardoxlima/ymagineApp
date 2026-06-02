-- Revoke EXECUTE on all billing RPCs from public DB roles (anon + authenticated).
-- These functions MUST only be callable by the service_role (backend API), never
-- by end-user clients via PostgREST. Pentest 2026-06-02 confirmed that the
-- authenticated role could execute atomic_use_credits and atomic_daily_credit_refresh
-- directly via supabase.ymagine.app/rest/v1/rpc/* — bypassing the application-layer
-- billing_disabled flag entirely.
--
-- Reference: PENTEST-REPORT.md PT-001/PT-002 (Critical).
-- Exact signatures required by PostgreSQL for REVOKE on overloaded functions.

REVOKE EXECUTE ON FUNCTION public.atomic_use_credits(
    UUID, NUMERIC, TEXT, TEXT, TEXT
) FROM anon, authenticated;

REVOKE EXECUTE ON FUNCTION public.atomic_add_credits(
    UUID, NUMERIC, BOOLEAN, TEXT, TIMESTAMPTZ, TEXT, TEXT, TEXT
) FROM anon, authenticated;

REVOKE EXECUTE ON FUNCTION public.atomic_reset_expiring_credits(
    UUID, NUMERIC, TEXT, TEXT
) FROM anon, authenticated;

REVOKE EXECUTE ON FUNCTION public.atomic_grant_renewal_credits(
    UUID, BIGINT, BIGINT, NUMERIC, TEXT, TEXT, TEXT
) FROM anon, authenticated;

REVOKE EXECUTE ON FUNCTION public.atomic_daily_credit_refresh(
    UUID, NUMERIC, TEXT, TEXT, INTEGER
) FROM anon, authenticated;

-- Explicit grant to service_role only (belt-and-suspenders; service_role
-- already has EXECUTE on everything by default in Supabase, but being explicit
-- documents the intent and survives any future policy reset).
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
