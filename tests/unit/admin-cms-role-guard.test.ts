/**
 * Unit tests for CMS role guards + workflow transitions.
 * These do not hit Postgres; they exercise the guard helpers and the
 * `computeCompleteness` scorer used by the editor UI + submit-for-review flow.
 */
import { describe, it, expect, vi } from "vitest";
import {
  assertCmsEditor,
  assertCmsPublisher,
  assertCmsSuper,
  getCmsRole,
} from "@/lib/admin/cms/_guard";
import { computeCompleteness, CMS_KINDS } from "@/lib/admin/cms/schemas";

function makeSupabase(rolesHeld: string[]) {
  return {
    rpc: vi.fn(async (_fn: string, args: { _role: string }) => ({
      data: rolesHeld.includes(args._role),
      error: null,
    })),
  };
}

describe("CMS role guards", () => {
  it("editor guard: allows editor, admin, super_admin; denies others", async () => {
    await expect(
      assertCmsEditor({ supabase: makeSupabase(["editor"]), userId: "u" }),
    ).resolves.toBeUndefined();
    await expect(
      assertCmsEditor({ supabase: makeSupabase(["admin"]), userId: "u" }),
    ).resolves.toBeUndefined();
    await expect(
      assertCmsEditor({ supabase: makeSupabase(["super_admin"]), userId: "u" }),
    ).resolves.toBeUndefined();
    await expect(assertCmsEditor({ supabase: makeSupabase([]), userId: "u" })).rejects.toThrow();
    await expect(
      assertCmsEditor({ supabase: makeSupabase(["reception"]), userId: "u" }),
    ).rejects.toThrow();
  });

  it("publisher guard: denies plain editor", async () => {
    await expect(
      assertCmsPublisher({ supabase: makeSupabase(["editor"]), userId: "u" }),
    ).rejects.toThrow();
    await expect(
      assertCmsPublisher({ supabase: makeSupabase(["admin"]), userId: "u" }),
    ).resolves.toBeUndefined();
  });

  it("super guard: only super_admin", async () => {
    await expect(
      assertCmsSuper({ supabase: makeSupabase(["admin"]), userId: "u" }),
    ).rejects.toThrow();
    await expect(
      assertCmsSuper({ supabase: makeSupabase(["super_admin"]), userId: "u" }),
    ).resolves.toBeUndefined();
  });

  it("getCmsRole returns highest role", async () => {
    expect(
      await getCmsRole({ supabase: makeSupabase(["super_admin", "admin", "editor"]), userId: "u" }),
    ).toBe("super_admin");
    expect(await getCmsRole({ supabase: makeSupabase(["admin", "editor"]), userId: "u" })).toBe(
      "admin",
    );
    expect(await getCmsRole({ supabase: makeSupabase(["editor"]), userId: "u" })).toBe("editor");
    expect(await getCmsRole({ supabase: makeSupabase([]), userId: "u" })).toBe("none");
  });
});

describe("locale completeness", () => {
  it("empty payload → 0", () => {
    expect(computeCompleteness("article", {})).toBe(0);
  });
  it("article with title only fills 100% of required (title is required)", () => {
    const def = CMS_KINDS.article;
    const required = def.fields.filter((f) => f.required);
    expect(required.length).toBeGreaterThan(0);
    expect(computeCompleteness("article", { title: "hello" })).toBe(100);
  });
  it("home with headline required only", () => {
    expect(computeCompleteness("home", { headline: "x" })).toBe(100);
    expect(computeCompleteness("home", { headline: "" })).toBe(0);
  });
  it("kinds with no required fields count all fields", () => {
    // hours has no required fields; empty payload = 0/3
    expect(computeCompleteness("hours", {})).toBe(0);
    expect(computeCompleteness("hours", { weekday_hours: "9-5" })).toBeGreaterThan(0);
  });
});
