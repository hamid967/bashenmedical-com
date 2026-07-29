import { describe, expect, it } from "bun:test";
import {
  FOOTER_ACTIVE_CLASS,
  NAV_ACTIVE_CLASS,
  NAV_ACTIVE_FEATURED_CLASS,
  getActiveOptions,
  getFooterActiveProps,
  getNavActiveProps,
} from "@/lib/nav-active";

describe("nav-active: getActiveOptions", () => {
  it("marks root '/' as exact-match only", () => {
    expect(getActiveOptions("/")).toEqual({ exact: true });
  });

  it.each([
    "/team",
    "/about",
    "/doctors",
    "/specialties",
    "/branches",
    "/excellence",
    "/book",
    "/contact",
  ])("uses prefix (non-exact) match for %s", (path) => {
    expect(getActiveOptions(path)).toEqual({ exact: false });
  });

  it("prefix match implies sub-routes activate the link (semantic contract)", () => {
    // TanStack's <Link> treats exact:false as prefix-match. This test locks
    // the contract that /team/leadership, /doctors/$id, etc. keep parent active.
    const cases = ["/team", "/doctors", "/specialties", "/branches"];
    for (const parent of cases) {
      const { exact } = getActiveOptions(parent);
      expect(exact).toBe(false);
    }
  });
});

describe("nav-active: getNavActiveProps (Header)", () => {
  it("returns the standard nav active class by default", () => {
    expect(getNavActiveProps()).toEqual({ className: NAV_ACTIVE_CLASS });
    expect(getNavActiveProps({ featured: false })).toEqual({
      className: NAV_ACTIVE_CLASS,
    });
  });

  it("returns the featured class for featured links (e.g. /team)", () => {
    expect(getNavActiveProps({ featured: true })).toEqual({
      className: NAV_ACTIVE_FEATURED_CLASS,
    });
  });

  it("featured and standard classes are distinct", () => {
    expect(NAV_ACTIVE_FEATURED_CLASS).not.toBe(NAV_ACTIVE_CLASS);
  });
});

describe("nav-active: getFooterActiveProps (Footer)", () => {
  it("returns the footer underline class", () => {
    expect(getFooterActiveProps()).toEqual({ className: FOOTER_ACTIVE_CLASS });
  });

  it("footer active class visibly differs from header active classes", () => {
    expect(FOOTER_ACTIVE_CLASS).not.toBe(NAV_ACTIVE_CLASS);
    expect(FOOTER_ACTIVE_CLASS).not.toBe(NAV_ACTIVE_FEATURED_CLASS);
  });
});
