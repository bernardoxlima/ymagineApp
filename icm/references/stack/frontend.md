# Frontend Best Practices — ymagineApp (Kortix Fork)

> **Scope.** This is an L3 ICM reference compiled exclusively from official documentation for the exact pinned versions in `apps/web/package.json`. Anything contested or thin in primary sources is flagged as such. Do NOT push patterns from newer/older versions than listed here.

## Stack inventory (authoritative)

| Tech | Pinned version | Doc baseline used |
|------|---------------|------------------|
| Next.js | 15.5.14 | `nextjs.org/docs/15/*` (v15.5.18 doc set) |
| React / React DOM | ^18 | `react.dev` (React 18) |
| Tailwind CSS | ^4 | `tailwindcss.com/docs` (v4) |
| Radix UI | individual `@radix-ui/react-*` ^1.x / ^2.x | `radix-ui.com/primitives` |
| shadcn/ui | components.json `style: "new-york"`, `baseColor: "neutral"`, `iconLibrary: "lucide"` | `ui.shadcn.com/docs` |
| next-intl | ^4.5.3 | `next-intl.dev/docs` (v4) |
| TanStack Query | ^5.75 | `tanstack.com/query/v5` |
| @sentry/nextjs | ^10.47 | `docs.sentry.io/platforms/javascript/guides/nextjs` |
| @logtail/next | ^0.3.1 | `betterstack.com/docs/logs/javascript/nextjs` |
| konva / react-konva | ^9.3 / ^19.2 | `konvajs.org`, `github.com/konvajs/react-konva` |
| fumadocs-{core,ui,mdx} | 15.8.5 / 11.10.1 | `fumadocs.dev/docs/mdx` |
| Geist (font) | ^1.2.1 | `vercel.com/font` |
| cmdk | ^0.2.1 | `github.com/pacocoursey/cmdk` |
| lucide-react | ^0.479 | `lucide.dev` |
| Node / pnpm | 22 / 8.15.8 | — |

---

## Next.js 15.5.14

**Core idioms**

- App Router default: layouts and pages are **Server Components** until `'use client'` is added. Use Server Components for data fetching, secrets, and DB calls; use Client Components only for state, effects, browser APIs, and custom hooks ([docs](https://nextjs.org/docs/app/getting-started/server-and-client-components)).
- **All dynamic Request APIs are async in 15** — must `await cookies()`, `await headers()`, `await draftMode()`, `await params`, `await searchParams`. The synchronous form still works but logs a deprecation warning and is removed in Next 16 ([upgrade guide](https://nextjs.org/docs/app/guides/upgrading/version-15)).
- **fetch is uncached by default** in Next 15 — opt in per call with `fetch(url, { cache: 'force-cache' })` or per segment with `export const fetchCache = 'default-cache'`. **GET Route Handlers are also uncached by default** — opt in with `export const dynamic = 'force-static'` ([upgrade guide](https://nextjs.org/docs/app/guides/upgrading/version-15)).
- `connection()` from `next/server` is the **stable replacement for `unstable_noStore`** as of 15.0 — call `await connection()` at the top of a Server Component to force runtime evaluation so `process.env` is read at request time (critical for Docker runtime env) ([connection ref](https://nextjs.org/docs/15/app/api-reference/functions/connection)).
- `'use client'` declares a boundary, not per-file. Everything imported into a Client Component becomes part of the client bundle; Server Components passed as `children`/props are NOT pulled in ([docs](https://nextjs.org/docs/app/getting-started/server-and-client-components)).

**Pitfalls (official docs warn)**

- Synchronous access to `cookies()/headers()/params/searchParams` is deprecated and will be removed in Next 16. The temporary `UnsafeUnwrappedCookies/Headers/DraftMode` types let you delay migration but emit dev warnings.
- "Don't pass entire DB rows from Server Components to Client Components" — the docs explicitly call out the leak pattern of `<Profile user={userData} />` where Server Component fetches all columns ([data security](https://nextjs.org/docs/15/app/guides/data-security)).
- "Mutations (logging out, updating DB, invalidating caches) must never be side-effects during rendering." Next.js explicitly blocks `cookies().delete()` and revalidation inside render. Use Server Actions ([data security](https://nextjs.org/docs/15/app/guides/data-security)).
- Provider components should be rendered **as deep as possible** — wrap only `{children}` in `ThemeProvider` etc., not the entire `<html>` document, to keep more of the tree statically optimizable.
- Don't directly import Client-only third-party libraries into a Server Component. Wrap them in your own Client Component that re-exports.

**Performance**

- Use `<Suspense>` boundaries to stream uncached data. `loading.tsx` auto-wraps a route segment in `<Suspense>` ([fetching data](https://nextjs.org/docs/app/getting-started/fetching-data)).
- A layout that calls uncached APIs (`cookies()`, uncached fetch) BLOCKS navigation rather than falling back to its own `loading.tsx`. Push the uncached access into `page.tsx` OR wrap in a deeper `<Suspense>`.
- **Parallel fetching pattern**: kick off requests then `Promise.all([a, b])`. Sequential `await`s in the same component serialize them.
- `experimental.optimizePackageImports` already auto-includes `lucide-react`, `date-fns`, `recharts`, `react-icons/*` by default in Next 15 — listing them again is redundant but harmless ([ref](https://nextjs.org/docs/15/app/api-reference/config/next-config-js/optimizePackageImports)).
- `React.cache()` wraps a fetch function so multiple Server Components within the same request share one in-memory result ([fetching data](https://nextjs.org/docs/app/getting-started/fetching-data)).

**Security**

- Recommended structure: a **Data Access Layer** that imports `server-only`, does authz checks, and returns minimal DTOs. Audit checklist explicitly: are `"use client"` props overly broad? Are `"use server"` args re-validated?
- Server Actions are **public HTTP endpoints** — re-auth inside every action; never trust closure values without re-validation.
- Server Actions encrypt closure variables per build. For multi-instance self-hosted deployments, set `NEXT_SERVER_ACTIONS_ENCRYPTION_KEY` (AES-GCM).
- Server Actions auto-compare `Origin` to `Host`; for reverse-proxy setups configure `experimental.serverActions.allowedOrigins`.
- `NEXT_PUBLIC_*` env vars are inlined at build into the client bundle. Anything else stays server-only — but the docs warn this is "additional layer" only; sanitize at the DAL.
- Use `experimental_taintObjectReference` / `experimental_taintUniqueValue` (gated by `experimental.taint: true`) as a belt-and-braces guard against leaking server data into RSC props.

**Version-specific (15.5.14)**

- **Node.js middleware runtime is stable** in 15.5 (`export const config = { runtime: 'nodejs' }`) ([15.5 blog](https://nextjs.org/blog/next-15-5)).
- **Turbopack production builds are beta** in 15.5 (`next build --turbopack`). ymagineApp currently runs dev with `--turbopack` but Webpack for build — that's the safe choice.
- **Typed Routes stable**, opt in via `typedRoutes: true` in `next.config.ts`.
- `next typegen` command added for standalone type generation outside `dev/build`.
- **15.5 deprecation warnings for Next 16**: `legacyBehavior` on `next/link`, AMP support, `<Image quality>` other than 75 without `images.qualities`, local image `src` with query strings without `images.localPatterns`. The `images.qualities: [75, 100]` is already present in `next.config.ts` — good.
- `next lint` is deprecated in 15.5; migrate to `eslint` directly with `next-lint-to-eslint-cli` codemod.
- Client Cache for page segments: page segments are NOT reused on `<Link>`/`router.push` navigation by default — only on back/forward. Opt in with `experimental.staleTimes`.
- `geo` / `ip` removed from `NextRequest` — use hosting provider's helpers.
- **error.tsx props in 15** are `{ error, reset }` (NOT `unstable_retry` — that's Next 16.2+) ([15-pinned error ref](https://nextjs.org/docs/15/app/api-reference/file-conventions/error)).
- `middleware.ts` is still the convention in 15 ([15.5 docs/proxy](https://nextjs.org/docs/app/api-reference/file-conventions/middleware)) — it's renamed to `proxy.ts` only in Next 16. **Do NOT rename in this codebase** until a deliberate Next 16 upgrade.

**Compatibility cliffs**

- React 19 is the minimum supported React version per the 15 upgrade guide, but Next 15 in practice runs on React 18 (which this app is on). The Next 15.5.x line is the last expected stable home for React 18; verify before any Next 16 jump.
- `useFormState`, `useActionState`, `useOptimistic`, `use()` are React 19 hooks — **do not use them** in this codebase.
- `experimental.bundlePagesExternals` → `bundlePagesRouterDependencies` (renamed). `experimental.serverComponentsExternalPackages` → `serverExternalPackages`.
- `@next/font` removed; use `next/font` only.

**ymagineApp-specific**

- `output: 'standalone'` + `outputFileTracingRoot: ../../` is correct for the pnpm workspace ([output ref](https://nextjs.org/docs/15/app/api-reference/config/next-config-js/output)). Standalone emits `apps/web/server.js` and trims `node_modules`. Native deps that aren't traced (e.g. `sharp`, `canvas`) need `outputFileTracingIncludes`.
- `typescript: { ignoreBuildErrors: true }` is a deliberate trade-off — `pnpm typecheck` in CI is the gate. Don't rely on `next build` to surface type errors locally.
- `await connection()` is called at the top of `src/app/layout.tsx` to force runtime env evaluation. Any new server component or layout that reads runtime-injected `process.env` (e.g. Docker-injected `SUPABASE_URL`) needs the same.
- Sentry tunnel at `/monitoring` is excluded from middleware matcher and `_betterstack` is also excluded — keep both excluded when adding new matcher logic.
- `/v1/*` rewrites to `http://localhost:8008/v1/*` for local dev to avoid CORS. This is a **dev-mode convenience** baked into config; the rewrite always runs but is harmless in prod if the backend host is unreachable. Don't remove without confirming prod ingress.
- CSP `frame-ancestors 'self'` + `X-Frame-Options: SAMEORIGIN` — when embedding (Stripe, Cal.com, etc.) requires headers updates per-route, scope via `source` matcher.
- `compress: true` works with `output: 'standalone'` only when the embedded server handles compression; behind nginx/cloudflare, prefer the proxy.
- The middleware proxies to runtime-resolved `SUPABASE_SERVER_URL` for in-Docker network access; keep this pattern in any new server-side Supabase client creation.

**Sources**
- https://nextjs.org/docs/15/app
- https://nextjs.org/blog/next-15-5
- https://nextjs.org/docs/app/guides/upgrading/version-15
- https://nextjs.org/docs/15/app/guides/data-security
- https://nextjs.org/docs/15/app/api-reference/file-conventions/error
- https://nextjs.org/docs/15/app/api-reference/file-conventions/middleware
- https://nextjs.org/docs/15/app/api-reference/functions/connection
- https://nextjs.org/docs/15/app/api-reference/config/next-config-js/output
- https://nextjs.org/docs/15/app/api-reference/config/next-config-js/turbopack
- https://nextjs.org/docs/15/app/api-reference/config/next-config-js/optimizePackageImports

---

## React 18.x

**Core idioms**

- Stable hooks (this version): `useState`, `useReducer`, `useContext`, `useRef`, `useImperativeHandle`, `useEffect`, `useLayoutEffect`, `useInsertionEffect`, `useMemo`, `useCallback`, `useTransition`, `useDeferredValue`, `useId`, `useDebugValue`, `useSyncExternalStore` ([React 18 hooks ref](https://react.dev/reference/react/hooks)).
- Initialize per-request/per-mount state with the lazy initializer of `useState(() => ...)` to avoid recreating expensive objects (e.g. `QueryClient`).
- Use `useSyncExternalStore` when wrapping non-React stores (Zustand internally uses this pattern) to be concurrent-mode safe.

**Pitfalls (official docs warn)**

- Strict Mode in React 18 double-invokes effects in development to surface unmount/remount bugs — treat effects as idempotent.
- Mutations in render are forbidden (also reinforced in Next.js data security docs).
- Do not call hooks conditionally or in loops — Rules of Hooks.

**Performance**

- `useTransition` for non-blocking state updates (e.g. expensive filter/search updates) and `useDeferredValue` for derived UI without spinners.
- `useMemo`/`useCallback` only when the derived value is referenced by a stable comparator (memoized child, dependency array of another hook). Otherwise it adds work.

**Security**

- React 18 does NOT have built-in form Actions / server functions — those are React 19. Form submissions in this codebase must go through Next.js Server Actions OR Route Handlers, NOT via the React 18 `useFormState`/`useActionState` API.

**Version-specific (18.x)**

- The `use()` API (read a promise inline), `useActionState`, `useOptimistic`, and `useFormStatus` enhancements are **React 19 only**. **Do not add code paths that depend on them.**
- `useFormState` exists in React 18 but only as the early `react-dom` form-state API — limited and not the React 19 `useActionState`.

**Compatibility cliffs**

- `@types/react` and `@types/react-dom` must stay at `^18` — bumping types alone to v19 will surface incorrect signatures in IDEs.
- `react-konva@^19` is named for the *Konva* major (it tracks `react`-side API loosely), but its package.json peer dep should be checked when bumping React — verify peerDependency in the lockfile after any bump.
- `cmdk@0.2.1` is the **last cmdk version that targets React 18 only** (the FAQ explicitly says "React 18 safe? Yes, required"). cmdk 1.x targets React 19. Do NOT bump cmdk.
- `geist@1.2.1` font package is the pre-React-19 line; bumping requires re-validating peer deps.

**ymagineApp-specific**

- React Server Components ARE supported in React 18 + Next 15 (the RSC implementation lives in Next.js, not in React itself).
- For form submissions, prefer Server Actions called via `<form action={action}>` and `useFormStatus()` from `react-dom` (the React 18 version, which exposes only `pending`).
- For data inserted into the document head (analytics scripts in `app/layout.tsx`), the pattern is `dangerouslySetInnerHTML` + Suspense-wrapped lazy components — already in place.

**Sources**
- https://react.dev/reference/react/hooks
- https://react.dev/reference/react/useTransition
- https://react.dev/reference/react/useSyncExternalStore
- https://react.dev/learn/passing-data-deeply-with-context

---

## Tailwind CSS 4

**Core idioms**

- **CSS-first config**: import with `@import "tailwindcss";` — replaces v3 `@tailwind base/components/utilities` ([install](https://tailwindcss.com/docs/installation/using-postcss)).
- Theme values are CSS custom properties under `@theme { ... }`. ymagineApp uses `@theme inline { ... }` to bind tokens that resolve via `var(--background)` etc.
- New CSS directives: `@theme`, `@source`, `@plugin`, `@custom-variant`, `@utility`. `@source "../node_modules/streamdown/dist/*.js"` explicitly scans 3rd-party packages.
- PostCSS plugin: `@tailwindcss/postcss` (NOT `tailwindcss` as the postcss plugin — that's v3).
- Use opacity modifier slash syntax: `bg-black/50` (not `bg-opacity-50`).
- Use `data-slot` attributes (shadcn v4 pattern) to target shadcn primitives.

**Pitfalls (official docs warn)**

- The default border color is `currentColor` in v4 (was `gray-200` in v3). Always specify `border-{color}` when adding `border`.
- Default ring width is **1px** in v4 (was 3px in v3); use `ring-3` to keep v3 visuals.
- `transform-none` removed — reset individual transforms (`scale-none`, etc.).
- Mobile hover is gated by `@media (hover: hover)` — treat hover as enhancement on touch devices.
- `space-y-*` and `divide-y-*` selectors changed to `:not(:last-child)` margin-bottom — can break inline elements; prefer flex/grid + `gap`.
- The `theme()` function is removed for CSS; use `var(--color-red-500)` directly. Still usable inside `@media (width >= theme(--breakpoint-xl))`.
- Variant stacking order reversed to left-to-right: v3 `first:*:pt-0` → v4 `*:first:pt-0`.
- Arbitrary values: spaces must be `_` not `,` — `grid-cols-[max-content_auto]`.
- `tailwindcss-animate` superseded by `tw-animate-css` (in this repo's devDependencies); shadcn v4 components depend on `tw-animate-css` ([shadcn v4](https://ui.shadcn.com/docs/tailwind-v4)).

**Performance**

- v4's CSS-first build produces smaller output and faster compile due to single-pass + no JS config eval.
- Use `@source` to add only the directories that need scanning; avoid `**/*` at repo root (per the next.js output guide's general advice on tracing — same principle).

**Security**

- `oklch()` colors in `globals.css` — modern browsers only. v4 minimum browsers: Safari 16.4+, Chrome 111+, Firefox 128+. Tailwind v3.4 is the fallback for older targets.
- No specific Tailwind-side security warnings beyond not injecting unescaped user input into class names.

**Version-specific (v4)**

- `tailwind.config.js` is NOT auto-detected. shadcn's `components.json` correctly leaves `"config": ""` empty for v4.
- `@layer utilities` block replaced by `@utility name { ... }` for custom utilities.
- `@apply` inside CSS modules / Vue SFCs requires `@reference "../app.css"`.
- `theme(colors.red.500)` → `var(--color-red-500)`.
- `shadow-sm` → `shadow-xs` and `shadow` → `shadow-sm` (renamed shadow scale).
- `rounded-sm` → `rounded-xs`.
- `outline-none` → `outline-hidden`.
- `flex-shrink-*` → `shrink-*`, `flex-grow-*` → `grow-*`.

**Compatibility cliffs**

- shadcn/ui new components install in v4 mode only — old v3 component files still work but won't pick up v4 token model unless you migrate.
- Plugin authoring: v3 JS plugins still loadable via `@plugin "..."` — but the recommendation is CSS-first.

**ymagineApp-specific**

- `globals.css` already does the v4 setup correctly: `@import 'tailwindcss'`, plus `@plugin 'tailwind-scrollbar'`, `@plugin 'tailwind-scrollbar-hide'`, `@source` for streamdown + fumadocs-ui, `@custom-variant dark (&:where(.dark, .dark *))`, `@theme inline { ... }`. Keep this shape.
- `oklch()` is used throughout — the fumadocs theme overrides also use `oklch`. No need to backport `hsl()`.
- Font CSS variables: `--font-roobert` and `--font-roobert-mono` bound to `--font-sans` / `--font-mono` via `@theme inline`. New shadcn components that reference `font-sans` will pick this up automatically.
- Do NOT add `tailwindcss-animate` — `tw-animate-css` is the v4 replacement and already installed.
- Do NOT add a `tailwind.config.ts` to re-enable JS config; new utilities go in CSS via `@utility` or `@layer utilities`.

**Sources**
- https://tailwindcss.com/docs/installation/using-postcss
- https://tailwindcss.com/docs/upgrade-guide
- https://tailwindcss.com/docs/functions-and-directives

---

## Radix UI Primitives (individual `@radix-ui/react-*`)

**Core idioms**

- WAI-ARIA-conformant primitives: focus management, keyboard nav, aria/role wiring are handled internally ([overview](https://www.radix-ui.com/primitives/docs/overview/introduction)).
- Uncontrolled by default; pass `value` + `onValueChange` for controlled mode.
- `asChild` prop slots the primitive onto the consumer's element (e.g. `<DropdownMenu.Trigger asChild><Button /></DropdownMenu.Trigger>`).

**Pitfalls (official docs warn)**

- Radix primitives are Client Components — they use refs, effects, and portals. Files importing them need `'use client'` (or sit inside a Client boundary).
- When using `asChild`, the child must accept and forward `ref` — for shadcn v4 components this is handled because they migrated off `React.forwardRef` to direct `React.ComponentProps` patterns.
- Don't double-wrap accessibility ARIA — Radix already sets `role`, `aria-*`. Override only if you know why.

**Performance**

- Radix uses portals for menus/popovers; the portal mounts on first open — first render is cheap, but the dialog/portal nodes stay mounted until unmounted by the parent.

**Security**

- No direct security guidance from Radix docs — the surface is UI primitive only.

**Version-specific (individual `@radix-ui/react-*` 1.x/2.x)**

- shadcn/ui v4 components use these primitives directly. The `radix-ui` umbrella package (`^1.4.3`) is also installed and works alongside individual packages — prefer the individual packages for code-mod-friendly tree shaking unless specifically importing a bundled API.

**Compatibility cliffs**

- Radix primitives currently support React 18 cleanly. Individual package versions track their own semver; major bumps occasionally change `asChild` semantics or move from `forwardRef` to `ComponentProps`.

**ymagineApp-specific**

- The codebase uses individual `@radix-ui/react-*` packages — keep that pattern for shadcn-style components.
- `@radix-ui/react-use-controllable-state` is also installed; reuse it for any custom controlled/uncontrolled component rather than rolling your own.

**Sources**
- https://www.radix-ui.com/primitives/docs/overview/introduction
- https://www.radix-ui.com/primitives/docs/guides/composition

---

## shadcn/ui (components.json: new-york, baseColor neutral, Tailwind v4)

**Core idioms**

- `components.json` keys: `style` (`new-york` only — `default` is deprecated), `rsc: true` (CLI injects `'use client'` where needed), `tsx: true`, `tailwind.cssVariables: true`, `baseColor: "neutral"`, `iconLibrary: "lucide"` ([components.json schema](https://ui.shadcn.com/docs/components-json)).
- For Tailwind v4 leave `tailwind.config: ""` — already the case here.
- `aliases` point to `@/components`, `@/components/ui`, `@/lib`, `@/lib/utils`, `@/hooks`. New components must respect these paths.
- shadcn v4 components: no `React.forwardRef`, instead direct `React.ComponentProps`. Every primitive has a `data-slot` attribute.

**Pitfalls (official docs warn)**

- `baseColor` and `cssVariables` cannot be changed post-init without manual migration.
- Don't mix v3 and v4 component versions in the same file — the slot-attribute styling won't match.
- The CLI installs to the `aliases` paths — moving them after the fact requires updating both `components.json` and existing imports.

**Performance**

- shadcn components are tree-shakable individually; CLI installs only what you add. No runtime CSS-in-JS.

**Security**

- shadcn is a copy-paste library — every component is auditable in your repo. No bundled dependencies you didn't put there.

**Version-specific (shadcn v4 + this components.json)**

- `iconLibrary: "lucide"` matches `lucide-react ^0.479` install. New components will use Lucide icons.
- `style: "new-york"` is the only supported style.
- The `@magicui` registry is configured — `pnpm dlx shadcn@latest add @magicui/<name>` works.

**Compatibility cliffs**

- shadcn v4 components don't break v3 components already in the repo. **Mixing is allowed**, per the official "Tailwind v4" page: "Your existing apps with Tailwind v3 and React 18 will still work."
- Cursor change: buttons default to `cursor: default` (matches OS button), not `cursor: pointer`.

**ymagineApp-specific**

- This repo includes Tailwind plugins (`@tailwindcss/typography`, `tw-animate-css`, `tailwindcss-animate` — the latter is legacy v3 and should not be referenced in new code) and shadcn-compatible component setups already.
- Use `@/lib/utils` `cn()` helper (`clsx` + `tailwind-merge`) as the canonical class merger — already installed.

**Sources**
- https://ui.shadcn.com/docs/components-json
- https://ui.shadcn.com/docs/tailwind-v4

---

## next-intl 4.5.3

**Core idioms**

- Configure via `getRequestConfig` in `i18n/request.ts` (or `i18n/config.ts` — both are picked up). Return `{ locale, messages }` per request ([app router setup](https://next-intl.dev/docs/getting-started/app-router)).
- Use `await requestLocale` (the new v4 way) inside `getRequestConfig`, NOT the deprecated `locale` argument ([4.0 release notes](https://next-intl.dev/blog/next-intl-4-0)).
- Server Component translations: `import { getTranslations } from 'next-intl/server'; const t = await getTranslations('Namespace');`.
- Client Component translations: `import { useTranslations } from 'next-intl'; const t = useTranslations('Namespace');`. The component must be inside a `<NextIntlClientProvider>`.
- Plugin registration in `next.config.ts`: `import createNextIntlPlugin from 'next-intl/plugin'; const withNextIntl = createNextIntlPlugin(); export default withNextIntl(...)`.

**Pitfalls (official docs warn)**

- All Client Components using next-intl **must** be wrapped by `NextIntlClientProvider`. This is a v4 hard requirement (preparing for Next.js PPR / `dynamicIO`).
- Type augmentation moves to a single `AppConfig` interface under the `'next-intl'` module — NOT global declarations.
- `localeCookie: false` (NOT `localeDetection: false`) is the v4 way to disable the cookie.
- For non-prefixed routing (this app's `defaultLocale = 'en'` plus middleware-driven negotiation), be careful: next-intl's own middleware assumes prefix routing by default — this repo uses a custom middleware instead.

**Performance**

- Server-side messages loading per request keeps the client bundle minimal — only the active locale ships.
- Bundle size ~7% reduced in v4 vs v3.

**Security**

- Cookies default to session-only in v4 (GDPR-aware). Set explicit `maxAge` if you want persistence — this repo sets `maxAge: 31536000` for the locale cookie deliberately.

**Version-specific (v4.5.3)**

- v4 is **ESM-only** (except `next-intl/plugin` which is dual-format).
- `requestLocale` is awaited in `getRequestConfig` — replaces v3 `locale` arg.
- `hasLocale(routing.locales, requested)` helper for type-safe locale narrowing.
- Domain-based routing requires each domain to declare its full `locales` array.

**Compatibility cliffs**

- Requires TypeScript 5+.
- The official next-intl middleware path uses `createMiddleware` — this repo writes its own middleware that **does not call `createMiddleware`** and instead manually rewrites `/de` → `/`, sets a cookie, and sets `x-locale` header for `request.ts` to consume. That's a valid non-prefixed pattern but means standard next-intl features like `alternateLinks` SEO headers are NOT auto-generated. Add them manually if needed.

**ymagineApp-specific**

- Current `i18n/config.ts` still uses the v3 `({ locale })` callback signature — **flag to migrate to `await requestLocale`** when ready.
- `i18n/request.ts` is the actual request config in use (priorities: cookie → user metadata → URL → Accept-Language → default 'en'). It awaits `requestLocale` correctly.
- Two `getRequestConfig` files exist (`config.ts` AND `request.ts`) — only `request.ts` is wired through the next-intl plugin via the standard auto-detection path. The `config.ts` exports `locales`, `defaultLocale`, `Locale` types AND a fallback `getRequestConfig` — that second `getRequestConfig` is orphaned. If you remove it, keep the type exports.
- 8 locales (`en/de/it/zh/ja/pt/fr/es`) with `defaultLocale = 'en'`. Translations live in `apps/web/translations/{locale}.json`.
- Marketing routes use `/<locale>` prefix; everything else uses cookie/header negotiation. New marketing pages go in `MARKETING_ROUTES` in middleware.

**Sources**
- https://next-intl.dev/docs/getting-started/app-router
- https://next-intl.dev/docs/routing/middleware
- https://next-intl.dev/blog/next-intl-4-0

---

## TanStack Query 5

**Core idioms**

- App Router pattern: per-request `QueryClient` on server via `cache(() => new QueryClient())`; singleton on browser ([advanced SSR](https://tanstack.com/query/v5/docs/framework/react/guides/advanced-ssr)).
- `dehydrate(queryClient)` → `<HydrationBoundary state={...}>` to ship server-prefetched cache to the client.
- `prefetchQuery` is non-throwing; `fetchQuery` throws (use for critical data + 404/500 routing).
- `useSuspenseQuery` consumes streamed promises with `<Suspense>` boundaries.
- v5: `gcTime` (NOT `cacheTime` — renamed). Defaults to `Infinity` on the server.

**Pitfalls (official docs warn)**

- **Anti-pattern**: a `QueryClient` declared at module top-level. Shares cache across users; leaks data. Always create inside component state or via `cache()`.
- **Anti-pattern**: awaiting every prefetch — blocks streaming. Use non-awaited prefetch + `shouldDehydrateQuery: (q) => defaultShouldDehydrateQuery(q) || q.state.status === 'pending'` (v5.40+) to dehydrate pending queries.
- **Anti-pattern**: rendering `queryClient.fetchQuery()` result directly in a Server Component AND ALSO running `useQuery` for the same key in a Client child — they go out of sync after `staleTime`.
- `gcTime: 0` triggers hydration errors; minimum recommended 2 seconds.
- Persisters skip pending queries by default (`shouldDehydrateQuery: defaultShouldDehydrateQuery`).
- TanStack docs explicitly: "If you are just starting out with a new Server Components app, we suggest you start out with any tools for data fetching your framework provides you with and avoid bringing in React Query until you actually need it." For this app, the existing TanStack Query stack is justified by SSE-driven client updates.

**Performance**

- `structuralSharing: true` (default; this repo sets it explicitly) keeps referential equality where data didn't change — prevents re-renders.
- Use `refetchOnMount: false` once `staleTime` is sufficiently long; this repo sets `staleTime: 5min` + `refetchOnMount: false` + `refetchOnWindowFocus: false` because SSE keeps caches fresh.

**Security**

- Each request needs an isolated server QueryClient — `cache()` enforces that automatically. Calling `queryClient.clear()` post-dehydration reduces memory.
- Don't dehydrate sensitive data inadvertently — filter via `shouldDehydrateQuery`.

**Version-specific (v5)**

- `cacheTime` → `gcTime` rename.
- `loading` status renamed to `pending`.
- `useSuspenseQuery`, `useSuspenseQueries`, `useSuspenseInfiniteQuery` added.
- `useQueries` returns `combine` for derived data.
- Error type is `unknown` by default — narrow at use site.

**Compatibility cliffs**

- v5 requires TypeScript 4.7+, React 18+. Compatible with both React 18 and 19.
- `@tanstack/react-query-devtools` matches the same major version — keep in lock-step.

**ymagineApp-specific**

- `ReactQueryProvider` uses `useState(() => new QueryClient(...))` — correct per-mount pattern, **but on the server-side `QueryClientProvider` runs at module level for each render**. The pattern works because this provider is a `'use client'` boundary and React's serialization guarantees a fresh instance per render tree.
- `staleTime: 5 * 60 * 1000` + `gcTime: 5 * 60 * 1000` is a deliberate choice because SSE refresh keeps data fresh. New non-SSE hooks must override `staleTime` to a sensible value (the repo's existing pattern).
- `retry` logic: skip retries on 4xx and on 404 — this is correct; replicate for any new mutations.
- DevTools only loads in dev + when `NEXT_PUBLIC_SHOW_DEVTOOLS === '1'` — preserves prod bundle.
- The repo does NOT currently use App Router prefetch + `HydrationBoundary` patterns. Server Components fetch their own data and Client Components own their own React Query state. **Flag**: if adding hydration-style prefetching, follow the `getQueryClient = cache(() => new QueryClient())` pattern.

**Sources**
- https://tanstack.com/query/v5/docs/framework/react/guides/ssr
- https://tanstack.com/query/v5/docs/framework/react/guides/advanced-ssr

---

## @sentry/nextjs 10.47

**Core idioms**

- Three runtime configs: `sentry.server.config.ts` (Node), `sentry.edge.config.ts` (Edge), and client init — historically `sentry.client.config.ts` BUT the current docs (v10) recommend `instrumentation-client.ts` as the new convention ([Sentry Next.js manual setup](https://docs.sentry.io/platforms/javascript/guides/nextjs/manual-setup/)). Both still work; this repo uses the older `sentry.client.config.ts` filename.
- `instrumentation.ts` registers Node/Edge configs and exports `onRequestError = Sentry.captureRequestError` — captures errors from Server Components, middleware, proxies (which bypass `error.tsx`).
- `next.config.ts` is wrapped with `withSentryConfig(config, sentryOptions)`.
- App Router `global-error.tsx`: `'use client'`, `useEffect(() => Sentry.captureException(error), [error])`.

**Pitfalls (official docs warn)**

- `error.tsx` (regular, not global) catches client render errors. Server-side errors flow through `onRequestError`, NOT `error.tsx`. Both layers are needed.
- `global-error.tsx` must declare its own `<html>` and `<body>` and cannot export `metadata`/`generateMetadata` (must be a Client Component).
- App Router uses `Sentry.captureException()` (NOT `captureUnderscoreErrorException` — that's Pages Router).
- Don't set `tracesSampleRate: 1.0` in production unless you've capacity-planned the quota.
- Source map upload requires `SENTRY_AUTH_TOKEN`. With `sourcemaps.disable: true` (this repo) no upload happens but stack traces are minified.

**Performance**

- `tracesSampleRate` — 10% client / 20% server is a defensible defaults pairing.
- `bundleSizeOptimizations.excludeDebugStatements: true` — tree-shakes Sentry's debug log code; recommended for production.
- `widenClientFileUpload: false` (default) keeps source-map upload narrow.

**Security**

- `sendDefaultPii: false` (this repo) prevents IPs, cookies, and PII headers from being sent. In v10, IP inference is controlled by this flag.
- Always filter noisy/expected errors via `ignoreErrors` + `beforeSend`. The repo already shares a `shouldIgnoreSentryNoiseEvent` helper across client and server.

**Version-specific (v10.x)**

- OpenTelemetry deps bumped to 2.x — incompatible with consumers pinning OTel v1. Use `@sentry/node-core` if you need wider OTel peer deps ([v9 → v10 migration](https://docs.sentry.io/platforms/javascript/guides/nextjs/migration/v9-to-v10/)).
- FID (First Input Delay) removed — replaced by INP. Remove FID-specific filter logic.
- `_experiments.autoFlushOnFeedback` is now default behavior; remove the experiments flag.
- Self-hosted Sentry 24.4.2+ required (unchanged from v9).
- Compatible with Next.js 15.5+; the `useRunAfterProductionCompile` hook needs Next 15.4.1+.

**Compatibility cliffs**

- v10's OTel 2.x peers conflict with packages that pin OTel 1.x — verify in any dependency tree.

**ymagineApp-specific**

- Wrap order: `withMDX` → `withBetterStack` → `withSentryConfig`. Sentry must be outermost so it can intercept builds. **Do not reorder.**
- `tunnelRoute: '/monitoring'` is set. Middleware matcher MUST exclude `/monitoring` and `/_betterstack` — already present.
- `sourcemaps.disable: true` + `telemetry: false` + `bundleSizeOptimizations.excludeDebugStatements: true` — these are deliberate. Don't toggle without a clear performance / debuggability justification.
- `silent: true` suppresses Sentry build logs — useful in CI, keep on.
- The repo's `global-error.tsx` calls `Sentry.captureException` with custom `tags: { area: 'global-error-boundary' }` and rich `extra` (href, viewport, etc.) — replicate this richness for any new global-scope error boundaries.
- `shouldIgnoreSentryNoiseEvent` is the canonical filter; add to it (not duplicate `beforeSend` logic) when new noise patterns appear.
- DSN is pointed at Better Stack's Sentry-compatible endpoint (single pipe). New analytics events should NOT bypass Sentry; use `Sentry.captureMessage` for non-error telemetry.

**Sources**
- https://docs.sentry.io/platforms/javascript/guides/nextjs/
- https://docs.sentry.io/platforms/javascript/guides/nextjs/manual-setup/
- https://docs.sentry.io/platforms/javascript/guides/nextjs/configuration/build/
- https://docs.sentry.io/platforms/javascript/guides/nextjs/migration/v9-to-v10/

---

## @logtail/next 0.3.1 (Better Stack Logs)

**Core idioms**

- Install + set `NEXT_PUBLIC_BETTER_STACK_SOURCE_TOKEN` and `NEXT_PUBLIC_BETTER_STACK_INGESTING_URL` ([BetterStack Next.js client docs](https://betterstack.com/docs/logs/javascript/nextjs/)).
- Wrap `next.config.ts` with `withBetterStack(config)`.
- Wrap Route Handlers with `withBetterStack(handler)` to get `request.log.{info,warn,error}` methods.
- Client Components: `useLogger()` hook.
- Server Components: instantiate `Logger` directly, `await log.flush()` before returning.

**Pitfalls (official docs warn)**

- Auth middleware (Clerk / NextAuth / our custom Supabase middleware) MUST treat `/_betterstack/(.*)` as public so the telemetry proxy works.
- v0.2+ requires the App Router; legacy v0.1.x for Pages Router only.

**Performance**

- BetterStack ships its own browser telemetry tunnel (`/_betterstack`) — exclude from middleware matcher AND from Sentry tunnel collisions.

**Security**

- Source token is `NEXT_PUBLIC_*` — it ships to the client. Use BetterStack's per-source ingest token (not API token).

**Version-specific (0.3.x)**

- Next 14 → `@logtail/next` 0.2.*; Next 15 → 0.3.* (current). Verify in package.json.

**Compatibility cliffs**

- The package is App Router-aware. The `request.log` helper requires the `BetterStackRequest` type.

**ymagineApp-specific**

- `withBetterStack` is the middle wrapper in `next.config.ts`: `withSentryConfig(withBetterStack(withMDX(nextConfig())), { ... })`. **Order**: MDX (innermost) → BetterStack → Sentry (outermost). This works because each wrapper preserves the prior config. Don't reorder unless intentionally swapping responsibilities.
- Middleware matcher excludes `_betterstack` already.
- No conflict with Sentry — BetterStack tunnels structured logs; Sentry tunnels errors. The DSN target host happens to be Better Stack's Sentry-compatible endpoint, but they are separate ingestion paths.

**Sources**
- https://betterstack.com/docs/logs/javascript/nextjs/

---

## Konva 9.3 + react-konva 19.2

**Core idioms**

- `canvas` is a native Node module — externalize from the browser bundle.
- Webpack: `config.externals = [...config.externals, { canvas: 'canvas' }]` ([react-konva README](https://github.com/konvajs/react-konva)).
- Turbopack: `turbopack.resolveAlias.canvas.browser = './src/lib/empty-module.ts'` (or any stub returning `{}`).
- For pages that render Konva, use `next/dynamic` with `ssr: false`.

**Pitfalls (official docs warn)**

- "react-konva works in the browser only and is not supported in React Native" — and by extension, it cannot run during SSR/SSG without the alias.
- From konva 10.0.0 onward the workaround is no longer needed — but this repo pins konva 9.3, so the alias IS required.

**Performance**

- Konva is heavy (~200KB minified); always lazy-load via `next/dynamic` for routes that don't need it.

**Security**

- No specific docs warnings.

**Version-specific (9.3 + 19.2)**

- react-konva 19.x tracks the Konva 9 major. Doesn't strictly require React 19; works on React 18 in this codebase.

**Compatibility cliffs**

- Bumping to konva 10 would let you drop the externalization (but verify before removing).

**ymagineApp-specific**

- Both `webpack` and `turbopack` aliases are configured correctly in `next.config.ts`. The Turbopack alias points at `./src/lib/empty-module.ts` — keep this file existing and exporting an empty object/default.
- If you add a Konva-using page, prefer dynamic import: `const KonvaCanvas = dynamic(() => import('./konva-canvas'), { ssr: false });`.

**Sources**
- https://github.com/konvajs/react-konva
- https://konvajs.org/docs/react/index.html

---

## fumadocs (core 15.8.5 / mdx 11.10.1 / ui 15.8.5)

**Core idioms**

- Configure via `source.config.ts` with `defineDocs({ dir: 'content/docs' })` and `defineConfig({...})` from `fumadocs-mdx/config` ([fumadocs MDX Next setup](https://fumadocs.dev/docs/mdx/next)).
- Wrap `next.config.ts` with `createMDX()` from `fumadocs-mdx/next`.
- `next dev` / `next build` auto-generates a `.source/` folder containing compiled docs collections.
- `lib/source.ts` consumes the `.source` collections via `loader()` from `fumadocs-core/source`.

**Pitfalls (official docs warn)**

- Fumadocs MDX is ESM-only; the docs suggest `next.config.mjs` extension. `next.config.ts` works because the file is transpiled.
- `.source` is git-ignored generated output — don't commit it.

**Performance**

- MDX is compiled at build time; runtime cost is minimal.

**Security**

- MDX content should be authored, not user-provided. If accepting user MDX, sanitize via `rehype-sanitize` (already installed).

**Version-specific**

- The `createMDX` import path is `fumadocs-mdx/next` (NOT `@next/mdx`).
- `fumadocs-core` + `fumadocs-ui` must match majors (this repo: both 15.8.5).

**Compatibility cliffs**

- `fumadocs-ui` 15 expects Tailwind v4 — already in place. Its `@import 'fumadocs-ui/css/neutral.css'` + `@import 'fumadocs-ui/css/preset.css'` is in `globals.css`.

**ymagineApp-specific**

- `withMDX(nextConfig())` is the **innermost** wrapper; this is correct.
- `globals.css` includes `@source "../node_modules/fumadocs-ui/dist/**/*.js"` for Tailwind to scan fumadocs components.
- Fumadocs theme tokens are overridden under `:root` and `.dark` (e.g. `--color-fd-background: oklch(...)`) — keep this scheme for brand consistency.

**Sources**
- https://fumadocs.dev/docs/mdx/next
- https://fumadocs.dev/docs/mdx

---

## Cross-cutting topics

### Data fetching architecture in App Router

- **Server Component fetch** is the default. Use it for initial-load data, auth-gated reads, and anything where the user's first paint shouldn't wait on a hydration round-trip.
- **TanStack Query** is for client-side interactivity, mutations, and live (SSE-driven) data. The two are NOT mutually exclusive: Server Component fetches first paint; TanStack Query takes over for subsequent updates.
- To avoid double-fetching when sharing data between Server and Client Components, use **`React.cache()`** for the read function — multiple invocations within one request share an in-memory result ([fetching data](https://nextjs.org/docs/app/getting-started/fetching-data)).
- For prefetch-and-hydrate patterns (currently NOT in use in this repo), use `cache(() => new QueryClient())` for the server client, `prefetchQuery` non-awaited, and `HydrationBoundary` around the Client Component.
- Route Handlers (`app/api/.../route.ts`) for HTTP endpoints; Server Actions (`'use server'`) for mutations triggered from forms/buttons.
- `unstable_cache` works in Next 15.x for ad-hoc memoization of any function with explicit tags — useful for cross-request caching beyond fetch. (Note: Next 16 deprecates it in favor of the `'use cache'` directive — do NOT migrate yet.)

### Streaming and Suspense boundaries

- Use `loading.tsx` per route segment for instant skeletons.
- Use `<Suspense fallback={...}>` inline for sub-route streaming.
- Streaming requires the server runtime supports HTTP chunked responses. Behind nginx/cloudflare, verify proxy buffering is disabled for streamed routes if needed.
- Don't access uncached APIs (`cookies()`, etc.) in a layout that has a sibling `loading.tsx` — the layout will block navigation.

### i18n routing patterns

- This repo uses **custom non-prefixed routing** with `defaultLocale = 'en'`, cookies, and Accept-Language. Marketing pages support `/<locale>` prefix via manual rewrite in middleware. App pages don't carry a locale prefix.
- `getRequestConfig` in `i18n/request.ts` reads cookie → user metadata → URL → Accept-Language → default. Adding a 9th locale: update `i18n/config.ts`, add `translations/<locale>.json`, list in `MARKETING_ROUTES` if SEO-prefixed.
- `NextIntlClientProvider` wraps in `I18nProvider` (custom abstraction in `@/components/i18n-provider`).

### Error handling

- `error.tsx` per route for client render errors (Next 15: props `{ error, reset }`, `'use client'`).
- `global-error.tsx` for the root layout — must declare `<html>` and `<body>`. This repo ships a richly-instrumented one.
- `instrumentation.ts` exports `onRequestError = Sentry.captureRequestError` to catch Server Component / middleware / route handler errors. **Without this, server errors don't reach Sentry.**
- Sentry init flow: `instrumentation.ts:register()` dynamically imports `sentry.{server,edge}.config.ts` based on `NEXT_RUNTIME`. Client init is auto-loaded by `withSentryConfig` from `sentry.client.config.ts`.
- BetterStack captures structured logs separately — they don't conflict because Sentry tunnels via `/monitoring` and BetterStack via `/_betterstack`.
- Filter noisy errors centrally via `shouldIgnoreSentryNoiseEvent` / `shouldIgnoreBrowserRuntimeNoise` — don't duplicate `beforeSend` logic.

### Form patterns (React 18 era — important)

- **No `useActionState` (React 19)**. Use one of:
  - Plain `<form action={serverAction}>` + `useFormStatus()` from `react-dom` (limited — only `pending` in React 18).
  - `react-hook-form` (already installed) for client-side validation, then submit via `fetch` / Server Action / Route Handler.
  - Custom `useTransition` + `fetch` for non-form mutations.
- Server Actions: always re-authenticate inside the action body; never trust client-passed user IDs.
- `zod` (already installed) for input validation — co-locate schemas in `lib/validation/<feature>.ts`.

### Middleware vs Route Handlers vs Server Actions

- **Middleware (`middleware.ts`)**: runs before route resolution, in Edge or Node runtime (Node stable in 15.5). Use for: auth gates, rewrites, redirects, cookie reads, i18n routing. **Do not put heavy work here**; it runs per matched request.
- **Route Handlers (`app/api/.../route.ts`)**: HTTP endpoints. Use for: webhooks, third-party callbacks, file uploads, anything needing a stable URL the browser will fetch.
- **Server Actions (`'use server'`)**: RPC-like mutations from React. Use for: forms, button-triggered backend writes, things tightly coupled to the calling component. Public endpoint regardless of import — always re-authorize.

---

## MIGRATION FLAGS

Places where ymagineApp diverges from current official guidance — and what to do about each.

1. **`apps/web/src/middleware.ts`** — still middleware.ts (correct for Next 15). Next 16 renames to `proxy.ts` with a codemod `npx @next/codemod@canary middleware-to-proxy .`. **LEAVE ALONE** until a deliberate Next 16 upgrade.

2. **`apps/web/src/i18n/config.ts`** — uses the v3-style `getRequestConfig(async ({ locale }) => {...})` callback signature. **`request.ts` already uses the correct v4 pattern with `await requestLocale`.** The orphan `getRequestConfig` in `config.ts` is unreachable but if executed would emit a v4 deprecation warning. **Action**: remove the dead `getRequestConfig` export from `config.ts`; keep `locales`, `defaultLocale`, `Locale` type exports.

3. **`apps/web/sentry.client.config.ts`** — uses the older filename. Current v10 docs recommend `instrumentation-client.ts`. Both still load. **Action**: optional rename when convenient; preserves all current logic.

4. **`apps/web/src/app/react-query-provider.tsx`** — `QueryClient` created via `useState(() => new QueryClient(...))`. Correct for purely client-side React Query. **If you ever add server-side prefetching**, also create `apps/web/src/lib/get-query-client.ts` with the `cache(() => new QueryClient())` pattern and import it from Server Components.

5. **`fetchCache` defaults** — Next 15 changed fetch and GET Route Handlers to be uncached by default. The repo doesn't set `fetchCache` globally. **Action**: for any read-heavy Server Component or Route Handler that benefits from caching, set per-call `{ cache: 'force-cache' }` or per-segment `export const fetchCache = 'default-cache'`. Don't blanket-cache at the root.

6. **`experimental.optimizePackageImports`** — `lucide-react`, `date-fns`, `recharts`, `react-icons` are already auto-optimized by Next 15 (default list). Listing them is redundant but harmless. `framer-motion`, `@radix-ui/react-icons`, `@tanstack/react-query` are NOT in the default list — keeping them in the override IS valuable. **Action**: leave as-is.

7. **Next 15.5 deprecation warnings to watch in build output**:
   - `legacyBehavior` on any `<Link>` — grep usages.
   - AMP imports — none expected.
   - `<Image quality={X}>` where X !== 75 without `images.qualities` — `[75, 100]` is set; verify any quality used is in that array.
   - Local image `src` with `?v=` query strings — only allowed under `images.localPatterns`. Not currently set; add only if needed.

8. **`next lint` deprecation** — eslint is run via `next lint` script (`"lint": "next lint"`). Codemod available: `npx @next/codemod@latest next-lint-to-eslint-cli .`. **Action**: defer until Next 16 prep — `next build` still runs lint in 15.

9. **React 19 hooks** — do NOT introduce `useActionState`, `useOptimistic`, or top-level `use(promise)`. Stay on React 18 patterns until a deliberate React 19 jump (which is tightly coupled to bumping `cmdk`, `geist`, `react-konva`, and re-validating Radix and shadcn).

10. **Synchronous dynamic API holdouts** — search for `cookies()`/`headers()`/`draftMode()` calls that aren't `await`ed. They still work in 15.5 with a dev warning, but Next 16 removes them. The official codemod: `npx @next/codemod@canary next-async-request-api .`. **Action**: defer until pre-Next-16 cleanup pass.

11. **`unstable_cache` callers** — if any exist, they keep working in 15.5; the `'use cache'` directive is the Next 16 successor. **Action**: do not migrate yet.

12. **Tailwind v4 cleanup** — `tailwindcss-animate` is still in deps alongside `tw-animate-css`. The shadcn v4 docs deprecate `tailwindcss-animate`. **Action**: confirm no current `globals.css` or component CSS references the `tailwindcss-animate` plugin; if clean, drop the dep. (Currently `globals.css` references `tw-animate-css` via `@import 'tw-animate-css';` — the v4 replacement is in use.)

13. **Konva externalization** — both Webpack and Turbopack aliases for `canvas` are correct given konva 9.3. **Note**: konva 10+ no longer needs the externalization. Bumping konva is a clean simplification but verify all `react-konva` features still work.

14. **`typescript.ignoreBuildErrors: true`** — relies on CI `pnpm typecheck` as the type gate. If CI typecheck job is ever weakened or removed, this flag becomes silently dangerous. **Action**: keep the gate strict in CI.

15. **`output: 'standalone'` + `outputFileTracingRoot`** — correct for the monorepo. If new native deps (e.g. `sharp`, `aws-crt`) get added, configure `outputFileTracingIncludes` per the [output ref](https://nextjs.org/docs/15/app/api-reference/config/next-config-js/output) so the standalone build includes them.

---

## Source policy compliance note

Every citation in this document resolves to one of: `nextjs.org/docs/*`, `react.dev/*`, `tailwindcss.com/docs/*`, `ui.shadcn.com/docs/*`, `radix-ui.com/primitives/*`, `next-intl.dev/docs/*`, `tanstack.com/query/*`, `docs.sentry.io/platforms/javascript/guides/nextjs/*`, `betterstack.com/docs/logs/*`, `konvajs.org/*` or the package's official GitHub README, or `fumadocs.dev/docs/*`. No Medium, dev.to, Stack Overflow, LogRocket, or third-party listicles were consulted.

### Topics where official sources were thin or contested

- **next-intl 4 + non-prefixed routing with custom middleware**: the official docs assume `createMiddleware`. This repo bypasses it entirely. The non-prefixed pattern is supported but `alternateLinks` SEO must be added manually.
- **Wrapper composition order** for `withSentryConfig` + `withBetterStack` + `withMDX`: neither Sentry nor BetterStack docs explicitly document combining all three. The current order (Sentry outermost) follows the principle that observability wrappers wrap content wrappers — verified empirically by this repo's CI, not by docs.
- **Konva externalization under Turbopack**: react-konva README documents an `experimental.turbo` (v15.3 renamed to `turbopack`) `resolveAlias` pattern but doesn't yet officially document the `{ browser: ... }` conditional alias shape used here; we cross-referenced the Next.js [turbopack ref](https://nextjs.org/docs/15/app/api-reference/config/next-config-js/turbopack) which DOES document the `browser` condition. Combined evidence is sufficient.
- **shadcn v4 + React 18**: the shadcn Tailwind v4 page says new components are "Tailwind v4 + React 19" but explicitly states existing React 18 apps continue to work. There is no comprehensive React 18 + shadcn v4 matrix; expect to manually verify any new component install under React 18.
- **@logtail/next + Sentry tunnel coexistence**: neither vendor documents the case where one Sentry DSN points at BetterStack's Sentry-compatible endpoint AND `@logtail/next` is also installed. The repo's current config is internally consistent and shipping; document changes only if BetterStack publishes guidance.
