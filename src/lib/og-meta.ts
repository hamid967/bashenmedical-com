import ogHomeAsset from "@/assets/og-home-bmc.jpg.asset.json";

export const BMC_OG_IMAGE = `https://bashenmedical.com${ogHomeAsset.url}`;
export const BMC_OG_IMAGE_ALT_AR = "مجمع باعشن الطبي — رعاية صحية موثوقة";
export const BMC_OG_IMAGE_ALT_EN = "Baeshen Medical Center — Trusted Healthcare";

/**
 * Default OG/Twitter image meta tags using the BMC brand image.
 * Spread into a route's `meta` array. Routes that set a page-specific
 * og:image should place it AFTER this spread so it overrides the default.
 */
export const bmcOgImageMeta = () =>
  [
    { property: "og:image", content: BMC_OG_IMAGE },
    { property: "og:image:secure_url", content: BMC_OG_IMAGE },
    { property: "og:image:type", content: "image/jpeg" },
    { property: "og:image:width", content: "1200" },
    { property: "og:image:height", content: "630" },
    { property: "og:image:alt", content: BMC_OG_IMAGE_ALT_AR },
    { name: "twitter:card", content: "summary_large_image" },
    { name: "twitter:image", content: BMC_OG_IMAGE },
    { name: "twitter:image:alt", content: BMC_OG_IMAGE_ALT_EN },
  ] as const;
