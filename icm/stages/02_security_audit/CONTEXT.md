# Stage 02 · Security Audit (Layer 2)

Pentest / security review of our own system. Authorized by definition (we own it).

## Inputs

- L3 reference: `../../references/architecture.md` (attack surface: domains, services, RPCs)
- L3 reference: `../../references/security-state.md` ⚠ (what's already fixed/pending — don't re-report knowns)
- L3 reference: `../../references/claude-failure-modes.md` §7, §10 (input-validation gaps, secret hygiene)
- L3 reference: `../../references/stack/backend.md` (alignment flags table — Drizzle CVE-2026-39356, SECURITY DEFINER `SET search_path = ''`, RLS perf-and-correctness patterns, HS256→RS256/EdDSA JWT migration)
- L3 reference: `../../references/quality-gates-and-deploy-safety.md` (§2 promotion, §6 secrets/SBOM — NIST SP 800-218 SSDF, OWASP DevSecOps)
- L4 working: scope (which surface — frontend / API / Supabase / full)

## Process

1. Invoke the **`/pentest`** skill (blackbox or graybox). Target: production hostnames (see deploy-runbook for exact URLs).
2. Skip already-known findings in security-state.md unless re-validating a fix.
3. Prove impact with a minimal PoC (no mass extraction; redact PII; never dump credentials).
4. For fixes: route through Stage 01 (branch → CI → deploy). DB-level fixes (like the RPC ownership guard) must be noted as DB-applied + added to decisions.md (they're NOT in repo migrations).

## Outputs

- `PENTEST-REPORT.md` in `pentest/<target>_<ts>/` (operator machine, gitignored area).
- Update `../../references/security-state.md`: move fixed items, add new pending ones.

## Verify

- [ ] Each finding has a reproducible PoC + impact-in-plain-language line
- [ ] Fixes verified live (e.g., anon call to a credit RPC returns 42501 — [[decisions]] D-007)
- [ ] security-state.md updated
- [ ] No real credentials/PII in any committed file ([[claude-failure-modes]] §10)
