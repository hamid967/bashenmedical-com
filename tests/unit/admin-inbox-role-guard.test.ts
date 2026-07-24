/**
 * Unit smoke tests: `/admin/inbox/$id` role-gating.
 *
 * يتحقق من أن لوحة تفاصيل الصندوق الموحّد تُظهر الإجراءات المسموح بها
 * فقط لكل دور، وأن محاولة تنفيذ إجراء غير مسموح تُرفض على الخادم.
 *
 * التغطية:
 *   1) `isActionAllowedForRoles` تعكس المصفوفة النهائية للأذونات:
 *      - admin / super_admin: كل الإجراءات (بما فيها merge/archive/reopen)
 *      - reception / support_agent: كل الإجراءات ما عدا الإجراءات المقيّدة
 *      - بلا دور: لا شيء
 *   2) `assertAllowed` يرمي رسالة عربية عند محاولة إجراء مقيّد بلا دور admin
 *      (يمثّل الرفض الفعلي على الخادم داخل كل handler).
 *   3) تحليل ثابت لمصدر `admin.inbox.$id.tsx` يضمن أن الأزرار المقيّدة
 *      (دمج/أرشفة/إعادة فتح) لا تُعرض إلا خلف حارس الدور
 *      (`isActionAllowedForRoles(...)` أو `<Can>` مكافئ).
 *   4) تحليل ثابت لمصدر `inbox.functions.ts` يؤكد أن كل serverFn من
 *      الإجراءات المقيّدة يستدعي `assertAllowed(roles, "<action>")`.
 *
 * Run:  bun test tests/unit/admin-inbox-role-guard.test.ts
 */
import { describe, test, expect } from "bun:test";
import { readFileSync } from "node:fs";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import {
  ADMIN_ONLY_ACTIONS,
  INBOX_ACTIONS,
  STAFF_ROLES,
  assertAllowed,
  isActionAllowedForRoles,
  type InboxActionKind,
  type StaffRole,
} from "../../src/lib/admin/inbox.functions";

const __dirname = dirname(fileURLToPath(import.meta.url));
const FN_SRC = resolve(__dirname, "../../src/lib/admin/inbox.functions.ts");
const UI_SRC = resolve(
  __dirname,
  "../../src/routes/_authenticated/admin.inbox.$id.tsx",
);
const fnSource = readFileSync(FN_SRC, "utf8");
const uiSource = readFileSync(UI_SRC, "utf8");

const NON_RESTRICTED_ACTIONS: InboxActionKind[] = INBOX_ACTIONS.filter(
  (a) => a !== "created" && !ADMIN_ONLY_ACTIONS.has(a),
);
const RESTRICTED_ACTIONS: InboxActionKind[] = [...ADMIN_ONLY_ACTIONS];

// ---------- 1) مصفوفة الأذونات (per-role) ------------------------------

describe("isActionAllowedForRoles — مصفوفة الأذونات", () => {
  const cases: Array<{ role: StaffRole; restrictedAllowed: boolean }> = [
    { role: "admin", restrictedAllowed: true },
    { role: "super_admin", restrictedAllowed: true },
    { role: "reception", restrictedAllowed: false },
    { role: "support_agent", restrictedAllowed: false },
  ];

  for (const { role, restrictedAllowed } of cases) {
    test(`دور ${role}: يرى جميع الإجراءات العامة`, () => {
      for (const a of NON_RESTRICTED_ACTIONS) {
        expect(isActionAllowedForRoles([role], a)).toBe(true);
      }
    });

    test(`دور ${role}: الإجراءات المقيّدة ${restrictedAllowed ? "مسموحة" : "مرفوضة"}`, () => {
      for (const a of RESTRICTED_ACTIONS) {
        expect(isActionAllowedForRoles([role], a)).toBe(restrictedAllowed);
      }
    });
  }

  test("مستخدم بلا أي دور: لا يرى أي إجراء", () => {
    for (const a of INBOX_ACTIONS) {
      if (a === "created") continue;
      expect(isActionAllowedForRoles([], a)).toBe(false);
    }
  });

  test("STAFF_ROLES يحتوي بالضبط على الأدوار الأربعة المتوقعة", () => {
    expect([...STAFF_ROLES].sort()).toEqual(
      ["admin", "reception", "super_admin", "support_agent"].sort(),
    );
  });

  test("ADMIN_ONLY_ACTIONS مطابق للمواصفات (merge/archive/reopen)", () => {
    expect([...ADMIN_ONLY_ACTIONS].sort()).toEqual(
      ["archive", "merge_duplicate", "reopen"].sort(),
    );
  });
});

// ---------- 2) رفض الخادم للإجراء المقيّد بلا دور admin -----------------

describe("assertAllowed — يرفض على الخادم كل إجراء مقيّد بلا دور admin", () => {
  for (const action of RESTRICTED_ACTIONS) {
    test(`reception يحاول ${action} → رفض`, () => {
      expect(() => assertAllowed(["reception"], action)).toThrow(
        /صلاحية مسؤول/,
      );
    });
    test(`support_agent يحاول ${action} → رفض`, () => {
      expect(() => assertAllowed(["support_agent"], action)).toThrow(
        /صلاحية مسؤول/,
      );
    });
    test(`بلا أي دور يحاول ${action} → رفض`, () => {
      expect(() => assertAllowed([], action)).toThrow(/صلاحية مسؤول/);
    });
    test(`admin يستطيع ${action}`, () => {
      expect(() => assertAllowed(["admin"], action)).not.toThrow();
    });
    test(`super_admin يستطيع ${action}`, () => {
      expect(() => assertAllowed(["super_admin"], action)).not.toThrow();
    });
  }

  test("الإجراءات العامة لا تُرفض لأي دور staff", () => {
    for (const role of STAFF_ROLES) {
      for (const a of NON_RESTRICTED_ACTIONS) {
        expect(() => assertAllowed([role], a)).not.toThrow();
      }
    }
  });
});

// ---------- 3) تحليل ثابت: كل serverFn مقيّد يستدعي assertAllowed --------

describe("كل serverFn لإجراء مقيّد يستدعي assertAllowed(...) قبل الكتابة", () => {
  const MAP: Record<string, InboxActionKind> = {
    mergeInboxDuplicate: "merge_duplicate",
    archiveInboxItem: "archive",
    reopenInboxItem: "reopen",
  };

  for (const [fnName, action] of Object.entries(MAP)) {
    test(`${fnName} يضم assertAllowed(roles, "${action}")`, () => {
      // نلتقط جسم الـ serverFn من التصدير حتى نهاية أول });
      const re = new RegExp(
        `export const ${fnName}[\\s\\S]*?\\.handler\\([\\s\\S]*?\\n\\s{2}\\}\\);`,
      );
      const m = fnSource.match(re);
      expect(m, `did not find handler body for ${fnName}`).toBeTruthy();
      const body = m![0];
      expect(body).toMatch(
        new RegExp(`assertAllowed\\([^)]*["']${action}["']\\s*\\)`),
      );
      // يظهر قبل أي استدعاء لـ logEvent أو .update/.insert/.delete
      const guardIdx = body.search(/assertAllowed\s*\(/);
      const writeIdx = body.search(/logEvent\s*\(|\.update\s*\(|\.delete\s*\(/);
      if (writeIdx !== -1) expect(guardIdx).toBeLessThan(writeIdx);
    });
  }
});

// ---------- 4) UI لا يعرض الأزرار المقيّدة إلا خلف حارس الدور -----------

describe("لوحة التفاصيل تُخفي الإجراءات المقيّدة عن الأدوار غير المسؤولة", () => {
  // الشرط: كل Panel للإجراءات المقيّدة يجب أن يكون داخل تعبير يحوي
  // إما `isActionAllowedForRoles(` أو `<Can ` أو `canAdminAction` أو ما شابه.
  const RESTRICTED_PANEL_MARKERS = [
    'title="دمج مكرر"',
    'title="أرشفة / إعادة فتح"',
  ];

  test("مؤشرات لوحات الإجراءات المقيّدة موجودة في المصدر", () => {
    for (const marker of RESTRICTED_PANEL_MARKERS) {
      expect(uiSource.includes(marker)).toBe(true);
    }
  });

  test("كل لوحة مقيّدة محاطة بحارس role/permission", () => {
    for (const marker of RESTRICTED_PANEL_MARKERS) {
      const idx = uiSource.indexOf(marker);
      expect(idx).toBeGreaterThan(0);
      // ابحث في الـ 400 محرفًا السابقة عن حارس صريح.
      const window = uiSource.slice(Math.max(0, idx - 600), idx);
      const hasGuard =
        /isActionAllowedForRoles\s*\(/.test(window) ||
        /<Can\b/.test(window) ||
        /\bcan(Merge|Archive|Reopen|Admin\w*)\b/.test(window) ||
        /isAdmin\s*(?:\?|&&)/.test(window) ||
        /roles\.(includes|some)\s*\(\s*["']admin["']/.test(window);
      expect(
        hasGuard,
        `لوحة ${marker} تظهر بدون حارس دور — يجب أن تكون خلف isActionAllowedForRoles / <Can> / isAdmin`,
      ).toBe(true);
    }
  });
});
