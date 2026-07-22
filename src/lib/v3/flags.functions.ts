/**
 * V3 Rollout — feature-flag registry & management.
 * Backed by public.ai_feature_flags (admin/super-only read; super-only write).
 * Read via getV3Flags; toggle via setV3Flag from the admin console.
 */
import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { z } from "zod";
import { assertConsoleAccess as assertAdmin } from "@/lib/admin/_guard";

export type V3Pillar = "reservations" | "portal" | "admin" | "platform";

export type V3FlagDef = {
  key: string; // canonical id, e.g. "v3.res.smart_reschedule"
  pillar: V3Pillar;
  title: string;
  description: string;
  phase: 1 | 2 | 3 | 4;
};

/** Canonical registry — source of truth for the V3 rollout board. */
export const V3_FLAGS: V3FlagDef[] = [
  // — Reservations Next Gen —
  {
    key: "v3.res.simplified_wizard",
    pillar: "reservations",
    title: "معالج حجز مبسّط (5 خطوات)",
    description: "تدفّق أسرع مع Bottom-sheets للجوال ومسار افتراضي ذكي.",
    phase: 1,
  },
  {
    key: "v3.res.smart_reschedule",
    pillar: "reservations",
    title: "إعادة جدولة ذكية",
    description: "توصية بأقرب سلوت بديل مع مراعاة تفضيلات المريض.",
    phase: 2,
  },
  {
    key: "v3.res.waitlist_auto_promote",
    pillar: "reservations",
    title: "ترقية تلقائية من قائمة الانتظار",
    description: "منح المقعد الشاغر تلقائيًا لأعلى مريض مؤهّل مع نافذة قبول محدودة.",
    phase: 2,
  },
  {
    key: "v3.res.ai_triage",
    pillar: "reservations",
    title: "مساعد أعراض للفرز",
    description: "استمارة أعراض ذكية توجّه المريض للتخصص/العيادة الأنسب.",
    phase: 3,
  },
  {
    key: "v3.res.nphies_realtime",
    pillar: "reservations",
    title: "NPHIES تحقّق فوري",
    description: "التحقق من الأهلية والتغطية أثناء اختيار السلوت (لا انتظار).",
    phase: 4,
  },
  {
    key: "v3.res.whatsapp_business",
    pillar: "reservations",
    title: "WhatsApp Business تفاعلي",
    description: "قوالب حجز/تأكيد/إعادة جدولة عبر WhatsApp Business API.",
    phase: 4,
  },

  // — Patient Portal —
  {
    key: "v3.portal.timeline",
    pillar: "portal",
    title: "خط زمني صحي موحّد",
    description: "المواعيد والوصفات والتقارير في تدفّق زمني واحد قابل للتصفية.",
    phase: 1,
  },
  {
    key: "v3.portal.wallet_pass",
    pillar: "portal",
    title: "تذكرة Apple/Google Wallet",
    description: "إضافة الموعد كتذكرة مع تذكيرات مستندة إلى الموقع.",
    phase: 2,
  },
  {
    key: "v3.portal.offline",
    pillar: "portal",
    title: "وضع دون اتصال",
    description: "قراءة المواعيد/التقارير الأخيرة عند غياب الشبكة.",
    phase: 3,
  },

  // — Admin Console —
  {
    key: "v3.admin.customizable_widgets",
    pillar: "admin",
    title: "لوحات قابلة للتخصيص",
    description: "widgets قابلة للسحب والإفلات في لوحة الإدارة الرئيسية.",
    phase: 2,
  },
  {
    key: "v3.admin.command_palette_v3",
    pillar: "admin",
    title: "لوحة أوامر ذكية",
    description: "بحث موحّد (Cmd+K) مع اقتراحات مبنية على السياق.",
    phase: 1,
  },

  // — Platform —
  {
    key: "v3.platform.rate_limit_unified",
    pillar: "platform",
    title: "Rate Limit موحّد",
    description: "طبقة حماية مشتركة لكل نقاط API العامة مع لوحة مراقبة.",
    phase: 1,
  },
  {
    key: "v3.platform.ab_testing",
    pillar: "platform",
    title: "اختبارات A/B",
    description: "بنية تجارب مع تعيين ثابت لكل مستخدم وقياس تلقائي.",
    phase: 3,
  },
  {
    key: "v3.platform.audit_full",
    pillar: "platform",
    title: "Audit كامل الحقول",
    description: "قبل/بعد لكل حقل حسّاس + مصدّر التغيير عبر النظام كله.",
    phase: 2,
  },
];

export const PILLAR_LABEL: Record<V3Pillar, string> = {
  reservations: "نظام الحجوزات",
  portal: "بوابة المريض",
  admin: "لوحة الإدارة",
  platform: "البنية التقنية",
};

export type V3FlagState = V3FlagDef & {
  enabled: boolean;
  notes: string | null;
  updated_at: string | null;
};

export type V3RolloutSummary = {
  flags: V3FlagState[];
  countsByPillar: Record<V3Pillar, { total: number; enabled: number }>;
  countsByPhase: Record<1 | 2 | 3 | 4, { total: number; enabled: number }>;
  totalEnabled: number;
  total: number;
};

export const getV3Rollout = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }): Promise<V3RolloutSummary> => {
    await assertAdmin(context);
    const keys = V3_FLAGS.map((f) => f.key);
    const { data, error } = await context.supabase
      .from("ai_feature_flags")
      .select("key, enabled, notes, updated_at")
      .in("key", keys);
    if (error) throw new Error(error.message);
    const map = new Map(
      ((data ?? []) as Array<{
        key: string;
        enabled: boolean;
        notes: string | null;
        updated_at: string;
      }>).map((r) => [r.key, r]),
    );

    const flags: V3FlagState[] = V3_FLAGS.map((def) => {
      const row = map.get(def.key);
      return {
        ...def,
        enabled: row?.enabled ?? false,
        notes: row?.notes ?? null,
        updated_at: row?.updated_at ?? null,
      };
    });

    const countsByPillar = {
      reservations: { total: 0, enabled: 0 },
      portal: { total: 0, enabled: 0 },
      admin: { total: 0, enabled: 0 },
      platform: { total: 0, enabled: 0 },
    } as V3RolloutSummary["countsByPillar"];
    const countsByPhase = {
      1: { total: 0, enabled: 0 },
      2: { total: 0, enabled: 0 },
      3: { total: 0, enabled: 0 },
      4: { total: 0, enabled: 0 },
    } as V3RolloutSummary["countsByPhase"];

    let totalEnabled = 0;
    for (const f of flags) {
      countsByPillar[f.pillar].total++;
      countsByPhase[f.phase].total++;
      if (f.enabled) {
        countsByPillar[f.pillar].enabled++;
        countsByPhase[f.phase].enabled++;
        totalEnabled++;
      }
    }

    return { flags, countsByPillar, countsByPhase, totalEnabled, total: flags.length };
  });

const SetInput = z.object({
  key: z.string().min(3).max(80),
  enabled: z.boolean(),
  notes: z.string().max(500).nullable().optional(),
});

export const setV3Flag = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((d: unknown) => SetInput.parse(d))
  .handler(async ({ data, context }) => {
    await assertAdmin(context);
    // must be a registered key
    if (!V3_FLAGS.some((f) => f.key === data.key)) {
      throw new Error("مفتاح غير معروف");
    }
    const { error } = await context.supabase
      .from("ai_feature_flags")
      .upsert(
        {
          key: data.key,
          enabled: data.enabled,
          notes: data.notes ?? null,
          updated_by: context.userId,
          updated_at: new Date().toISOString(),
        },
        { onConflict: "key" },
      );
    if (error) throw new Error(error.message);
    // Bust in-instance caches so the toggle takes effect on the next request
    // without waiting for TTL (other workers pick it up within their own TTL).
    if (data.key === "v3.platform.rate_limit_unified") {
      const { bustRateLimitFlagCache } = await import("./rate-limit-unified.server");
      bustRateLimitFlagCache();
    }
    return { ok: true };
  });
