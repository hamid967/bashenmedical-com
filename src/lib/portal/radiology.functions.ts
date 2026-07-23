/**
 * Patient radiology: fetch reports, signed URLs for view/download, and AI summary.
 */
import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { z } from "zod";

export type RadiologyReport = {
  id: string;
  modality: string | null;
  body_part: string | null;
  findings: string | null;
  report_date: string | null;
  file_path: string | null;
  status: string | null;
  ordered_by: string | null;
  doctor_name: string | null;
  released_at: string | null;
};

export const getMyRadiologyReports = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { supabase, userId } = context;
    const patientRes = await supabase
      .from("patients")
      .select("id")
      .eq("profile_id", userId)
      .maybeSingle();
    const patient = patientRes.data;
    if (!patient) return { reports: [] as RadiologyReport[] };

    const res = await supabase
      .from("radiology_reports")
      .select(
        "id, modality, body_part, findings, report_date, file_path, status, ordered_by, released_at, doctors:ordered_by(name_ar)",
      )
      .eq("patient_id", patient.id)
      .not("released_at", "is", null)
      .order("report_date", { ascending: false })
      .limit(200);

    return {
      reports: (res.data ?? []).map((r) => ({
        id: r.id as string,
        modality: (r.modality as string | null) ?? null,
        body_part: (r.body_part as string | null) ?? null,
        findings: (r.findings as string | null) ?? null,
        report_date: (r.report_date as string | null) ?? null,
        file_path: (r.file_path as string | null) ?? null,
        status: (r.status as string | null) ?? null,
        ordered_by: (r.ordered_by as string | null) ?? null,
        released_at: (r.released_at as string | null) ?? null,
        doctor_name:
          ((r as { doctors?: { name_ar?: string | null } | null }).doctors?.name_ar as
            string | null) ?? null,
      })),
    };
  });

const FileSchema = z.object({ path: z.string().min(1).max(1024) });

export const getRadiologyFileUrl = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((i: unknown) => FileSchema.parse(i))
  .handler(async ({ context, data }) => {
    const { supabase, userId } = context;
    const p = await supabase.from("patients").select("id").eq("profile_id", userId).maybeSingle();
    const patientId = p.data?.id;
    if (!patientId) throw new Error("لا يوجد ملف مريض مرتبط.");

    const owns = await supabase
      .from("radiology_reports")
      .select("id")
      .eq("patient_id", patientId)
      .eq("file_path", data.path)
      .not("released_at", "is", null)
      .limit(1);
    const reportId = owns.data?.[0]?.id as string | undefined;
    if (!reportId) throw new Error("لا تملك صلاحية الوصول لهذا الملف.");

    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { data: signed, error } = await supabaseAdmin.storage
      .from("radiology-reports")
      .createSignedUrl(data.path, 300);
    if (error) throw new Error(error.message);

    const { logAppEvent } = await import("@/lib/audit-log.server");
    await logAppEvent(supabase, "radiology_report_download", {
      report_id: reportId,
      patient_id: patientId,
      file_path: data.path,
      bucket: "radiology-reports",
    });
    const { recordSensitiveAccess } = await import(
      "@/lib/audit/sensitive-access.server"
    );
    await recordSensitiveAccess({
      supabase,
      actorId: userId,
      action: "radiology_report.download",
      entityType: "radiology_report",
      entityId: reportId,
      permission: "portal.self",
      kind: "download",
      metadata: { patient_id: patientId, bucket: "radiology-reports" },
    });

    return { url: signed.signedUrl, expiresIn: 300 };
  });

export type RadiologyAiSummary = {
  headline: string;
  highlights: string[];
  followUps: { title: string; detail: string; priority: "high" | "medium" | "low" }[];
  generatedAt: string;
  model: string;
};

export const getRadiologyAiSummary = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }): Promise<RadiologyAiSummary> => {
    const apiKey = process.env.LOVABLE_API_KEY;
    if (!apiKey) throw new Error("مفتاح الذكاء الاصطناعي غير مهيأ.");
    const { supabase, userId } = context;

    const p = await supabase.from("patients").select("id").eq("profile_id", userId).maybeSingle();
    if (!p.data) throw new Error("لا يوجد ملف مريض مرتبط.");

    const res = await supabase
      .from("radiology_reports")
      .select("modality, body_part, findings, report_date, status")
      .eq("patient_id", p.data.id)
      .not("released_at", "is", null)
      .order("report_date", { ascending: false })
      .limit(15);

    const facts = { radiology: res.data ?? [] };
    const model = "google/gemini-2.5-flash";
    const system =
      "أنت مساعد طبي يقدم ملخصًا مبسطًا للمريض عن تقارير الأشعة. اكتب بالعربية بلهجة واضحة ومحترمة، بدون تشخيص نهائي أو توصيات دوائية، مع تنبيه لطيف بمراجعة الطبيب عند الحاجة. لا تخترع بيانات غير موجودة.";
    const user = `تقارير الأشعة (JSON):\n${JSON.stringify(facts, null, 2)}\n\nأعد النتيجة بصيغة JSON وفق المخطط فقط.`;

    const schema = {
      type: "object",
      properties: {
        headline: { type: "string" },
        highlights: { type: "array", items: { type: "string" }, minItems: 1, maxItems: 6 },
        followUps: {
          type: "array",
          minItems: 0,
          maxItems: 5,
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
        },
      },
      required: ["headline", "highlights", "followUps"],
      additionalProperties: false,
    };

    const r = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
      method: "POST",
      headers: { "Content-Type": "application/json", "Lovable-API-Key": apiKey },
      body: JSON.stringify({
        model,
        messages: [
          { role: "system", content: system },
          { role: "user", content: user },
        ],
        tools: [
          {
            type: "function",
            function: { name: "emit_summary", description: "ملخص الأشعة", parameters: schema },
          },
        ],
        tool_choice: { type: "function", function: { name: "emit_summary" } },
      }),
    });

    if (r.status === 429) throw new Error("تم تجاوز الحد. حاول لاحقاً.");
    if (r.status === 402) throw new Error("انتهت أرصدة الذكاء الاصطناعي.");
    if (!r.ok) throw new Error(`فشل الذكاء الاصطناعي: ${r.status}`);

    const j = (await r.json()) as {
      choices?: {
        message?: { tool_calls?: { function?: { arguments?: string } }[]; content?: string };
      }[];
    };
    const raw =
      j.choices?.[0]?.message?.tool_calls?.[0]?.function?.arguments ??
      j.choices?.[0]?.message?.content ??
      "";
    let parsed: Partial<RadiologyAiSummary> = {};
    try {
      parsed = JSON.parse(raw);
    } catch {
      /* ignore */
    }

    return {
      headline: parsed.headline ?? "ملخص تقارير الأشعة",
      highlights: parsed.highlights ?? [],
      followUps: parsed.followUps ?? [],
      generatedAt: new Date().toISOString(),
      model,
    };
  });
