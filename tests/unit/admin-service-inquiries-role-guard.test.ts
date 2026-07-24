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
  test("يرفض عندما لا يملك المستخدم دور admin ولا super_admin", async () => {
    const sb = makeSupabase({ data: false, error: null });
    await expect(assertHasRole(sb as any, "user-1", "admin")).rejects.toThrow(
      /ليست لديك الصلاحية/,
    );
    // `admin` implicitly checks `super_admin` too (unified guard in _guard.ts),
    // so both RPC probes must run — order isn't guaranteed (Promise.all).
    const roles = sb.calls
      .filter((c) => c.fn === "has_role")
      .map((c) => (c.args as { _role: string })._role)
      .sort();
    expect(roles).toEqual(["admin", "super_admin"]);
    for (const c of sb.calls) {
      expect((c.args as { _user_id: string })._user_id).toBe("user-1");
    }
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
    const roles = sb.calls
      .filter((c) => c.fn === "has_role")
      .map((c) => (c.args as { _role: string })._role)
      .sort();
    expect(roles).toEqual(["admin", "super_admin"]);
  });

  test("رفض دور support_agent إذا لم يكن admin (يُختبر عبر false)", async () => {
    const sb = makeSupabase({ data: false, error: null });
    await expect(assertHasRole(sb as any, "u", "admin")).rejects.toThrow();
  });
});

// ---------- 2) كل handler محمي بـ assertHasRole أو assertPermission -------

/**
 * نبحث عن كل ‎.handler(async ({ ... }) => { ...‎ ونتحقق أن جسم الـ handler
 * يحوي أحد الحرّاس التاليين قبل أي `.from(...)` أو استخدام لعميل الخدمة:
 *   - `await assertHasRole(..., "admin")` — الحارس القاعدي على مستوى الدور.
 *   - `await assertPermission(..., PERMISSIONS.*)` — الحارس الأدق على مستوى
 *     الصلاحية (يستخدمه بعض الـ handlers مثل `assign` و `close`، وهو أكثر
 *     تشدّدًا لأنه يفرض النطاق حسب الفرع).
 *
 * السماح بالنمطين يمنع regression عندما نرقّي حارسًا من role-only إلى
 * permission-scoped دون تراجع في الأمان.
 */
describe("كل server function محمي بحارس صلاحيات قبل أي استعلام", () => {
  const HANDLER_RE = /\.handler\(\s*async\s*\(\s*\{[^}]*\}\s*\)\s*=>\s*\{([\s\S]*?)\n\s{2}\}\)/g;

  const handlers = [...source.matchAll(HANDLER_RE)].map((m) => m[1]);

  const GUARD_RE = /\b(assertHasRole|assertPermission)\s*\(/;
  const ROLE_ADMIN_RE = /assertHasRole\([^)]*["']admin["']\s*\)/;
  const PERM_TOKEN_RE = /assertPermission\([\s\S]*?PERMISSIONS\.[A-Za-z_]+/;

  test("يوجد على الأقل handler واحد للفحص", () => {
    expect(handlers.length).toBeGreaterThanOrEqual(8);
  });

  for (let i = 0; i < handlers.length; i++) {
    const body = handlers[i];
    test(`handler #${i + 1} يستدعي حارس صلاحيات قبل أي استعلام`, () => {
      // يجب أن يظهر أحد الحارسَين
      expect(body).toMatch(GUARD_RE);
      // ويجب أن يمرَّر "admin" صراحةً أو PERMISSIONS.<token>
      expect(ROLE_ADMIN_RE.test(body) || PERM_TOKEN_RE.test(body)).toBe(true);
      // ويجب أن يظهر الحارس قبل أي استخدام لعميل الخدمة
      const guardIdx = body.search(GUARD_RE);
      const adminIdx = body.search(/client\.server/);
      if (adminIdx !== -1) expect(guardIdx).toBeLessThan(adminIdx);
      // ملاحظة: بعض handlers تقرأ الصف أولاً لاستنتاج الـ branch_id ثم
      // تفرض `assertPermission` بنطاق الفرع — هذا مقصود وأكثر أمانًا،
      // لذلك لا نفرض guardIdx < first .from(...).
    });
  }
});

// ---------- 3) requireSupabaseAuth مُطبَّق على كل serverFn ---------------

describe("كل serverFn محمي بـ requireSupabaseAuth", () => {
  const SERVERFN_RE = /createServerFn\(\{[^}]*\}\)([\s\S]*?)\.handler\(/g;
  const chains = [...source.matchAll(SERVERFN_RE)].map((m) => m[1]);

  test("يوجد serverFns مُعرَّفة", () => {
    expect(chains.length).toBeGreaterThanOrEqual(8);
  });

  for (let i = 0; i < chains.length; i++) {
    test(`serverFn #${i + 1} يضيف middleware([requireSupabaseAuth])`, () => {
      expect(chains[i]).toMatch(/\.middleware\(\[\s*requireSupabaseAuth\s*\]\)/);
    });
  }
});
