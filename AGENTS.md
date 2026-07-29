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

Runtime/tooling: this repo uses **Bun** (`bun.lock`) as the package manager and runtime. Node 22 and Python 3.12 are preinstalled; Bun is installed into `~/.bun/bin` (ensure it is on `PATH`). Standard commands live in `README.md` and `package.json` scripts — the notes below only cover non-obvious gotchas.

- **Dev server:** run `bun --bun run dev` (serves http://localhost:8080), NOT `bun run dev`. Plain `bun run dev` executes Vite 8 under Node and crashes with `ERR_REQUIRE_CYCLE_MODULE` (from `@lovable.dev/vite-tanstack-config`). The `--bun` flag runs Vite under the Bun runtime and works.
- **Typecheck:** the `typecheck` script calls `tsgo`, which is NOT in `package.json` deps, so `bun run typecheck` fails with `tsgo: command not found`. Use `bunx tsgo --noEmit` (package `@typescript/native-preview`), as the docs do. It currently reports 0 type errors.
- **Tests come in two styles:** `describe`-based specs run under `bun run test:vitest` (via the `bun:test`→`vitest` alias) or `bun test <dir>`; standalone script tests run via `bun <file>` (this is what the CI "Unit tests" loop does). Running a `describe`-based spec with plain `bun <file>` errors `Cannot use describe outside of the test runner`. `tests/react/` is not part of CI and has some pre-existing failing assertions.
- **Lint:** full `eslint .` (`bun run lint`) reports thousands of pre-existing issues and is NOT a CI gate. CI only runs scoped scripts: `format:check`, `lint:inserts`, `lint:portal-tokens`, `codemod:portal-tokens:check`. These can report pre-existing violations on non-`main` branches — the tooling itself runs fine.
- **Supabase secrets / booking writes:** `.env` ships only the publishable (anon) key + URL. Client-side reads (branches, specialties, doctors, `availability`) work. But: (1) server routes using the service-role admin client (`src/integrations/supabase/client.server.ts`) require `SUPABASE_SERVICE_ROLE_KEY` (absent), so `/api/public/book/*` availability+create, `inquiries/create`, and the `/book` wizard's date/availability step return nothing; (2) completing a booking is otherwise RLS-gated — a direct anon insert into `appointments` fails with `permission denied for function _appointment_belongs_to_me`, so it needs an authenticated patient session. To run RLS/E2E suites or complete a real booking, provide `SUPABASE_SERVICE_ROLE_KEY` (+ `E2E_ADMIN_EMAIL`/`E2E_PATIENT_*` for E2E). The `pre-push` husky hook runs `bun run check:rls` and will fail without these secrets (use `git push --no-verify` to bypass).
