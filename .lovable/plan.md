# F2 — Native App (Capacitor)

Goal: ship real iOS/Android apps for patients on the App Store and Google Play, reusing the existing TanStack Start site instead of rebuilding it in a native framework.

## Strategy: Remote-URL Capacitor shell

The site runs on Cloudflare/Netlify with SSR — it is not a static SPA, so a "copy the `dist/` into the app" approach loses SSR, server functions, and auth cookies. The pragmatic path is a Capacitor shell that loads the published site (`https://bashenmedical.com`) inside a native WebView, and layers native-only capabilities on top:

- Native push (APNs / FCM) alongside our existing Web Push
- Biometric unlock (Face ID / Touch ID / fingerprint)
- Universal / App Links so `bashenmedical.com/...` opens directly in the app
- Native splash, status bar, safe-area handling, and app icons
- Store-ready metadata

App Store review requires the app to feel more than a wrapped site, so we also add: install-detected UI polish, native share integration, and a "Live from Baeshen" native badge count for unread notifications.

## Deliverables

```text
capacitor/                        (new folder — native project lives outside src/)
├── capacitor.config.ts           app id, server URL, plugins
├── ios/                          Xcode project (generated)
├── android/                      Gradle project (generated)
├── resources/
│   ├── icon.png                  1024×1024 master
│   └── splash.png                2732×2732 master
└── README.md                     build & release steps

src/lib/native/
├── bridge.ts                     detects Capacitor, exposes helpers
├── push-native.ts                registers APNs/FCM, syncs to push_subscriptions
└── biometric.ts                  Face ID unlock for /portal

src/routes/api/public/native/
└── register-device.ts            POST device token → stores native FCM/APNs subscription

supabase migration
└── adds device_platform + native_token columns to push_subscriptions
```

## Steps

1. Scaffold Capacitor in a `capacitor/` folder with `@capacitor/core`, `@capacitor/ios`, `@capacitor/android`, plus plugins: `@capacitor/push-notifications`, `@capacitor-community/biometric-auth`, `@capacitor/app`, `@capacitor/status-bar`, `@capacitor/splash-screen`, `@capacitor/share`, `@capacitor/badge`.
2. Point `capacitor.config.ts` `server.url` at `https://bashenmedical.com` (production) with `androidScheme: "https"`; document a `.env.local` override for staging (`project--*-dev.lovable.app`).
3. Add `src/lib/native/bridge.ts` that detects Capacitor via `window.Capacitor?.isNativePlatform()` and exposes typed accessors; gate all native code behind it so the web build ignores it.
4. Native push: on portal login, `push-native.ts` requests permission, registers with APNs/FCM, and POSTs the token to `/api/public/native/register-device` (auth via Supabase bearer). Server stores it in `push_subscriptions` with `platform='ios'|'android'`. Fan-out logic in `notifications.functions.ts` sends via FCM/APNs for native rows and Web Push for browser rows.
5. Biometric guard: after Supabase session load, if `Capacitor.isNativePlatform()` and user opted in via a new toggle on `/portal/settings`, prompt Face ID / fingerprint before revealing `/portal/*`.
6. Deep links: register `bashenmedical.com` as an App Link (Android `assetlinks.json`) and Universal Link (iOS `apple-app-site-association`). Both files served from `/api/public/.well-known/*` routes.
7. Icons & splash: run `@capacitor/assets` to generate every iOS/Android size from `icon.png` and `splash.png`. Icons match the existing brand teal `#0f766e`.
8. In-app UX polish: hide the "Install app" card when running native (already installed), add native `Share` API to the report/appointment pages, and reflect unread notification count on the app badge.
9. CI: add `.github/workflows/native-build.yml` (manual dispatch) that runs `pnpm cap sync` and builds unsigned iOS/Android artifacts for QA. Signing/store uploads stay manual for now — they need Apple/Google developer accounts you own.
10. Docs: `capacitor/README.md` with exact commands to run/build/deploy, plus checklists for App Store and Play Store submission (screenshots, privacy nutrition labels, permission strings).

## Non-goals (this phase)

- Rewriting screens as native components — the WebView is the UI.
- Offline mode beyond what the PWA service worker already provides.
- Automated store submission — needs your developer accounts and signing certs.

## Technical notes

- Server-URL apps must whitelist the origin in `capacitor.config.ts` (`allowNavigation`) and set `App-Bound Domains` on iOS or the WebView blocks navigation to `bashenmedical.com`.
- Push tokens are per-install and rotate; the register endpoint upserts by `(user_id, platform, token)` and prunes stale rows on server-side send failures (410/`NotRegistered`).
- Universal Links require serving `apple-app-site-association` with `Content-Type: application/json` and no redirects — the TanStack public API route handles both.
- `SUPABASE_URL` must be reachable from the WebView; nothing new to configure since the site already talks to it.
- New secrets needed later (when we do real push): `FCM_SERVER_KEY`, `APNS_KEY_ID`, `APNS_TEAM_ID`, `APNS_PRIVATE_KEY`. I will request them via `add_secret` only when we reach step 4's server side.

## What I need from you before step 4

- Apple Developer Team ID and bundle identifier (e.g. `com.baeshenmedical.patient`).
- Android package name.
- Firebase project (for FCM) — or approval to create one under your Google account.

Approving this plan starts with steps 1–3 and 7 (fully offline, no external accounts needed); we pause before step 4 to gather the credentials above.
