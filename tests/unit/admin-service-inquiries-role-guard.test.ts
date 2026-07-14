/**
 * Unit + integration tests: admin/service-inquiries.functions.ts
 *
 * الهدف: التأكد أن كل عمليات الأدمن على استفسارات الخدمات مرفوضة
 * عند غياب دور "admin"، حتى لو تم استدعاء `assertHasRole` مباشرة
 * أو تم تخطّي واجهة المستخدم.
 *
 * يتحقق الاختبار من:
 *   1) سلوك `assertHasRole` عبر `rpc('has_role', ...)` — يرفض/يقبل صحيحًا.
 *   2) أن كل handler مُصدَّر في الملف يبدأ فعلًا باستدعاء
 *      `await assertHasRole(context.supabase, context.userId, "admin")`.
 *      (تحليل ثابت للمصدر — يمنع أي مستقبلاً من نسيان الحارس.)
 *
 * Run:  bun test tests/unit/admin-service-inquiries-role-guard.test.ts
 */
import { describe, test, expect } from "bun:test";
import { readFileSync } from "node:fs";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { assertHasRole } from "../../src/lib/admin/service-inquiries.functions";

const __dirname = dirname(fileURLToPath(import.meta.url));
const SRC = resolve(
  __dirname,
  "../../src/lib/admin/service-inquiries.functions.ts",
);
const source = readFileSync(SRC, "utf8");

// ---------- 1) assertHasRole runtime behaviour ---------------------------

function makeSupabase(response: { data: unknown; error: unknown }) {
  const calls: Array<{ fn: string; args: unknown }> = [];
  return {
    calls,
    rpc: async (fn: string, args: unknown) => {
      calls.push({ fn, args });
      return response;
    },
  } as const;
}

describe("assertHasRole", () => {
  test("يرفض عندما لا يملك المستخدم دور admin", async () => {
    const sb = makeSupabase({ data: false, error: null });
    await expect(assertHasRole(sb as any, "user-1", "admin")).rejects.toThrow(
      /ليست لديك الصلاحية/,
    );
    expect(sb.calls).toEqual([
      { fn: "has_role", args: { _user_id: "user-1", _role: "admin" } },
    ]);
  });

  test("يرفض عند خطأ RPC ولا يمرّر كأنه مسموح", async () => {
    const sb = makeSupabase({
      data: null,
      error: { message: "db down" },
    });
    await expect(assertHasRole(sb as any, "user-1", "admin")).rejects.toThrow(
      /تعذّر التحقق من الصلاحية/,
    );
  });

  test("يقبل عندما يعيد RPC true للدور admin", async () => {
    const sb = makeSupabase({ data: true, error: null });
    await expect(
      assertHasRole(sb as any, "user-1", "admin"),
    ).resolves.toBe(true);
  });

  test("الافتراضي هو admin حتى لو لم يُمرَّر الدور صراحة", async () => {
    const sb = makeSupabase({ data: true, error: null });
    await assertHasRole(sb as any, "user-1");
    expect(sb.calls[0]).toEqual({
      fn: "has_role",
      args: { _user_id: "user-1", _role: "admin" },
    });
  });

  test("رفض دور support_agent إذا لم يكن admin (يُختبر عبر false)", async () => {
    const sb = makeSupabase({ data: false, error: null });
    await expect(assertHasRole(sb as any, "u", "admin")).rejects.toThrow();
  });
});

// ---------- 2) كل handler يبدأ باستدعاء assertHasRole('admin') ----------

/**
 * نبحث عن كل ‎.handler(async ({ ... }) => { ...‎ ونتحقق أن
 * أول تعبير فعّال بعد الفتح يحوي:
 *   await assertHasRole(context.supabase, context.userId, "admin")
 * أو الصيغة المكافئة بعد تفكيك context.
 */
describe("كل server function يستدعي assertHasRole('admin') في البداية", () => {
  // كل تعريف handler async
  const HANDLER_RE = /\.handler\(\s*async\s*\(\s*\{[^}]*\}\s*\)\s*=>\s*\{([\s\S]*?)\n\s{2}\}\)/g;

  const handlers = [...source.matchAll(HANDLER_RE)].map((m) => m[1]);

  test("يوجد على الأقل handler واحد للفحص", () => {
    expect(handlers.length).toBeGreaterThanOrEqual(9);
  });

  for (let i = 0; i < handlers.length; i++) {
    const body = handlers[i];
    test(`handler #${i + 1} يستدعي assertHasRole('admin') قبل أي استعلام`, () => {
      // يجب أن يظهر assertHasRole
      expect(body).toMatch(/assertHasRole\s*\(/);
      // يجب أن يُمرَّر الدور "admin" صراحةً
      expect(body).toMatch(/assertHasRole\([^)]*["']admin["']\s*\)/);
      // ويجب أن يظهر قبل أي استدعاء لـ supabase.from(...) أو import admin
      const guardIdx = body.search(/assertHasRole\s*\(/);
      const fromIdx = body.search(/\.from\s*\(/);
      const adminIdx = body.search(/client\.server/);
      if (fromIdx !== -1) expect(guardIdx).toBeLessThan(fromIdx);
      if (adminIdx !== -1) expect(guardIdx).toBeLessThan(adminIdx);
    });
  }
});

// ---------- 3) requireSupabaseAuth مُطبَّق على كل serverFn ---------------

describe("كل serverFn محمي بـ requireSupabaseAuth", () => {
  const SERVERFN_RE = /createServerFn\(\{[^}]*\}\)([\s\S]*?)\.handler\(/g;
  const chains = [...source.matchAll(SERVERFN_RE)].map((m) => m[1]);

  test("يوجد serverFns مُعرَّفة", () => {
    expect(chains.length).toBeGreaterThanOrEqual(9);
  });

  for (let i = 0; i < chains.length; i++) {
    test(`serverFn #${i + 1} يضيف middleware([requireSupabaseAuth])`, () => {
      expect(chains[i]).toMatch(/\.middleware\(\[\s*requireSupabaseAuth\s*\]\)/);
    });
  }
});
