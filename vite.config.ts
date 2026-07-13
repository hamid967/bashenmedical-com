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
  plugins: [disableTanstackDevtoolsInjectSource(), imagetools(), mcpPlugin()],
});
