/**
 * Capacitor native shell configuration.
 *
 * Strategy: Load the published Baeshen web app inside a native WebView.
 * This preserves SSR, server functions, auth cookies, and every existing
 * TanStack Start feature — the native app is a thin shell that adds
 * device-only capabilities on top.
 *
 * The server URL can be overridden per environment via env vars set on the
 * machine running `cap sync` / `cap run` (see `capacitor/README.md`).
 *   BAESHEN_NATIVE_SERVER_URL=https://project--<id>-dev.lovable.app npx cap sync
 */
import type { CapacitorConfig } from "@capacitor/cli";

const SERVER_URL = process.env.BAESHEN_NATIVE_SERVER_URL?.trim() || "https://bashenmedical.com";

const config: CapacitorConfig = {
  appId: "com.baeshenmedical.patient",
  appName: "Baeshen Medical",
  webDir: "www", // unused (server.url takes over) but required by CLI
  bundledWebRuntime: false,
  server: {
    url: SERVER_URL,
    androidScheme: "https",
    cleartext: false,
    // The published site is the only origin we trust to navigate to.
    // Payment provider / OAuth callbacks that redirect off-origin should
    // still work because they come back to the same host.
    allowNavigation: [
      "bashenmedical.com",
      "www.bashenmedical.com",
      "*.bashenmedical.com",
      "*.lovable.app",
      "*.supabase.co",
    ],
  },
  ios: {
    contentInset: "always",
    limitsNavigationsToAppBoundDomains: true,
    scheme: "Baeshen",
  },
  android: {
    allowMixedContent: false,
    captureInput: true,
    webContentsDebuggingEnabled: false,
  },
  plugins: {
    SplashScreen: {
      launchShowDuration: 800,
      launchAutoHide: true,
      backgroundColor: "#0f766e",
      androidSplashResourceName: "splash",
      androidScaleType: "CENTER_CROP",
      showSpinner: false,
      splashFullScreen: true,
      splashImmersive: false,
    },
    StatusBar: {
      style: "LIGHT",
      backgroundColor: "#0f766e",
      overlaysWebView: false,
    },
    PushNotifications: {
      presentationOptions: ["badge", "sound", "alert"],
    },
  },
};

export default config;
