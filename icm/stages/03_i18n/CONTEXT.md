# Stage 03 · Translate a Surface to PT-BR (Layer 2)

## Inputs

- L3 reference: `../../references/conventions.md` (i18n section: next-intl keys vs direct strings)
- L3 reference: `../../references/decisions.md` D-005 (defaultLocale state)
- L4 working: which surface/component(s) to translate; `apps/web/translations/pt.json` (PT-BR file)

## Process

1. **Find the English** — grep the target component(s) for visible strings: `>Text<`, `placeholder="`, `title="`, `aria-label="`, `toast(`. Exclude classNames / props / imports.
2. **Translate** — choose strategy per conventions.md:
   - Component already uses `useTranslations()` → add keys to `pt.json` (+ `en.json` to keep parity; + any other locale you want to keep in sync).
   - Hardcoded JSX → direct PT-BR string replacement (acceptable for this internal tool).
3. **Branding** — "Kortix" → "Ymagine" in user-facing copy only.
4. Ship via Stage 01 (branch → CI → deploy).

### Special case: flipping `defaultLocale = 'en'` → `'pt'`

This is its own decision (see [[decisions]] D-005). If you do flip:
1. Edit `apps/web/src/i18n/config.ts`.
2. **Verify all UI surfaces have PT-BR translations** — Suna shipped this and immediately found 4 missing sidebar keys. Grep `pt.json` for `null` / empty values; grep `en.json` for keys not in `pt.json`.
3. Check that `proxy.ts` / `middleware.ts` doesn't have hardcoded locale logic that needs updating.
4. Browser-test the locale negotiation: cookie unset → should land on `/pt/...` for fresh visitors.

## Outputs

- Edited components and/or `pt.json`; merged + deployed.

## Verify

- [ ] No visible English left in the targeted surface (re-grep)
- [ ] `pt.json` valid JSON; key parity with `en.json` if keys were added
- [ ] CI green; surface checked after deploy
- [ ] Interactive surfaces (command palette, dialogs, dropdowns) — flagged for browser confirmation
