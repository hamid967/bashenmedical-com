# Baeshen Medical — Native App (Capacitor)

This folder holds the Capacitor project that ships the Baeshen patient app to
the App Store and Google Play. It is a thin **native shell** around the
published web site (`https://bashenmedical.com`), so every feature built in
`../src/` works in the app with no duplication — including SSR, server
functions, and auth cookies.

Native-only capabilities layered on top:

- **Push notifications** via APNs (iOS) / FCM (Android), registered from
  `src/lib/native/push-native.ts`, stored via `/api/public/native/register-device`.
- **Biometric unlock** (Face ID / Touch ID / fingerprint) via
  `src/lib/native/biometric.ts`.
- **Universal Links / App Links** so `bashenmedical.com/...` opens directly
  in the app — served from `src/routes/.well-known.*`.
- **Native splash, status bar, share sheet, badge count**.

## Prerequisites (one-time)

- macOS + Xcode 15+ (iOS only)
- Android Studio (Iguana or newer) with an Android 13+ SDK
- Node 20 / bun installed
- CocoaPods (`sudo gem install cocoapods`)
- Apple Developer account + Team ID (for signing & Universal Links)
- Google Play Console account (for release signing) + Firebase project (FCM)

## First-time setup

```bash
cd capacitor
bun install
BAESHEN_NATIVE_SERVER_URL=https://bashenmedical.com bun run add:ios
BAESHEN_NATIVE_SERVER_URL=https://bashenmedical.com bun run add:android
```

`add:ios` / `add:android` generate `ios/` and `android/` folders (not
committed until you first sign the app — they contain machine-specific paths).

## Regenerate icons & splash

Drop your masters into `resources/`:

- `resources/icon.png` — 1024×1024 PNG, full-bleed, no transparency.
- `resources/splash.png` — 2732×2732 PNG, centered logo on brand background
  (`#0f766e` teal).

Then:

```bash
bun run assets
```

That generates every iOS/Android size in-place.

## Sync web assets & plugins

Whenever you change `capacitor.config.ts` or add a Capacitor plugin:

```bash
bun run sync
```

## Run in the emulator

```bash
bun run run:ios       # iOS Simulator
bun run run:android   # Android emulator or attached device
```

## Point at staging

By default the shell loads `https://bashenmedical.com`. To point at preview:

```bash
BAESHEN_NATIVE_SERVER_URL=https://project--<id>-dev.lovable.app bun run sync
```

## Deep links checklist

- Set `BAESHEN_IOS_APP_ID` in your web deployment env (e.g.
  `ABC1234567.com.baeshenmedical.patient`). Verify at
  `https://bashenmedical.com/.well-known/apple-app-site-association`.
- Set `BAESHEN_ANDROID_PACKAGE` and `BAESHEN_ANDROID_SHA256_CERT` in the
  same env. Verify at `https://bashenmedical.com/.well-known/assetlinks.json`.
- Enable "Associated Domains" in Xcode → Signing capabilities and add
  `applinks:bashenmedical.com`.
- Add `<intent-filter>` for `bashenmedical.com` with `android:autoVerify="true"`
  in `AndroidManifest.xml` (Capacitor CLI can do this via
  `cap-android:add-deep-link` or you can paste it manually).

## Push notifications — server side (deferred)

Native push send is enabled once these secrets are configured on the web
deployment:

- `FCM_SERVER_KEY` — from Firebase → Project settings → Cloud Messaging.
- `APNS_KEY_ID`, `APNS_TEAM_ID`, `APNS_PRIVATE_KEY` — from Apple Developer →
  Certificates, Identifiers & Profiles → Keys.

The fan-out logic in `src/lib/notifications.functions.ts` picks the right
transport per row in `push_subscriptions` (`platform` column).

## Store submission checklist

- [ ] App icons & splash generated
- [ ] Universal Links / App Links verified
- [ ] Privacy policy URL configured in App Store Connect & Play Console
- [ ] Screenshots for iPhone 6.7", 6.5", iPad, plus Android phone/tablet
- [ ] Privacy nutrition labels (health data, contact info)
- [ ] Permission strings in `Info.plist` (Push, Face ID, Camera if used)
- [ ] Android target SDK ≥ 34, min SDK ≥ 24
- [ ] Signed release build (Apple signing cert + Play upload key)
