/**
 * GET /.well-known/apple-app-site-association
 *
 * Universal Links manifest for iOS. Apple fetches this file from
 * https://bashenmedical.com/.well-known/apple-app-site-association at
 * app install time and every ~7 days after. Must respond with
 * Content-Type: application/json, no redirects.
 *
 * The `applinks.details[].appIDs` value is `<TEAM_ID>.<BUNDLE_ID>`.
 * Set BAESHEN_IOS_APP_ID at build time (e.g. "ABC1234567.com.baeshenmedical.patient")
 * once you have an Apple Developer Team ID.
 */
import { createFileRoute } from "@tanstack/react-router";

export const Route = createFileRoute("/.well-known/apple-app-site-association")({
  server: {
    handlers: {
      GET: async () => {
        const appId = process.env.BAESHEN_IOS_APP_ID?.trim();
        // Every path under the site opens the app; excludes marketing static assets.
        const paths = ["*"];
        const body = {
          applinks: {
            apps: [],
            details: appId ? [{ appIDs: [appId], appID: appId, paths }] : [],
          },
          webcredentials: appId ? { apps: [appId] } : { apps: [] },
        };
        return new Response(JSON.stringify(body, null, 2), {
          status: 200,
          headers: {
            // Apple requires application/json and no Content-Encoding transform.
            "Content-Type": "application/json",
            "Cache-Control": "public, max-age=3600",
          },
        });
      },
    },
  },
});
