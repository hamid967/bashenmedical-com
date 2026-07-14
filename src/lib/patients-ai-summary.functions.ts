/**
 * AI-generated summary of patient status changes over the last 30 days.
 * Staff-only. Uses Lovable AI Gateway.
 */
import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { z } from "zod";

type Role = "admin" | "reception" | "pharmacy" | "super_admin" | "doctor";

// eslint-disable-next-line @typescript-eslint/no-explicit-any
async function getRoles(sb: any, userId: string): Promise<Role[]> {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { data } = await sb.from("user_roles").select("role").eq("user_id", userId);
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  return (data ?? []).map((r: any) => r.role as Role);
}
function ensureStaff(roles: Role[]) {
  const ok = roles.some((r) =>
    (["admin", "super_admin", "reception", "doctor"] as Role[]).includes(r),
  );
  if (!ok) throw new Error("ليست لديك الصلاحية.");
}

const Input = z.object({
  branchId: z.string().uuid().nullable().optional(),
  doctorId: z.string().uuid().nullable().optional(),
});

export type AiSummary = {
  headline: string;
  highlights: string[];
  actions: { title: string; detail: string; priority: "high" | "medium" | "low" }[];
  period: { from: string; to: string };
  generatedAt: string;
  model: string;
};

const STATUS_LABEL_AR: Record<string, string> = {
  active: "نشط",
  inactive: "غير نشط",
  archived: "مؤرشف",
  deceased: "متوفى",
};

export const getPatientsAiSummary = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((d) => Input.parse(d))
  .handler(async ({ data, context }): Promise<AiSummary> => {
    const apiKey = process.env.LOVABLE_API_KEY;
    if (!apiKey) throw new Error("مفتاح الذكاء الاصطناعي غير مهيأ.");

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const sb: any = context.supabase;
    const roles = await getRoles(sb, context.userId);
    ensureStaff(roles);

    const toDate = new Date();
    const fromDate = new Date(Date.now() - 30 * 86400_000);
    const priorFrom = new Date(Date.now() - 60 * 86400_000);
    const priorTo = new Date(Date.now() - 31 * 86400_000);
    const fromISO = fromDate.toISOString().slice(0, 10);
    const toISO = toDate.toISOString().slice(0, 10);
    const priorFromISO = priorFrom.toISOString().slice(0, 10);
    const priorToISO = priorTo.toISOString().slice(0, 10);

    // Eligible patient pool (branch + doctor filters)
    let pq = sb.from("patients").select("id, branch_id, status, branches(name_ar)");
    if (data.branchId) pq = pq.eq("branch_id", data.branchId);
    const { data: pRows } = await pq.limit(20000);
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    let eligible = new Set<string>(((pRows ?? []) as any[]).map((r) => r.id as string));
    if (data.doctorId) {
      const { data: vRows } = await sb
        .from("patient_visits")
        .select("patient_id")
        .eq("doctor_id", data.doctorId)
        .limit(20000);
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const withDoc = new Set<string>(((vRows ?? []) as any[]).map((r) => r.patient_id as string));
      eligible = new Set([...eligible].filter((id) => withDoc.has(id)));
    }
    const denominator = eligible.size;

    // Current status snapshot
    const statusNow: Record<string, number> = { active: 0, inactive: 0, archived: 0, deceased: 0 };
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    for (const p of (pRows ?? []) as any[]) {
      if (!eligible.has(p.id)) continue;
      const s = String(p.status ?? "active");
      if (s in statusNow) statusNow[s]++;
    }

    async function loadAudit(fromD: string, toD: string) {
      const { data: rows } = await sb
        .from("security_audit_log")
        .select("created_at, metadata, action")
        .in("action", ["patient.status_changed", "patient.bulk_status_changed"])
        .gte("created_at", `${fromD}T00:00:00`)
        .lte("created_at", `${toD}T23:59:59`)
        .limit(10000);
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      return (rows ?? []) as any[];
    }

    function aggregate(rows: unknown[]) {
      const perTarget: Record<string, number> = { active: 0, inactive: 0, archived: 0, deceased: 0 };
      const perTransition = new Map<string, number>();
      let total = 0;
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      for (const row of rows as any[]) {
        const meta = row.metadata ?? {};
        if (row.action === "patient.status_changed") {
          const pid = meta.patient_id as string | undefined;
          if (!pid || !eligible.has(pid)) continue;
          const to = String(meta.to ?? "");
          const from = String(meta.from ?? "?");
          if (!(to in perTarget)) continue;
          perTarget[to]++;
          const k = `${from}→${to}`;
          perTransition.set(k, (perTransition.get(k) ?? 0) + 1);
          total++;
        } else {
          const ids: string[] = Array.isArray(meta.ids) ? meta.ids : [];
          const rel = ids.filter((id) => eligible.has(id)).length;
          if (!rel) continue;
          const to = String(meta.to ?? "");
          if (!(to in perTarget)) continue;
          perTarget[to] += rel;
          const k = `?→${to}`;
          perTransition.set(k, (perTransition.get(k) ?? 0) + rel);
          total += rel;
        }
      }
      return { total, perTarget, perTransition };
    }

    const [curRows, prevRows] = await Promise.all([
      loadAudit(fromISO, toISO),
      loadAudit(priorFromISO, priorToISO),
    ]);
    const cur = aggregate(curRows);
    const prev = aggregate(prevRows);

    const topTransitions = [...cur.perTransition.entries()]
      .sort((a, b) => b[1] - a[1])
      .slice(0, 6)
      .map(([k, v]) => ({ transition: k, count: v }));

    const facts = {
      period: { from: fromISO, to: toISO, days: 30 },
      previous: { from: priorFromISO, to: priorToISO },
      denominator,
      currentStatus: statusNow,
      changes: {
        total: cur.total,
        perTarget: cur.perTarget,
        topTransitions,
      },
      priorChanges: {
        total: prev.total,
        perTarget: prev.perTarget,
      },
      delta: {
        total: cur.total - prev.total,
        perTarget: Object.fromEntries(
          Object.keys(cur.perTarget).map((k) => [k, cur.perTarget[k] - prev.perTarget[k]]),
        ),
      },
      statusLabels: STATUS_LABEL_AR,
      filters: { branchId: data.branchId ?? null, doctorId: data.doctorId ?? null },
    };

    const system = `أنت محلل بيانات طبية. حلّل تغييرات حالات المرضى خلال آخر 30 يوماً وقارنها بالفترة السابقة (30 يوماً قبلها). اكتب باللغة العربية بلهجة مهنية موجزة. أعد ملخصاً واضحاً وثلاثة إلى خمسة إجراءات عملية قابلة للتنفيذ من قِبل فريق الاستقبال والإدارة (مثل: التواصل مع المرضى غير النشطين، مراجعة أرشفة، فحص أسباب الوفيات المسجلة، تفعيل تذكيرات). لا تخترع أرقاماً غير موجودة في البيانات.`;

    const userPrompt = `بيانات المؤشرات (JSON):\n${JSON.stringify(facts, null, 2)}\n\nأعد النتيجة بصيغة JSON بالمخطط المحدد فقط.`;

    const schema = {
      type: "object",
      properties: {
        headline: { type: "string", description: "جملة موجزة تلخص أهم تغيّر" },
        highlights: {
          type: "array",
          items: { type: "string" },
          description: "3-5 نقاط تُبرز أهم التحولات مع أرقام",
        },
        actions: {
          type: "array",
          items: {
            type: "object",
            properties: {
              title: { type: "string" },
              detail: { type: "string" },
              priority: { type: "string", enum: ["high", "medium", "low"] },
            },
            required: ["title", "detail", "priority"],
            additionalProperties: false,
          },
          minItems: 3,
          maxItems: 5,
        },
      },
      required: ["headline", "highlights", "actions"],
      additionalProperties: false,
    };

    const model = "google/gemini-2.5-flash";
    const res = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Lovable-API-Key": apiKey,
      },
      body: JSON.stringify({
        model,
        messages: [
          { role: "system", content: system },
          { role: "user", content: userPrompt },
        ],
        tools: [
          {
            type: "function",
            function: {
              name: "emit_summary",
              description: "أعد الملخص والإجراءات المقترحة",
              parameters: schema,
            },
          },
        ],
        tool_choice: { type: "function", function: { name: "emit_summary" } },
      }),
    });

    if (res.status === 429) throw new Error("تم تجاوز الحد. حاول لاحقاً.");
    if (res.status === 402) throw new Error("انتهت أرصدة الذكاء الاصطناعي. أضف رصيداً للمتابعة.");
    if (!res.ok) {
      const txt = await res.text().catch(() => "");
      throw new Error(`فشل استدعاء الذكاء الاصطناعي: ${res.status} ${txt.slice(0, 200)}`);
    }

    const json = (await res.json()) as {
      choices?: {
        message?: {
          tool_calls?: { function?: { arguments?: string } }[];
          content?: string;
        };
      }[];
    };
    const raw =
      json.choices?.[0]?.message?.tool_calls?.[0]?.function?.arguments ??
      json.choices?.[0]?.message?.content ??
      "";
    let parsed: {
      headline?: string;
      highlights?: string[];
      actions?: { title: string; detail: string; priority: "high" | "medium" | "low" }[];
    } = {};
    try {
      parsed = JSON.parse(raw);
    } catch {
      throw new Error("تعذّر قراءة رد الذكاء الاصطناعي.");
    }

    return {
      headline: parsed.headline ?? "لا تغييرات جوهرية.",
      highlights: parsed.highlights ?? [],
      actions: parsed.actions ?? [],
      period: { from: fromISO, to: toISO },
      generatedAt: new Date().toISOString(),
      model,
    };
  });
