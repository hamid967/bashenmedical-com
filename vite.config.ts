// @lovable.dev/vite-tanstack-config already includes the following — do NOT add them manually
// or the app will break with duplicate plugins:
//   - tanstackStart, viteReact, tailwindcss, tsConfigPaths, nitro (build-only using cloudflare as a default target),
//     componentTagger (dev-only), VITE_* env injection, @ path alias, React/TanStack dedupe,
//     error logger plugins, and sandbox detection (port/host/strictPort).
// You can pass additional config via defineConfig({ vite: { ... }, etc... }) if needed.
import { defineConfig } from "@lovable.dev/vite-tanstack-config";
import { mcpPlugin } from "@lovable.dev/mcp-js/stacks/tanstack/vite";
import type { Plugin } from "vite";
import { imagetools } from "vite-imagetools";
import { VitePWA } from "vite-plugin-pwa";

/**
 * Neutralise `@tanstack/devtools:inject-source` (dev-only plugin bundled by
 * @lovable.dev/vite-tanstack-config). It annotates every JSX opening element
 * with `data-tsd-source="/src/…:L:C"`, which then differs between the SSR
 * pass and the client pass for some files (dynamically-imported or
 * client-only subtrees) and produces noisy — non-critical — hydration
 * warnings in dev. Prod builds don't run this plugin so nothing changes there.
 */
function disableTanstackDevtoolsInjectSource(): Plugin {
  return {
    name: "lovable:disable-tsd-inject-source",
    enforce: "pre",
    configResolved(config) {
      for (const plugin of config.plugins as ReadonlyArray<Plugin>) {
        if (plugin?.name === "@tanstack/devtools:inject-source") {
          // Replace the JSX transform with a no-op so no `data-tsd-source`
          // attributes are emitted, then hide the plugin from later dispatch.
          (plugin as { transform?: unknown }).transform = undefined;
          (plugin as { apply?: unknown }).apply = () => false;
        }
      }
    },
  };
}

export default defineConfig({
  tanstackStart: {
    // Redirect TanStack Start's bundled server entry to src/server.ts (our SSR error wrapper).
    // nitro/vite builds from this
    server: { entry: "server" },
  },
  // Inside a Lovable sandbox build, the preset is forced to cloudflare-module regardless.
  // Outside Lovable (e.g. GitHub Actions building for Netlify), this override applies and
  // Nitro emits a Netlify Functions bundle for SSR + server functions.
  // NITRO_PRESET=netlify in the CI env also wins if set.
  nitro: { preset: "netlify" },
  plugins: [
    disableTanstackDevtoolsInjectSource(),
    imagetools(),
    mcpPlugin(),
    VitePWA({
      strategies: "generateSW",
      // "prompt" tells vite-plugin-pwa to inject a SKIP_WAITING message
      // listener into the generated SW so our in-app update prompt can
      // activate the waiting worker on demand.
      registerType: "prompt",
      injectRegister: null,
      manifest: false, // we ship /site.webmanifest manually
      filename: "sw.js",
      devOptions: { enabled: false },
      workbox: {
        // The new SW waits until the user clicks "Update" (SKIP_WAITING message).
        // This prevents mid-session reloads and enables the in-app update prompt.
        clientsClaim: false,
        skipWaiting: false,
        cleanupOutdatedCaches: true,
        // Fallback served by workbox's built-in NavigationRoute for any nav
        // that isn't handled by the runtime NetworkFirst below (belt & braces).
        navigateFallback: "/offline.html",
        navigateFallbackDenylist: [
          /^\/~oauth/,
          /^\/api\//,
          /^\/sw-push\.js$/,
          /^\/sw\.js$/,
          /^\/offline\.html$/,
        ],
        // Explicitly precache offline.html so it's always available even if
        // globPatterns changes; it must be in cache for the fallback to work.
        additionalManifestEntries: [{ url: "/offline.html", revision: null }],
        globPatterns: ["**/*.{js,css,html,ico,png,svg,webp,avif,woff2}"],
        runtimeCaching: [
          {
            urlPattern: ({ request, sameOrigin }) => sameOrigin && request.mode === "navigate",
            handler: "NetworkFirst",
            options: {
              cacheName: "html-navigations",
              networkTimeoutSeconds: 4,
              expiration: { maxEntries: 30, maxAgeSeconds: 60 * 60 * 24 },
              // When both the network AND the runtime cache fail (e.g. user
              // is offline and this URL was never visited), serve the
              // precached offline shell so we never show the browser's
              // default "no internet" chrome page.
              plugins: [
                {
                  handlerDidError: async () => {
                    const cache = await caches.match("/offline.html", {
                      ignoreSearch: true,
                    });
                    return cache || Response.error();
                  },
                },
              ],
            },
          },
          {
            urlPattern: ({ url, sameOrigin }) =>
              sameOrigin && /\.(?:js|css|woff2|png|jpg|jpeg|webp|avif|svg|ico)$/i.test(url.pathname),
            handler: "CacheFirst",
            options: {
              cacheName: "static-assets",
              expiration: { maxEntries: 200, maxAgeSeconds: 60 * 60 * 24 * 30 },
            },
          },
        ],
      },
    }),
  ],
});
