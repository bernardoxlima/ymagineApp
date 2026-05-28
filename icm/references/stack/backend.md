# Backend Stack Best Practices — ymagineApp (Kortix/Suna fork)

**Audience**: Claude Code, reading this when writing/changing backend code in `apps/api`, `packages/db`, `supabase/migrations`, `core/*`.
**Rule**: Every claim cites an OFFICIAL primary source. Where official sources are silent on a Kortix-specific pattern, this doc says so explicitly rather than inventing.
**Stack**: Hono (latest) on Bun 1.2-slim (no compile step) + Drizzle ORM + self-hosted Supabase (Postgres 15 + GoTrue + PostgREST + Kong) + pnpm 8.15.8 workspaces + Node 22 (deps stage only) + Zod (HTTP boundaries).

---

## Hono

**Core idioms**
- **Bun entrypoint shape**: `export default { port: 3000, fetch: app.fetch }`. This is the documented contract — Bun's HTTP server reads `port` and `fetch` from the default export. (hono.dev/docs/getting-started/bun, hono.dev/docs/api/hono)
- **Constructor generics**: type both Bindings and Variables on the Hono instance — `new Hono<{ Bindings: B; Variables: V }>()`. Otherwise `c.set/c.get/c.env` lose type safety. (hono.dev/docs/api/context)
- **Inline handlers (not Rails-style controllers)**: official Best Practices explicitly recommends inline handlers because `c.req.param('id')` cannot infer in an external controller without "complex generics". For shared logic use `createFactory().createHandlers(...)` from `hono/factory`. (hono.dev/docs/guides/best-practices)
- **Sub-apps**: large APIs split into per-domain Hono instances mounted via `app.route('/authors', authors)`. Each sub-app is a `new Hono()` with its own routes; the parent mounts it on a base path. (hono.dev/docs/guides/best-practices)
- **Chained methods for RPC typing**: only chain works — `const app = new Hono().get(...).post(...)`; then `export type AppType = typeof app`. Detached `app.get(...); app.post(...)` loses RPC types. (hono.dev/docs/guides/rpc, hono.dev/docs/guides/best-practices)
- **Validation**: `zValidator('json' | 'form' | 'query' | 'param' | 'header', schema, optionalHook)`. Access typed data with `c.req.valid('json')`. Multiple validators on one route compose left-to-right. (hono.dev/docs/guides/validation, github.com/honojs/middleware/tree/main/packages/zod-validator)
- **Errors**: throw `new HTTPException(401, { message })`; centralize formatting in `app.onError((err, c) => err instanceof HTTPException ? err.getResponse() : c.text('Internal Server Error', 500))`. (hono.dev/docs/api/exception)

**Pitfalls (official docs warn)**
- `HTTPException.getResponse()` is **not Context-aware** — headers set on `c` are not copied into the response from `getResponse()`. If you need request-correlated headers on error responses, build a `Response` manually. (hono.dev/docs/api/exception)
- `zValidator('header', ...)` requires **lowercase** keys in the schema (`'idempotency-key'`, not `'Idempotency-Key'`). (hono.dev/docs/guides/validation)
- `zValidator('json' | 'form', ...)` requires a matching `Content-Type` header on the request. Without it, validation silently passes through with empty object — known footgun documented in honojs/middleware#1468.
- `app.notFound()` only fires on the **top-level** app instance, not on mounted sub-apps. (hono.dev/docs/api/hono)
- `app.fire()` is **deprecated**; use `fire()` from `hono/service-worker` instead. (hono.dev/docs/api/hono)
- CORS with `credentials: true` + `origin: '*'` is invalid per W3C — the Hono docs show the dynamic-origin function pattern for this. (hono.dev/docs/middleware/builtin/cors)
- Middleware registration order is execution order. The pre-`next()` body of the first `app.use` runs first; post-`next()` runs in reverse. Mis-ordering `logger()` after `secureHeaders()` will fail to log header errors. (hono.dev/docs/guides/middleware)

**Performance**
- Hono's `RegExpRouter` is the default; performance vs other Node frameworks is documented at hono.dev/docs/concepts/benchmarks. No tuning normally required.
- Avoid creating closures per-request inside middleware; the `createFactory().createMiddleware` pattern produces shared instances. (hono.dev/docs/guides/best-practices)
- TSServer slowness on large RPC apps is acknowledged; if your IDE drags, splitting RPC clients per sub-app helps (honojs/hono#2489, #4560).

**Security**
- `secureHeaders()` ships strong defaults: `Strict-Transport-Security: max-age=15552000; includeSubDomains`, `X-Content-Type-Options: nosniff`, `X-Frame-Options: SAMEORIGIN`, `Referrer-Policy: no-referrer`, `Cross-Origin-Resource-Policy: same-origin`, `Cross-Origin-Opener-Policy: same-origin`, `X-XSS-Protection: 0` (deliberately disabled — legacy XSS auditor is harmful), removes `X-Powered-By`. (hono.dev/docs/middleware/builtin/secure-headers)
- For production APIs, override `strictTransportSecurity` to include `preload` and set a tight `contentSecurityPolicy`. (hono.dev/docs/middleware/builtin/secure-headers)
- CSRF middleware (`hono/csrf`) exists; required if you accept cookies as auth.
- Validators throw `ZodError`-derived issues only after `await next()` — if you read `c.req.json()` again downstream you bypass the validator. Always read via `c.req.valid(target)`.

**Version-specific**
- WebSocket helpers (`upgradeWebSocket`, `websocket`) for Bun must be imported from `hono/bun` specifically. (hono.dev/docs/getting-started/bun, github.com/honojs/hono/blob/main/src/adapter/bun/websocket.ts)
- `serveStatic` on Bun has options including `precompressed: true` to auto-serve `.br/.gz/.zst` based on `Accept-Encoding`. (hono.dev/docs/getting-started/bun)

**ymagineApp-specific**
- `apps/api/src/index.ts` should keep the `{ port, fetch: app.fetch }` shape so Bun's built-in server picks it up — do NOT call `Bun.serve()` manually unless WebSocket setup needs it.
- Sub-apps under `apps/api/src/routes/*` should be chained-method instances and **default-export** the chained app so RPC types survive the barrel.
- Error envelope must come from `onError` so all 4xx/5xx are uniform. If credit-related code throws a custom error class, normalize it inside `onError` before reaching the client.

**Sources**
- https://hono.dev/docs/getting-started/bun
- https://hono.dev/docs/api/hono
- https://hono.dev/docs/api/context
- https://hono.dev/docs/api/exception
- https://hono.dev/docs/guides/validation
- https://hono.dev/docs/guides/middleware
- https://hono.dev/docs/guides/best-practices
- https://hono.dev/docs/guides/rpc
- https://hono.dev/docs/middleware/builtin/cors
- https://hono.dev/docs/middleware/builtin/secure-headers
- https://github.com/honojs/middleware/tree/main/packages/zod-validator
- https://github.com/honojs/hono/blob/main/src/adapter/bun/websocket.ts

---

## Bun 1.2 (runtime, no compile step)

**Core idioms**
- Install `@types/bun` as dev dep — provides the global `Bun` types and `process.env` shapes. (bun.com/docs/runtime/typescript)
- `bun run src/index.ts` runs TS directly. The Bun-provided `tsconfig.json` template uses `"moduleResolution": "bundler"`, `"allowImportingTsExtensions": true`, `"noEmit": true` — TS is treated as a typecheck-only tool, the runtime owns execution. (bun.com/docs/runtime/typescript)
- Module resolution probe order for extensionless imports: `.tsx, .jsx, .ts, .mjs, .js, .cjs, .json`, then the same list under `./index.*`. (bun.com/docs/runtime/module-resolution)
- Env vars: `process.env`, `Bun.env`, `import.meta.env` are aliases. `.env` files load in this order: `.env` → `.env.{NODE_ENV}` → `.env.local` (later overrides earlier). Override with `--env-file` or fully disable with `--no-env-file`. (bun.com/docs/runtime/environment-variables)
- For secrets: `Bun.secrets` encrypts at rest and avoids process-memory leaks vs plain env vars. (bun.com/docs/api/secrets — discovered via the env-vars page)

**Pitfalls (official docs warn)**
- **The Bun bundler is not a typechecker.** From bun.com/docs/bundler: *"The Bun bundler is not intended to replace `tsc` for typechecking."* Run `tsc --noEmit` (or a downstream tool) separately for type errors.
- Build failures return an **AggregateError** containing `BuildMessage`/`ResolveMessage` entries with `code`, `message`, `specifier`, `referrer`. Missing exports surface as a resolve/build error at build time, not at runtime — meaning `bun build --outdir` will catch missing exports against the import graph even though `bun run` only catches them when the missing binding is first executed. (bun.com/docs/bundler)
- Known link error class: `SyntaxError: Indirectly exported binding name 'Foo' is not found` — surfaces when a barrel re-exports a name that does not exist in the target. (github.com/oven-sh/bun#5426)
- You cannot mix `import` and `module.exports` in the same file; `exports`, `module`, `with`, and top-level `return` are not allowed in ESM under Bun. (bun.sh/docs/runtime/modules)
- `Bun.env` snapshots `process.env` at process launch; runtime mutations to `process.env` are not reflected unless you pass `process.env` to `Bun.spawn`. (bun.com/docs/runtime/environment-variables)
- `NODE_TLS_REJECT_UNAUTHORIZED=0` should not be used in production. (bun.com/docs/runtime/environment-variables)
- `child_process.exec` and `Bun.spawn({ shell: true })` invoke the shell; never pass unsanitized user input. Use `Bun.spawn([cmd, ...args])` array form. (bun.com/docs/runtime/child-process)

**Performance**
- `bun build --production` sets `NODE_ENV=production` and enables minification. Used for client bundles, not for the API runtime since the API ships TS source. (bun.com/docs/bundler)
- `Bun.spawn`/`spawnSync` accept `maxBuffer` which auto-kills processes whose stdout exceeds the byte limit — useful for tool/sandbox processes. (bun.com/blog/bun-v1.3)
- Avoid `BUN_RUNTIME_TRANSPILER_CACHE_PATH` in ephemeral containers. (bun.com/docs/runtime/environment-variables)

**Security**
- Use `Bun.secrets` for credentials in long-running processes when feasible. Otherwise restrict env-var exposure to the process scope (compose `env_file` with care).
- `--no-env-file` in production prevents accidental `.env` shadowing.
- Validate ALL HTTP-boundary input with Zod **before** it reaches business code (see Hono section).
- Treat any `sql.raw(...)` or `child_process.exec(userInput, ...)` as a critical review item.

**Version-specific**
- Bun 1.2 baseline. Bun supports the package.json `"bun"` export condition — libraries can publish raw TS and Bun executes it directly. (bun.com/docs/runtime/module-resolution)
- Inside `node_modules`, Bun prefers `.js` over `.ts` even if both are present (bun.sh/docs/runtime/modules) — useful when a vendored package ships both.

**ymagineApp-specific**
- The Docker runtime image is `oven/bun:1.2-slim` running `bun run src/index.ts` — there is no compile step in the runtime container. The dependency install happens earlier in a Node 22 stage.
- **Boot-safety gate**: `tsc --noEmit` is too noisy because `apps/api` has ~36 pre-existing tolerated type errors. The adopted gate is `bun build --outdir <tmp> apps/api/src/index.ts` (or equivalent) which fails fast on missing exports/resolve errors without dragging in TS noise. This is officially documented behavior (build returns AggregateError on resolve failures), even though Bun docs explicitly say the bundler is "not intended to replace tsc for typechecking". Use it as a link-error gate, not a typechecker.
- Because `bun run` only loads a module when first imported, missing exports in cold paths can hide. The `bun build --outdir` gate eliminates this by traversing the whole import graph at CI time.
- When generating shared chunks (rare for the API), `--outdir` is mandatory; `--outfile` is single-entry only and is silently ignored if combined with `--outdir`. (github.com/oven-sh/bun#21406)

**Sources**
- https://bun.com/docs/runtime/typescript
- https://bun.com/docs/runtime/module-resolution
- https://bun.com/docs/runtime/environment-variables
- https://bun.com/docs/runtime/child-process
- https://bun.com/docs/bundler
- https://bun.com/reference/bun/build
- https://bun.com/docs/api/secrets
- https://bun.sh/docs/runtime/modules
- https://github.com/oven-sh/bun/issues/5426
- https://github.com/oven-sh/bun/issues/21406

---

## Drizzle ORM

**Core idioms**
- Schema split across many files is officially supported. Point `drizzle.config.ts` at a folder (`schema: './src/db/schema'`) and Drizzle Kit recursively discovers all exported tables. (orm.drizzle.team/docs/schemas, orm.drizzle.team/docs/sql-schema-declaration, orm.drizzle.team/docs/drizzle-config-file)
- The `schema` field accepts a string, a glob, or a string-array: `'./src/schema.ts'` / `'./src/**/schema.ts'` / `['./src/user/schema.ts', './src/posts/schema.ts']`. (orm.drizzle.team/docs/drizzle-config-file)
- **Mandatory rule**: *"you must ensure that you export all the models from those files so that the Drizzle kit can import them and use them in migrations."* (orm.drizzle.team/docs/sql-schema-declaration) — phrased differently but consistent: every table must be a named export reachable from the schema entrypoint.
- Connection: `drizzle({ client: pool })` from `drizzle-orm/node-postgres` with a singleton `pg.Pool`. (orm.drizzle.team/docs/connect-overview)
- Transactions: `await db.transaction(async (tx) => {...})`. Nested transactions auto-translate to SAVEPOINTs. Throwing inside the callback rolls back; `tx.rollback()` is an explicit throw. (orm.drizzle.team/docs/transactions)
- Postgres tx options: `{ isolationLevel: 'read committed' | 'repeatable read' | 'serializable', accessMode: 'read only' | 'read write', deferrable: boolean }`. (orm.drizzle.team/docs/transactions)
- The `sql` template auto-parameterizes: `sql\`where id = ${id}\`` becomes `where id = $1` with `[id]` in the params array. Tables/columns are auto-quoted as identifiers. (orm.drizzle.team/docs/sql)

**Pitfalls (official docs warn)**
- **`sql.raw(...)` bypasses parameterization** — the value is concatenated into the query string. Use only for already-trusted/sanitized input. (orm.drizzle.team/docs/sql)
- **Security advisory GHSA-gpj5-g38j-94v9 (CVE-2026-39356)**: Drizzle had a SQL-injection vector via improperly escaped quoted identifiers in `sql.identifier()` / `.as()` when attacker-controlled input was passed. Track and pin to a patched release. (github.com/drizzle-team/drizzle-orm/security/advisories/GHSA-gpj5-g38j-94v9)
- When connecting through **PgBouncer in transaction mode**, prepared statements must be disabled — Drizzle docs call this out and recommend `prepare: false` on the underlying driver. (orm.drizzle.team/docs/connect-overview, orm.drizzle.team/docs/connect-supabase)
- Splitting schema into a separate compiled monorepo package can produce `TS2345 Property [IsDrizzleTable] is missing in type` errors when the consumer compiles against the package's `.d.ts` instead of source. Workarounds: share source via path aliases, or align compiler `paths`. (github.com/drizzle-team/drizzle-orm/issues/1558)

**Performance**
- Reuse one `Pool` per process. Do not recreate the Drizzle client per request. (orm.drizzle.team/docs/connect-overview)
- Use prepared statements (`db.select(...).prepare('name')`) for hot queries when NOT behind PgBouncer-transaction. (orm.drizzle.team/docs/transactions, /docs/perf-queries)
- For Postgres indexes use `index('name').using('btree' | 'gin' | 'gist', table.col)`. (orm.drizzle.team/docs/extensions/pg)

**Security**
- Treat any `sql.raw`, `sql.identifier(userInput)`, `.as(userInput)` as require-review.
- `db.execute(sql\`...\`)` with parameter interpolation is safe; concatenating strings into the template is **not**.
- All identifiers and values that come from a request body should go through Zod first, then through Drizzle's typed builders, never via `sql.raw`.

**Version-specific**
- Drizzle Kit v1.0.0-beta.2 changes are documented at orm.drizzle.team/docs/latest-releases — verify your version against the docs you read.
- Effect-Schema and Zod adapters exist (`drizzle-zod`) and are documented; consider for keeping HTTP shapes aligned with DB shapes when needed.

**ymagineApp-specific**
- `packages/db` re-exports tables **by name** — `export { foo } from './schema/foo'` — NOT `export * from './schema/foo'`. This is a deliberate choice after a Suna boot crash caused by Bun surfacing a missing/indirect re-export from a `export *` barrel. Official docs require all models to be exported but do NOT mandate a specific re-export form; named re-exports remain compliant and are safer under Bun's strict ESM resolution. Document this in the barrel header.
- `drizzle.config.ts` should point at the package source (`schema: './src/schema'`), not at a built `dist/`, to avoid the `[IsDrizzleTable]` type-erasure issue.
- Migrations DIRECTORY in our setup is `supabase/migrations/` (Supabase CLI convention), not Drizzle Kit's `./drizzle`. Drizzle Kit is therefore used only for **schema definition** in this repo — application of migrations is handled by `ensureSchema()` at boot, not by `drizzle-kit migrate`. This is non-standard; see Alignment Flags.

**Sources**
- https://orm.drizzle.team/docs/schemas
- https://orm.drizzle.team/docs/sql-schema-declaration
- https://orm.drizzle.team/docs/drizzle-config-file
- https://orm.drizzle.team/docs/connect-overview
- https://orm.drizzle.team/docs/connect-supabase
- https://orm.drizzle.team/docs/transactions
- https://orm.drizzle.team/docs/sql
- https://orm.drizzle.team/docs/perf-queries
- https://orm.drizzle.team/docs/extensions/pg
- https://github.com/drizzle-team/drizzle-orm/security/advisories/GHSA-gpj5-g38j-94v9
- https://github.com/drizzle-team/drizzle-orm/issues/1558

---

## Supabase (self-hosted) — Postgres 15 + GoTrue + PostgREST + Kong

**Core idioms**
- Three Postgres roles drive Supabase auth: `anon` (unsigned), `authenticated` (signed-in), `service_role` (server-only, bypasses RLS). PostgREST maps the JWT `role` claim → Postgres `SET ROLE`. (supabase.com/docs/guides/api/securing-your-api, supabase.com/docs/guides/auth/jwts)
- **RLS must be enabled on every table in an exposed schema** — *"RLS must always be enabled on any tables stored in an exposed schema."* (supabase.com/docs/guides/database/postgres/row-level-security)
- `auth.uid()` returns the `sub` claim or `null` when unauthenticated. `auth.jwt()` returns the whole JWT for reading `app_metadata` (server-controlled) vs `user_metadata` (user-controlled — never use for authorization). (supabase.com/docs/guides/database/postgres/row-level-security, /docs/guides/auth/jwts)
- PostgREST schemas: `db-schemas = "kortix"` or comma-separated for multiple. `Accept-Profile`/`Content-Profile` headers switch active schema per request. Schemas not in `db-schemas` are inaccessible (`PGRST106`). (docs.postgrest.org/en/v12/references/api/schemas.html)
- Custom claims for RBAC live in a `custom_access_token_hook(event jsonb) returns jsonb` GoTrue auth hook that merges role/permission claims into JWT before signing. Read in RLS via `auth.jwt() ->> 'user_role'`. (supabase.com/docs/guides/database/postgres/custom-claims-and-role-based-access-control-rbac)

**Pitfalls (official docs warn)**
- *"Never change the remote database directly."* Manual edits via SQL editor bypass `supabase_migrations.schema_migrations`, causing `db push` to fail. (supabase.com/docs/guides/deployment/database-migrations)
- `auth.uid()` is `NULL` for unauthenticated requests — `auth.uid() = user_id` evaluates to NULL (not FALSE) which is treated as "no match" but is a common confusion point. Prefer `auth.uid() IS NOT NULL AND auth.uid() = user_id` or rely on `TO authenticated`. (supabase.com/docs/guides/database/postgres/row-level-security)
- `SECURITY DEFINER` functions **must not** live in an exposed schema unless you intend them callable via PostgREST. (supabase.com/docs/guides/database/functions troubleshooting article)
- Functions with `SECURITY DEFINER` must set `search_path` to an empty or controlled value — *"If you use an empty search path (`search_path = ''`), you must explicitly state the schema for every relation in the function body (e.g. `from public.table`)."* (supabase.com/docs/guides/database/functions)
- Postgres 15 `CREATE FUNCTION` docs reinforce: *"For security, search_path should be set to exclude any schemas writable by untrusted users. ... write `pg_temp` as the last entry in search_path."* (postgresql.org/docs/15/sql-createfunction.html)
- `service_role` bypasses RLS entirely — *"You should never share login credentials for any Postgres Role with this privilege."* Tables with `service_role` grants and no RLS are wide open if the key leaks. (supabase.com/docs/guides/database/postgres/row-level-security, /docs/guides/api/securing-your-api)
- Symmetric `JWT_SECRET` (HS256) rotation in self-hosted setups *"may require careful coordination to avoid downtime"*. Asymmetric (RS256/EdDSA) keys are recommended; you can rotate publishable/secret API keys without invalidating sessions. (supabase.com/docs/guides/auth/signing-keys, /docs/guides/self-hosting/self-hosted-auth-keys, /docs/guides/troubleshooting/rotating-anon-service-and-jwt-secrets-1Jq6yd)

**Performance**
- Index every column referenced in an RLS policy: `create index on tbl using btree (user_id)` — measured 99.94% improvement in Supabase's own benchmark. (RLS troubleshooting article)
- Wrap `auth.uid()`/`auth.jwt()` calls in a `select` to enable Postgres initPlan caching: `using ((select auth.uid()) = user_id)` — 94–99% improvements. (RLS troubleshooting article)
- Add `TO authenticated` to every policy that should not apply to `anon` — 99.78% improvement. (RLS troubleshooting article)
- Add explicit `.eq('user_id', userId)` to the client query even though RLS would filter it server-side — helps the planner. (RLS troubleshooting article)

**Security**
- Use `SECURITY INVOKER` (the default) unless you have a specific reason. (supabase.com/docs/guides/database/functions)
- For `SECURITY DEFINER`, always pin `SET search_path = ''` (or `SET search_path = schema, pg_temp` — `pg_temp` LAST). (postgresql.org/docs/15/sql-createfunction.html, Supabase functions doc)
- For atomic mutations (e.g. credit decrements), use Postgres locking: `SELECT ... FOR UPDATE` in plpgsql to serialize writes against a single row. `SKIP LOCKED` is for queue-style consumers, not for credit math (it gives an inconsistent snapshot). (postgresql.org/docs/15/sql-select.html — locking clause)
- For per-user gating inside a SECURITY DEFINER function, the in-function ownership check pattern is: query the membership table directly (without trusting RLS) and `raise exception` if the caller is not a member. This is consistent with Postgres docs because RLS does not apply to functions — *"For functions, RLS does not apply. Instead, control access by granting EXECUTE privileges only to the roles that should be able to call the function."* (supabase troubleshooting iI0uOw)
- Migrate symmetric JWT to asymmetric signing keys; rotate via JWKS. (supabase.com/docs/guides/auth/signing-keys)

**Version-specific**
- Postgres 15 changed the default `search_path` security posture; secure schema usage is the default. (postgresql.org/docs/15 — Schemas)
- Supabase self-hosted Docker stack: services are `db`, `auth` (GoTrue), `rest` (PostgREST), `realtime`, `storage`, `kong`, `studio`, `imgproxy`, `meta`, `functions` (Edge Runtime), plus optional `vector`, `analytics`, `supavisor`. (supabase.com/docs/guides/self-hosting/docker)
- The Docker Postgres container auto-applies any SQL placed under `/docker-entrypoint-initdb.d` at first start — useful for default extensions but **NOT** for ongoing migrations. (supabase.com/docs/guides/self-hosting/docker)

**ymagineApp-specific**
- Custom schema `kortix` must be in PostgREST's `db-schemas` list (comma-separated with `public`) for the REST API to reach those tables. Otherwise REST calls 404 with `PGRST106`.
- `atomic_*` RPCs live in the `public` schema (so PostgREST discovers them without profile headers) but read/write into `kortix.*` tables. Cross-schema access requires either explicit `kortix.table_name` qualification or adding `kortix` to PostgREST's `db-extra-search-path`.
- The in-RPC ownership check (`auth.uid() IS NULL OR EXISTS (SELECT 1 FROM kortix.account_members WHERE account_id = p_account_id AND user_id = auth.uid())`) is the correct Postgres-side enforcement pattern for SECURITY DEFINER functions. `auth.uid() IS NULL` permits service_role calls (which carry no `sub`); user calls must pass the membership check. This is consistent with — but not explicitly named in — Supabase docs; the docs only state that EXECUTE grants gate function access and that SECURITY DEFINER skips RLS, so an in-function check IS required if you want per-row authorization.
- `ensureSchema()` at API boot to apply pending migrations is **non-standard** vs Supabase's recommended `supabase db push`. Risks: concurrent boots racing, partial application without rollback, drift from `supabase_migrations.schema_migrations`. Mitigate with a Postgres advisory lock (`pg_try_advisory_lock(BIGINT)`) around the apply step and idempotent migration SQL (`CREATE TABLE IF NOT EXISTS`, `ALTER TABLE ... ADD COLUMN IF NOT EXISTS`).
- Self-hosted means we own JWT secret lifecycle. Plan asymmetric-key rotation per supabase.com/docs/guides/self-hosting/self-hosted-auth-keys; do NOT cycle HS256 `JWT_SECRET` while sessions are live.

**Sources**
- https://supabase.com/docs/guides/database/postgres/row-level-security
- https://supabase.com/docs/guides/troubleshooting/rls-performance-and-best-practices-Z5Jjwv
- https://supabase.com/docs/guides/api/securing-your-api
- https://supabase.com/docs/guides/auth/jwts
- https://supabase.com/docs/guides/auth/signing-keys
- https://supabase.com/docs/guides/self-hosting/docker
- https://supabase.com/docs/guides/self-hosting/self-hosted-auth-keys
- https://supabase.com/docs/guides/database/functions
- https://supabase.com/docs/guides/troubleshooting/do-i-need-to-expose-security-definer-functions-in-row-level-security-policies-iI0uOw
- https://supabase.com/docs/guides/database/postgres/custom-claims-and-role-based-access-control-rbac
- https://supabase.com/docs/guides/deployment/database-migrations
- https://supabase.com/docs/guides/troubleshooting/rotating-anon-service-and-jwt-secrets-1Jq6yd
- https://docs.postgrest.org/en/v12/references/api/schemas.html
- https://www.postgresql.org/docs/15/sql-createfunction.html
- https://www.postgresql.org/docs/15/sql-select.html
- https://www.postgresql.org/docs/current/explicit-locking.html

---

## pnpm 8.15.8 workspaces + Docker

**Core idioms**
- Multi-stage Dockerfile with `pnpm fetch --prod` early — *"pnpm fetch is the best option, as it only needs the pnpm-lock.yaml file and the layer cache will only be lost when you change the dependencies."* (pnpm.io/docker)
- For monorepo per-service images, use `pnpm deploy --filter=<svc> --prod /prod/<svc>` to produce a flat, self-contained directory. (pnpm.io/docker)
- Hoisting modes:
  - **default (semistrict)**: dependencies symlinked through `node_modules/.pnpm/`; only declared deps reachable from app code.
  - **`hoist-pattern`**: hoist matching packages to `node_modules/.pnpm/node_modules` (hidden, not reachable from app code by name).
  - **`public-hoist-pattern`**: hoist to ROOT `node_modules` (reachable by app code by name).
  - **`shamefully-hoist=true`**: shortcut for `public-hoist-pattern=*`.
  - `node-linker`: `isolated` (default), `hoisted` (flat, no symlinks), `pnp` (no `node_modules`).
  (pnpm.io/settings)
- *"pnpm fetch + pnpm install"* keeps lockfile-only invalidation. (pnpm.io/docker)
- All hoist/node-linker settings must live in `pnpm-workspace.yaml` (or global config), NOT in `.npmrc`, per pnpm/pnpm#9413.

**Pitfalls (official docs warn)**
- `shamefully-hoist` does **not** hoist workspace packages themselves (pnpm/pnpm#7880) — it hoists external deps. Workspace-to-workspace deps still resolve via symlinks.
- pnpm explicitly names three legitimate reasons for `shamefully-hoist`: (1) tooling incompatibility with symlinks, (2) serverless/runtime without symlink support, (3) Node `--preserve-symlinks` or bundled-deps publishing. (pnpm.io/settings)
- Multi-stage `COPY --from=deps /app/node_modules` **breaks workspace symlinks** when the source-tree of workspace packages is not also COPYed — the symlinks point at paths that no longer exist in the next stage. The docs imply this by recommending `pnpm deploy` for per-app dirs.
- Without `--shamefully-hoist`, some bundlers/tools that probe `node_modules/<pkg>` (rather than resolving via Node's algorithm) fail to find phantom deps.

**Performance**
- Use BuildKit cache mounts for `~/.local/share/pnpm/store` when available, with `pnpm install --offline` after a prior `pnpm fetch`. (pnpm.io/docker)
- Filtered installs (`pnpm install --filter ./apps/api...`) avoid touching unrelated workspaces.

**Security**
- `--ignore-scripts` prevents lifecycle scripts from running during install — appropriate for CI/Docker. (pnpm CLI install reference)
- Lockfile (`pnpm-lock.yaml`) must be committed; otherwise reproducibility breaks.

**Version-specific**
- pnpm 8.x — `pnpm deploy` is the documented monorepo Docker pattern. (pnpm.io/docker)

**ymagineApp-specific**
- Install command in Docker is `pnpm install --filter ./<service>... --shamefully-hoist --prod=false --ignore-scripts` — this is the documented `--filter` pattern plus `--shamefully-hoist` chosen specifically because Bun's strict ESM resolution + workspace symlink topology has historically tripped over node-resolution edge cases when `--shamefully-hoist` is off. Officially supported configuration, listed reason #1 (tooling compatibility) and #3 (Node runtime variants).
- `--prod=false` is required because Drizzle Kit and TS types live in devDeps; final image trims at the runtime stage via `pnpm prune --prod` or by switching to `pnpm deploy`.
- `--ignore-scripts` is a security hardening per the official CLI option list — keep it.
- The `agent-tunnel` Dockerfile workaround (manually re-creating workspace deps because `COPY --from=deps` does not bring in linked `packages/*` sources) is a manifestation of the documented multi-stage symlink problem. The cleaner long-term fix per pnpm.io/docker is `pnpm deploy --filter=agent-tunnel --prod /prod/agent-tunnel`, which materializes a flat, self-contained tree with no symlinks.

**Sources**
- https://pnpm.io/docker
- https://pnpm.io/settings
- https://github.com/orgs/pnpm/discussions/3644 (canonical multi-stage Dockerfile)
- https://github.com/pnpm/pnpm/issues/7880
- https://github.com/pnpm/pnpm/issues/9413

---

## Zod (at HTTP boundaries)

**Core idioms**
- `z.object({ ... })`. Use `.safeParse` for control-flow validation; `.parse` only when you want a throw. Async refinements/transforms require `.parseAsync`/`.safeParseAsync`. (zod.dev/basics)
- `z.infer<typeof Schema>` for static types; `z.input<typeof S>` / `z.output<typeof S>` when transforms diverge input/output. (zod.dev/basics)
- In Hono, the validator middleware calls `.safeParseAsync` internally — so async refinements work transparently. (github.com/honojs/middleware/tree/main/packages/zod-validator)
- Hook callback shape: `zValidator('json', schema, (result, c) => { if (!result.success) return c.text('...', 400) })`. Return a Response to short-circuit; return nothing to continue. (hono.dev/docs/guides/validation)

**Pitfalls (official docs warn)**
- Calling `.parse` on a schema with async refinements throws. Always use `parseAsync` in those cases. (zod.dev/basics)
- Header validator schemas use lowercase keys (Hono-specific). (hono.dev/docs/guides/validation)
- Validating `json` without a matching `Content-Type` silently passes empty object (honojs/middleware#1468). Add a small middleware that enforces content-type before zValidator, or use `header` validator to require it.

**Performance**
- Zod v4 is documented as ~6.5× faster than v3 for `z.object().safeParse`. (zod.dev/v4 release notes) Worth pinning current version against v4 when feasible.

**Security**
- Treat Zod as your trust boundary. Reject extras explicitly: `.strict()` to fail on unknown keys, or `.strip()` to drop them. Use `.strict()` for sensitive POSTs.
- Coerce only when intentional; `z.coerce.number().parse('abc')` results in `NaN` which can sneak through `.number()` if you forget `.finite()`.

**Version-specific**
- Confirm which Zod major (v3 vs v4) `@hono/zod-validator` matches in the repo's `pnpm-lock.yaml`. The validator README does not pin a Zod major; recent versions support v3.x and v4.

**ymagineApp-specific**
- Place validation as the FIRST middleware on a route (after `secureHeaders`, `logger`, and any auth). The validated object is the only handle to request data inside handlers — never read `c.req.json()` again after a validator runs.
- Reuse schemas across HTTP and Drizzle (via `drizzle-zod` if adopted) to keep DB and API shapes aligned.

**Sources**
- https://zod.dev/basics
- https://zod.dev/v4
- https://github.com/colinhacks/zod
- https://github.com/honojs/middleware/tree/main/packages/zod-validator
- https://github.com/honojs/middleware/issues/1468

---

## Postgres 15 (server side, beyond Supabase docs)

**Core idioms**
- Locking for atomic counters: `SELECT ... FOR UPDATE` inside a function/transaction prevents lost updates. `FOR NO KEY UPDATE` is lighter when not touching keys. (postgresql.org/docs/15/sql-select.html)
- Advisory locks: `pg_advisory_lock(BIGINT)` (session) or `pg_advisory_xact_lock(BIGINT)` (transaction) for application-defined mutual exclusion — useful for "only one boot may run ensureSchema()". (postgresql.org/docs/current/explicit-locking.html, /functions-admin.html)
- `SET LOCAL search_path = ...` scopes the change to the current transaction; `SET` (session) outlives it. In a SECURITY DEFINER function, pin via the `SET` clause of `CREATE FUNCTION` so it's restored on function exit. (postgresql.org/docs/15/sql-createfunction.html)

**Pitfalls (official docs warn)**
- *"`SECURITY DEFINER` function is executed with the privileges of the user that owns it. For security, `search_path` should be set to exclude any schemas writable by untrusted users."* — write `pg_temp` LAST in `search_path`. (postgresql.org/docs/15/sql-createfunction.html — Notes)
- `CVE-2018-1058` (search_path) remains relevant: never trust `public` to be safe; always qualify or pin search_path inside DEFINER functions. (wiki.postgresql.org)

**Performance**
- Indexes on RLS columns and FK columns are critical. (Supabase RLS perf doc; postgresql.org/docs/15/indexes.html)
- `SKIP LOCKED` for queue-pull patterns ONLY; "not recommended for general-purpose work". (postgresql.org/docs/15/sql-select.html)

**Security**
- Limit `EXECUTE` grants on functions: revoke from `public` and grant explicitly to `authenticated` or `service_role` as needed. (Supabase troubleshooting iI0uOw; postgresql.org/docs/15/sql-grant.html)
- Never `GRANT SELECT` on a table to `anon`/`authenticated` without RLS enabled. (Supabase securing-your-api)

**Sources**
- https://www.postgresql.org/docs/15/sql-createfunction.html
- https://www.postgresql.org/docs/15/sql-select.html
- https://www.postgresql.org/docs/current/explicit-locking.html
- https://www.postgresql.org/docs/15/functions-admin.html
- https://wiki.postgresql.org/wiki/A_Guide_to_CVE-2018-1058:_Protect_Your_Search_Path

---

## Node 22 LTS (deps install stage only)

**Core idioms**
- Node 22 stabilizes WebSocket (default-on), `--watch`, and the `node:test` runner; `fetch` performance improved through AbortSignal optimizations; Ed25519/X25519 stable in `node:crypto`. (nodejs.org/en/blog/release/v22.0.0, /v22.12.0, /v22.20.0)
- Node 22 is Active LTS through ~Oct 2025, Maintenance through ~Apr 2027 per the release schedule.

**ymagineApp-specific**
- Node 22 is only used for the `pnpm install` stage in Docker; the runtime is Bun 1.2. No Node-only APIs need to be reachable at runtime. Be careful with any tooling in `postinstall` scripts that relies on Node-only features — we run `--ignore-scripts`, so postinstalls are skipped.

**Sources**
- https://nodejs.org/en/blog/release/v22.0.0
- https://nodejs.org/en/blog/release/v22.20.0
- https://github.com/nodejs/node/releases

---

## ALIGNMENT FLAGS — where ymagineApp diverges from official guidance

| # | Practice | Severity | Official guidance | Source |
|---|----------|----------|-------------------|--------|
| 1 | `ensureSchema()` applies migrations at API boot | **should-fix** | Supabase recommends `supabase db push` (CLI) with `supabase_migrations.schema_migrations` tracking. Boot-time apply risks concurrent races, partial application, drift. Mitigate with `pg_try_advisory_xact_lock` around the apply and strictly idempotent SQL; better long-term: move to `supabase db push --db-url $SUPABASE_DB_URL` in a one-shot job. | https://supabase.com/docs/guides/deployment/database-migrations |
| 2 | `bun build --outdir` used as boot-safety gate (not `tsc --noEmit`) | **info** | Bun docs explicitly state the bundler is *"not intended to replace tsc for typechecking"*. As a **link-error/missing-export gate** (not a typecheck) it's defensible because the build does traverse the import graph and produces `AggregateError` on resolve failures. Document this rationale near the gate; consider a separate `tsc --noEmit` job scoped to changed files to chip away at the 36 tolerated errors over time. | https://bun.com/docs/bundler |
| 3 | `packages/db` barrel re-exports by NAME (no `export *`) | **info / aligned-but-non-obvious** | Drizzle requires "all models exported"; it does NOT mandate the form. Named re-exports comply and avoid the Bun `Indirectly exported binding name 'X' is not found` SyntaxError class. Document the rationale in the barrel header so a future contributor doesn't "simplify" to `export *`. | https://orm.drizzle.team/docs/sql-schema-declaration, https://github.com/oven-sh/bun/issues/5426 |
| 4 | Custom Postgres schema `kortix` exposed via PostgREST `db-schemas` | **info** | Officially supported pattern (comma-separated). Confirm `db-schemas` contains `public, kortix` and that the `kortix` role has USAGE on the schema. | https://docs.postgrest.org/en/v12/references/api/schemas.html |
| 5 | `atomic_*` RPCs in `public` with SECURITY DEFINER + in-function ownership check | **aligned (with caveats)** | Supabase: RLS does not apply inside functions; gate via EXECUTE grants + in-function checks. Postgres 15: SECURITY DEFINER **must** pin `search_path` to prevent shadowing. **Verify every atomic_* function has `SET search_path = ''` (or pinned schema list with `pg_temp` last)** — this is a hard requirement per the Postgres 15 docs. | https://www.postgresql.org/docs/15/sql-createfunction.html, https://supabase.com/docs/guides/database/functions |
| 6 | `auth.uid() IS NULL` path inside RPCs to allow service_role | **info** | Not named in docs as a specific pattern, but consistent with the fact that JWT-less calls from `service_role` carry no `sub`. Document the intent at the top of the RPC. Safer alternative: check the JWT `role` claim via `current_setting('request.jwt.claims', true)::jsonb->>'role' = 'service_role'`. | https://supabase.com/docs/guides/auth/jwts |
| 7 | Docker uses `pnpm install --shamefully-hoist` (instead of `pnpm deploy`) | **should-fix (medium-term)** | `pnpm deploy --filter=<svc> --prod /prod/<svc>` is the docs' canonical multi-stage pattern; it eliminates the multi-stage workspace-symlink class of bugs that `agent-tunnel`'s Dockerfile lines 71–77 work around. `--shamefully-hoist` is officially fine for runtime-compatibility reasons (#1, #3 of the three legitimate use cases) but does not solve cross-stage symlink breakage. | https://pnpm.io/docker, https://pnpm.io/settings |
| 8 | RLS performance — wrap `auth.uid()` in `(select ...)` and add `TO authenticated` | **must-fix on every policy** | 94–99% perf wins; trivial to apply. Audit every policy in `kortix.*` for: (a) `(select auth.uid())` form, (b) `TO authenticated` clause, (c) index on the policy column. | https://supabase.com/docs/guides/troubleshooting/rls-performance-and-best-practices-Z5Jjwv |
| 9 | JWT secret rotation — `JWT_SECRET` (HS256) in self-hosted | **should-fix (medium-term)** | Supabase recommends migrating self-hosted to asymmetric signing keys (RS256/EdDSA) for downtime-free rotation via JWKS. | https://supabase.com/docs/guides/self-hosting/self-hosted-auth-keys, https://supabase.com/docs/guides/auth/signing-keys |
| 10 | Drizzle SECURITY ADVISORY GHSA-gpj5-g38j-94v9 | **must-fix if vulnerable version** | Confirm pinned Drizzle ORM version is at or above the patched release. If any `sql.identifier(userInput)` or `.as(userInput)` exists with user-controlled input, treat as exploitable until upgraded. | https://github.com/drizzle-team/drizzle-orm/security/advisories/GHSA-gpj5-g38j-94v9 |
| 11 | Hono `app.notFound` only fires top-level | **info** | If sub-apps need their own 404, register `app.notFound(...)` on each — not just on the root app. | https://hono.dev/docs/api/hono |
| 12 | Content-Type silent-pass on zValidator | **should-fix** | Add a guard middleware (or use the validator's `header` target) to reject requests with missing/wrong `Content-Type` before body validation. | https://github.com/honojs/middleware/issues/1468 |

---

## Topics where official sources were thin or silent

- **Bun's exact runtime behavior for `export *` from a barrel where an underlying name is missing.** The docs cover module resolution probe order and the `bun` export condition, and the build path returns `AggregateError`/`SyntaxError: Indirectly exported binding name...`. There is no FAQ entry that says *"prefer named re-exports in barrels"*. The named-re-export discipline in `packages/db` is a Bun-strict-resolution-aware convention, not a docs-mandated rule. Treat the rationale as a project convention with empirical backing (Suna crash).
- **Supabase runtime migration application (`ensureSchema`).** Official docs only describe CLI-driven (`supabase db push`) and `/docker-entrypoint-initdb.d`-driven (first-boot only) paths. Runtime apply at API boot is not endorsed nor specifically forbidden — flagged as `should-fix` above with concrete mitigation steps.
- **PostgREST + Drizzle interplay.** Neither side's docs cover the combination; Drizzle is for direct SQL access via the connection pool, PostgREST is a parallel REST surface. The ymagineApp uses both (Drizzle for app code, PostgREST for REST consumers + RPCs).
- **`@hono/zod-validator` Zod-version compatibility.** README does not list supported Zod majors. Resolve by reading `pnpm-lock.yaml`.
- **Drizzle Kit cross-package type erasure.** Documented as an open issue (orm.drizzle.team#1558) without an official "do X" resolution — workarounds (path aliases, share source) are community-discovered.
