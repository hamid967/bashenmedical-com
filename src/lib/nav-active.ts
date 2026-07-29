/**
 * Unified active-state helpers for nav links (Header + Footer).
 * All routes prefix-match by default; "/" is the only exact match.
 */

export const getActiveOptions = (to: string) => ({ exact: to === "/" });

/** Default active className for standard nav links. */
export const NAV_ACTIVE_CLASS = "text-primary bg-primary/10";

/** Active className for footer links (underline accent, no bg pill). */
export const FOOTER_ACTIVE_CLASS =
  "text-primary underline underline-offset-4 decoration-2 decoration-[color:var(--jazan-gold,#C7A46B)]";

/** Active className for "featured" header links (e.g. /team). */
export const NAV_ACTIVE_FEATURED_CLASS =
  "!bg-[color:var(--jazan-gold,#C7A46B)]/35 !ring-2 !text-[color:var(--jazan-teal,#075E63)] shadow-sm";

export const getNavActiveProps = (opts?: { featured?: boolean }) => ({
  className: opts?.featured ? NAV_ACTIVE_FEATURED_CLASS : NAV_ACTIVE_CLASS,
});

export const getFooterActiveProps = () => ({ className: FOOTER_ACTIVE_CLASS });
