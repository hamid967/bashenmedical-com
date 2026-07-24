# App icons & splash masters

Drop two PNG files here, then run `bun run assets` from `capacitor/`:

- `icon.png` — **1024×1024**, opaque background, full-bleed. Used as the app icon on iOS and Android.
- `splash.png` — **2732×2732**, centered logo (~30% of canvas) on the brand teal `#0f766e`. Used as the launch screen.

`@capacitor/assets` will fan these out into every device size automatically.
Do not commit generated derivative assets — only the two masters live here.
