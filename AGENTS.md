<!-- LOVABLE:BEGIN -->

> [!IMPORTANT]
> This project is connected to [Lovable](https://lovable.dev). Avoid rewriting
> published git history — force pushing, or rebasing/amending/squashing commits
> that are already pushed — as it rewrites history on Lovable's side and the
> user will likely lose their project history.
>
> Commits you push to the connected branch sync back to Lovable and show up in
> the editor, so keep the branch in a working state.

<!-- LOVABLE:END -->

## Cursor Cloud specific instructions

Stack: TanStack Start (React 19) SSR app + Supabase, managed with **Bun** (`bun.lock`, `bunfig.toml`). Package manager is Bun, not npm — ignore `package-lock.json`. The update script installs Bun (if missing) and runs `bun install`.

### Running the dev server (important gotcha)
- Run the dev server with **`bun --bun run dev`**, NOT `bun run dev`. Plain `bun run dev` launches Vite under Node and crashes with `ERR_REQUIRE_CYCLE_MODULE` (Vite 8 ESM required in a cycle from the Lovable CJS config). Forcing the Bun runtime (`--bun`) fixes it.
- Dev server serves on `http://localhost:8080` (port/host are set by `@lovable.dev/vite-tanstack-config`).

### Supabase secrets / what works without them
- `.env` ships only the anon `VITE_SUPABASE_*` / `SUPABASE_PUBLISHABLE_KEY` + `SUPABASE_URL`. There is **no `SUPABASE_SERVICE_ROLE_KEY`** in this environment.
- Without the service role key, the app boots and the public `/book` wizard loads real branches/specialties/doctors, but the availability resolver and booking-write path return empty/blocked, so you can't complete a persisted booking. `src/integrations/supabase/client.server.ts` (`supabaseAdmin`) throws if `SUPABASE_SERVICE_ROLE_KEY` is unset.
- The public booking API (`/api/public/book/create`) also requires a WhatsApp OTP verification challenge, so full bookings can't be driven end-to-end here.
- The `tests/rls/*` and Playwright `tests/e2e/*` suites require `SUPABASE_SERVICE_ROLE_KEY` (+ `E2E_*` accounts). They skip/fail without those secrets by design; unit tests and Vitest do NOT need any secret.

### Lint / test / typecheck (what CI actually gates on)
- CI's `lint-and-typecheck` job does NOT run the whole-repo `bun run lint` / `bun run format:check` clean — it runs scoped checks: `bun run lint:inserts`, `bun run lint:portal-tokens`, `codemod:portal-tokens:check`, plus doc/unit checks. See `.github/workflows/ci.yml`.
- Tests: `bun run test:vitest` (Vitest, no secrets) and the CI unit loop `for f in tests/unit/*.test.ts; do bun "$f"; done`. React tests: `bun test tests/react/`.
- `typecheck` calls **`tsgo`**, which comes from `@typescript/native-preview` and is **not a declared dependency**. Run it via `bunx @typescript/native-preview --noEmit` (or install that package) — plain `bun run typecheck` fails with `tsgo: command not found`.
