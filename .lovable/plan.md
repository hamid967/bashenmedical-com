# Phase 11 — Premium Visual System & Lightweight Intro

## Scope
Unify the visual language across public site, patient portal, and admin, then add a lightweight 5–8s intro controlled by Super Admin. No neon, no glass excess, no dead space, no duplicate components.

## Part A — Design System v3 (Medical Premium)

### 1. Token layer (`src/styles.css`)
Extend `@theme` with a single medical palette:
- Light (default, public):
  - `--background` warm ivory `oklch(0.99 0.005 90)`
  - `--foreground` deep slate `oklch(0.22 0.02 250)`
  - `--primary` Baeshen teal `oklch(0.52 0.09 195)`
  - `--secondary` Jazan sand `oklch(0.88 0.04 75)`
  - `--accent` muted gold `oklch(0.72 0.09 80)`
  - `--success/warning/destructive` restrained, AA on both themes
- Dark (portals only, opt-in via `.theme-portal-dark`): same tokens re-mapped, no pure black.
- Spacing scale `--s-1..--s-12` (4px base), radius `--radius-sm/md/lg/pill`, elevation `--shadow-1..3` (soft, no glow), motion `--ease-medical`, `--dur-fast/base/slow`.
- Respect `prefers-reduced-motion` globally (durations → 0.01ms).

### 2. Arabic typography
- Load "IBM Plex Sans Arabic" + "Inter" via `<link>` in `__root.tsx` head (preconnect + stylesheet), never `@import` in CSS.
- `--font-sans-ar`, `--font-sans-en`; body auto-picks by `<html dir>`.
- Line-height 1.7 for Arabic body, tabular-nums for numeric cells.

### 3. RTL/LTR
- Keep `dir` on `<html>` driven by i18n; audit primitives for logical properties (`ps-*`, `pe-*`, `text-start`) — replace lingering `pl-*/pr-*` in shared components only (no business logic changes).

### 4. Unified primitives (`src/components/ui-v3/`)
Thin wrappers over existing shadcn to enforce the tokens; existing imports keep working via re-exports:
- `Button` (variants: primary, secondary, ghost, danger, link; sizes sm/md/lg/icon with min 44px tap on md+).
- `Input`, `Textarea`, `Select`, `Field` (label+hint+error slot).
- `Card` (flat, subtle border, `--shadow-1`), `SectionCard` (used across dashboards).
- `DataTable` (reuses `DataTableV2`, restyled headers, zebra off by default).
- `StatusBadge` (semantic: success/info/warn/danger/neutral + medical: pending/in-progress/completed/cancelled).
- `Dialog`, `Sheet`, `Toast` — re-exported with tokenized shadow/radius.

Prevents duplication: single source, delete `ui-legacy` components that shipped duplicates (Owner, Command-Center variants) → forward to `ui-v3`.

### 5. Original SVG icon set (`src/components/icons/`)
Hand-authored 24px stroke icons for the 20 most-used medical concepts (appointment, prescription, lab, radiology, family, insurance, invoice, report, doctor, branch, home-care, nurse, inbox, alert, calendar, clock, shield, heart-pulse, mosque-arch motif, palm-frond motif). Tree-shakeable named exports.

### 6. Jazan motif system
Restrained SVG decorative primitives (arch corner, palm-frond divider, geometric star). Used sparingly in hero, empty-states, and intro; never behind form fields.

### 7. Accessibility gates
- All new tokens verified AA (4.5:1 body, 3:1 large) in both themes via `scripts/a11y/contrast-check.ts`.
- Focus ring token `--ring` visible on all themes; no `outline-none` without `outline-hidden` fallback.

## Part B — Lightweight Intro (5–8s)

### Route & control
- `src/components/intro/BaeshenIntro.tsx` — SVG + CSS animation only (no video, no autoplay audio, no heavy Lottie unless <20 KB gzip).
- Mounted once at `__root.tsx` inside `<ClientOnly>`, above `<Outlet />` as an overlay.
- Preloads homepage in parallel: it never blocks route hydration, `/book`, or `/auth/*` — those routes short-circuit intro immediately.

### Animation
- 0.0s: warm ivory bg fades in, Skip button appears in top-left (RTL: top-right).
- 0.4–2.2s: Baeshen wordmark strokes draw in (`stroke-dasharray`).
- 1.6–4.5s: Jazan arch + palm-frond motif fades behind logo.
- 3.0–5.5s: tagline `رعاية حديثة بروح جازان` fades up.
- 5.5–6.5s: overlay fades out, unmounts.
- `prefers-reduced-motion`: static single-frame poster for 1.2s then dismiss.

### Skip / never-block rules
- Skip button focusable on mount, `Esc` also dismisses.
- Auto-skip if route is `/book`, `/auth`, `/patient`, `/admin`, `/owner`.
- Auto-skip if session flag `intro_seen_<version>` present.
- Auto-skip if network `saveData` or `effectiveType` is `2g`/`slow-2g`.

### Super Admin control
- New table `public.intro_settings` (singleton row): `enabled`, `frequency` (`once_per_session` | `once_per_day` | `every_visit` | `off`), `version`, `tagline_ar`, `tagline_en`, `max_duration_ms`, `show_on_paths` (text[]), `hide_on_paths` (text[]), updated_by, updated_at. RLS: read = anon+authenticated, write = super_admin only. GRANTs per rules.
- Server fn `getIntroConfig` (public, publishable client, projected columns).
- Admin page `/admin/appearance/intro` under Content-Hub: toggle, frequency selector, tagline editor, path allow/deny, live preview button.

### Telemetry
- Fires one `intro_shown` / `intro_skipped` inbox_event (lightweight) per session; no PII.

## Part C — Rollout & guards
- Feature flag `ui.designSystemV3` (default on) and `ui.intro` (default off until Super Admin enables).
- Keep legacy component paths as re-exports for one release; add lint rule warning on direct imports of `ui-legacy/*`.
- Visual regression: extend `tests/e2e/visual/` with snapshots for Button, Card, StatusBadge, Intro (reduced-motion + full).
- Playwright test: `/book` never shows intro; `Skip` dismisses < 100ms; auth flow uninterrupted.

## Deliverables
1. Tokens + Arabic fonts wired in `src/styles.css` and `__root.tsx`.
2. `src/components/ui-v3/*` unified primitives + icon set + Jazan motifs.
3. `BaeshenIntro` overlay + config plumbing.
4. `intro_settings` migration (schema + GRANTs + RLS + seed row).
5. `/admin/appearance/intro` control page inside Content-Hub.
6. A11y contrast script + Playwright specs for intro and never-block rules.
7. Docs: `docs/design/system-v3.md` with usage rules and don'ts.

## Technical notes
- Fonts via `<link>` (preconnect + stylesheet) — never `@import` a URL.
- `@theme inline` mapping for shadcn tokens so `border-border`, `bg-background`, etc. resolve.
- No `tailwind.config.js`; all tokens live in `src/styles.css`.
- Intro overlay uses `position: fixed` + `pointer-events` toggled off during fade-out so it never eats clicks.
- Reduced-motion path bypasses all keyframes; a single opacity transition only.
