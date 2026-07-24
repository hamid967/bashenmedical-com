# Phase 6 — Patient Content & Recommendation Engine

Build a configurable content engine that powers the patient dashboard "cards" (announcements, offers, screening campaigns, new services, reminders, doctor spotlights, nearest-slot suggestions, related services) with bilingual content, moderation workflow, targeting, and click/impression analytics.

## 1. Data model (single migration)

New tables (all with `GRANT` + RLS + `updated_at` trigger):

- `content_items`
  - `type` enum: `announcement | offer | screening | new_service | reminder | doctor_spotlight | nearest_slot | suggested_service`
  - `status` enum: `draft | review | approved | scheduled | published | archived`
  - `title_ar/title_en`, `body_ar/body_en`, `excerpt_ar/excerpt_en`
  - `image_url`, `cta_label_ar/en`, `cta_href`
  - `starts_at`, `ends_at`, `priority` (int, higher = first)
  - `branch_id` (nullable = all branches), `specialty_id` (nullable)
  - `audience` jsonb: `{ languages?: ['ar','en'], hasBookedSpecialty?: uuid[], preferredBranch?: uuid[], newPatientOnly?: bool, minAgeYears?, maxAgeYears? }`
  - `is_promotional` bool (drives the "إعلان" label)
  - `disabled_at` timestamptz (immediate kill switch, independent of status)
  - `created_by`, `approved_by`, timestamps

- `content_item_versions` — audit history of every status/content change.

- `content_impressions` — `(item_id, user_id nullable, session_id, shown_at, surface)`; append-only.
- `content_clicks` — same shape + `href_at_click`.
- Materialized daily rollup `content_item_stats` refreshed by pg_cron.

Indexes: `(status, starts_at, ends_at)`, `(type, priority DESC)`, `(branch_id)`.

RLS:
- Patients: no direct SELECT — everything served by server functions.
- `content_editor`, `admin`, `super_admin`: full CRUD via `has_role`.
- `service_role`: all.

## 2. Server layer

`src/lib/content/content.functions.ts` (patient-facing, `requireSupabaseAuth`):
- `getPatientContentFeed({ surface, limit })` — resolves the current patient's profile (preferred branch, language, booked specialties from `appointments`), then queries `content_items` where `status='published' AND disabled_at IS NULL AND now() BETWEEN starts_at AND ends_at`, applies audience filters in SQL, orders by `priority DESC, starts_at DESC`. Returns bilingual DTO ready for the dashboard.
- `logContentImpression(itemId, surface)` and `logContentClick(itemId, surface, href)` — insert rows; use `pg_net`-safe fire-and-forget from the client via a small `/api/public/content/track` route so we don't block navigation.

`src/lib/admin/content.functions.ts` (admin, `assertHasRole('content_editor'|'admin'|'super_admin')`):
- `listContentItems`, `getContentItem`, `upsertContentItem`, `transitionStatus` (enforces `draft→review→approved→scheduled→published→archived` graph), `toggleDisabled(itemId, disabled)`, `getContentStats(itemId, range)`.

Nearest-slot / doctor-spotlight items are computed live: `type='nearest_slot'` rows carry only the query (`specialty_id`, `branch_id`) and the resolver hydrates the actual next available slot from existing `getAvailability` helpers at read time — no stale slots stored.

## 3. Patient dashboard integration

- New component `src/components/patient/ContentFeed.tsx` renders a card row per surface (`dashboard_hero`, `dashboard_bento`, `dashboard_footer`).
- Each card is bilingual (uses `profile.preferred_language`), shows an "إعلان / Sponsored" chip when `is_promotional`, and never overlays or blocks primary CTAs — it sits below the "required actions" section on the dashboard, above announcements.
- IntersectionObserver-based impression logging (dedupe per session).
- Click → `logContentClick` → navigate to `cta_href`.
- Replaces the current hard-coded `announcements` and `offers` blocks in `patient.index.tsx` with the new feed (announcements/offers are just two `type` values now).

## 4. Admin console

`src/routes/_authenticated/admin.content.tsx` + child routes:
- List with filters (type, status, branch, date).
- Editor with bilingual tabs, image picker (existing `MediaPicker`), audience builder, CTA config, scheduling.
- Status transition buttons; "Disable now" kill switch always visible.
- Analytics tab: impressions, clicks, CTR by day, top branches.

## 5. Safety rules

- Server never returns diagnostic language: content is authored copy only; no inference of undiagnosed conditions. Add a lint list of banned phrases enforced in `upsertContentItem` (rejects medical claim keywords in `body_*`).
- Promotional items require `is_promotional=true` and are always rendered with the sponsored label; screening/reminder types cannot be marked promotional.
- Recommendation inputs limited to: preferred branch, language, general prefs, previously booked specialty, availability. No health-record derived targeting.

## 6. Tests

- `tests/unit/content-audience-match.test.ts` — audience filter unit tests.
- `tests/rls/content-items-rls.test.ts` — non-editor cannot mutate.
- `tests/e2e/patient_content_feed.py` — feed renders, impression + click logged, disabled item disappears within one refetch.

## 7. Rollout

1. Migration + grants + RLS.
2. Server functions + tracking route.
3. Admin CRUD console.
4. Patient dashboard feed (behind `content_feed` V3 flag, default on for patients).
5. Backfill: migrate existing `announcements` rows into `content_items` as `type='announcement'`.

## Technical details

- Reuse `has_role(uuid, app_role)` for RLS; add `'content_editor'` to `app_role` if not already present (it exists — verified in earlier phases).
- Live nearest-slot resolution reuses `/api/public/book/availability` internals, not a duplicate query.
- Tracking route is public (`/api/public/content/track`) with Zod validation, per-IP rate limit via existing `src/lib/rate-limit.server.ts`, and signature-free anon inserts scoped by RLS `WITH CHECK (true)` on the two log tables only.
- All timestamps stored UTC; audience/date evaluation done in SQL with `now()` to keep the query index-friendly.
