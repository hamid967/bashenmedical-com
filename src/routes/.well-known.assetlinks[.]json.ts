/**
 * GET /.well-known/assetlinks.json
 *
 * Android App Links manifest. The system fetches this file from
 * https://bashenmedical.com/.well-known/assetlinks.json to verify that
 * the `bashenmedical.com` domain is owned by our app's signing certificate,
 * so patient-app links open directly in the app instead of the browser.
 *
 * Requires two env vars once the Android build is signed:
 *   BAESHEN_ANDROID_PACKAGE       e.g. "com.baeshenmedical.patient"
 *   BAESHEN_ANDROID_SHA256_CERT   Colon-separated SHA-256 fingerprint of the release keystore
 */
import { createFileRoute } from "@tanstack/react-router";

export const Route = createFileRoute("/.well-known/assetlinks[.]json")({
  server: {
    handlers: {
      GET: async () => {
        const pkg = process.env.BAESHEN_ANDROID_PACKAGE?.trim();
        const cert = process.env.BAESHEN_ANDROID_SHA256_CERT?.trim();
        const statements =
          pkg && cert
            ? [
                {
                  relation: [
                    "delegate_permission/common.handle_all_urls",
                    "delegate_permission/common.get_login_creds",
                  ],
                  target: {
                    namespace: "android_app",
                    package_name: pkg,
                    sha256_cert_fingerprints: [cert],
                  },
                },
              ]
            : [];
        return new Response(JSON.stringify(statements, null, 2), {
          status: 200,
          headers: {
            "Content-Type": "application/json",
            "Cache-Control": "public, max-age=3600",
          },
        });
      },
    },
  },
});
