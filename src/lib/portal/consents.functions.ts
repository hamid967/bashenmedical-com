/**
 * Patient consent records — list, grant, withdraw for the signed-in user.
 *
 * RLS on public.consent_records restricts SELECT / INSERT / UPDATE to the
 * owning patient (patients.profile_id = auth.uid()), so all queries here
 * run through the user-scoped `context.supabase` client (never admin).
 *
 * Consent catalog is defined in this file (source of truth for what the
 * portal shows). Adding a new type or bumping its version → update
 * CONSENT_CATALOG below AND, if the enum is extended, ship a migration.
 */
import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { z } from "zod";

/* --------------------------- catalog ---------------------------------- */

export type ConsentType =
  | "terms_of_service"
  | "privacy_policy"
  | "data_processing"
  | "marketing_communications"
  | "medical_treatment"
  | "anesthesia"
  | "surgical_procedure"
  | "telemedicine"
  | "share_medical_records"
  | "insurance_data_sharing"
  | "research_participation"
  | "photography_recording"
  | "minor_guardian_consent";

export type ConsentStatus = "granted" | "withdrawn" | "expired" | "superseded";

export type ConsentCatalogItem = {
  type: ConsentType;
  version: string;
  required: boolean;
  category: "essential" | "clinical" | "optional";
  title_ar: string;
  title_en: string;
  summary_ar: string;
  summary_en: string;
  /** Long-form body shown when the patient expands the item. */
  body_ar: string;
  body_en: string;
  document_url?: string;
};

export const CONSENT_CATALOG: ConsentCatalogItem[] = [
  {
    type: "terms_of_service",
    version: "1.0",
    required: true,
    category: "essential",
    title_ar: "شروط استخدام البوابة",
    title_en: "Portal Terms of Service",
    summary_ar: "الشروط العامة لاستخدام بوابة المريض والخدمات الرقمية.",
    summary_en: "General terms governing your use of the patient portal.",
    body_ar:
      "باستخدامك بوابة مجمع باعشن الطبي فإنك توافق على الشروط العامة للاستخدام، بما فيها الاستخدام العادل، وحظر إساءة الاستخدام، ومسؤوليتك عن حماية بيانات الدخول الخاصة بك.",
    body_en:
      "By using the Baeshen Medical portal you accept the terms of fair use, prohibited misuse, and responsibility for safeguarding your login credentials.",
  },
  {
    type: "privacy_policy",
    version: "1.0",
    required: true,
    category: "essential",
    title_ar: "سياسة الخصوصية",
    title_en: "Privacy Policy",
    summary_ar: "كيف نجمع بياناتك الصحية ونعالجها ونحميها وفق نظام حماية البيانات الشخصية.",
    summary_en: "How we collect, process and protect your health data per PDPL.",
    body_ar:
      "نلتزم بنظام حماية البيانات الشخصية (PDPL) الصادر من هيئة البيانات والذكاء الاصطناعي (سدايا). تُخزَّن بياناتك داخل المملكة، وتُشفَّر أثناء النقل والتخزين، ولا تُشارك مع أي طرف ثالث دون موافقتك الصريحة إلا لمتطلبات نظامية.",
    body_en:
      "We comply with Saudi PDPL (SDAIA). Data is stored inside KSA, encrypted at rest and in transit, and never shared with third parties without your explicit consent except where mandated by law.",
  },
  {
    type: "data_processing",
    version: "1.0",
    required: true,
    category: "essential",
    title_ar: "معالجة البيانات الشخصية والصحية",
    title_en: "Personal & Health Data Processing",
    summary_ar: "الموافقة على معالجة بياناتك الشخصية والصحية لتقديم الرعاية.",
    summary_en: "Consent to process your personal and health data to deliver care.",
    body_ar:
      "توافق على معالجة بياناتك (الديموغرافية، الطبية، التأمينية، والمالية) بغرض تقديم الرعاية الصحية، إصدار الفواتير، ومتابعة الحالة. يمكنك سحب هذه الموافقة لاحقًا مع علمك بأن ذلك قد يؤثر على استمرارية بعض الخدمات.",
    body_en:
      "You consent to processing your demographic, medical, insurance and financial data to deliver care, issue invoices, and follow up. You may withdraw this consent later; some services may be affected.",
  },
  {
    type: "medical_treatment",
    version: "1.0",
    required: true,
    category: "clinical",
    title_ar: "الموافقة على العلاج الطبي",
    title_en: "General Medical Treatment Consent",
    summary_ar: "الموافقة على تلقّي الفحوصات والعلاج ضمن مجمع باعشن الطبي.",
    summary_en: "Consent to receive examinations and treatment at Baeshen Medical.",
    body_ar:
      "أوافق على تلقّي الفحوصات والعلاج والإجراءات الروتينية التي يحددها الطبيب المعالج. سيتم شرح كل إجراء والمخاطر المتوقعة قبل التنفيذ، ولك الحق في رفض أي إجراء في أي وقت.",
    body_en:
      "I consent to examinations, treatment and routine procedures ordered by my treating physician. Each procedure and its risks will be explained beforehand, and I may refuse any procedure at any time.",
  },
  {
    type: "telemedicine",
    version: "1.0",
    required: false,
    category: "clinical",
    title_ar: "الاستشارات الطبية عن بُعد",
    title_en: "Telemedicine Consultations",
    summary_ar: "الموافقة على إجراء الاستشارات الطبية عبر الفيديو أو الهاتف.",
    summary_en: "Consent to consult via video or phone.",
    body_ar:
      "أفهم أن الاستشارة عن بُعد لها حدود مقارنة بالكشف الحضوري، وأن الطبيب قد يطلب زيارة العيادة عند الحاجة. تُسجَّل الجلسات ضمن سجلي الطبي فقط ولا تُشارك مع أي طرف خارجي.",
    body_en:
      "I understand telemedicine has limits versus in-person visits, and the doctor may request a clinic visit if needed. Sessions are logged in my medical record only.",
  },
  {
    type: "share_medical_records",
    version: "1.0",
    required: false,
    category: "clinical",
    title_ar: "مشاركة السجل الطبي مع جهات أخرى",
    title_en: "Share Medical Records with Third Parties",
    summary_ar: "السماح بمشاركة السجل الطبي مع أطباء أو مستشفيات خارج المجمع بناءً على طلبك.",
    summary_en: "Allow sharing your record with doctors or hospitals outside our center at your request.",
    body_ar:
      "عند سحب هذه الموافقة، سيتوقف المجمع عن مشاركة سجلك الطبي مع أي جهة خارجية إلا في حالات الطوارئ الطبية أو المتطلبات النظامية.",
    body_en:
      "Withdrawing this consent stops sharing your record with external parties, except in medical emergencies or when legally required.",
  },
  {
    type: "insurance_data_sharing",
    version: "1.0",
    required: false,
    category: "clinical",
    title_ar: "مشاركة البيانات مع شركات التأمين",
    title_en: "Insurance Data Sharing",
    summary_ar: "السماح بمشاركة بيانات المطالبات والفوترة مع شركة التأمين الخاصة بك.",
    summary_en: "Allow sharing billing/claim data with your insurance provider.",
    body_ar:
      "مطلوب لتفعيل المطالبات المباشرة مع شركة التأمين. عند السحب سيتم تحويلك للدفع النقدي في زياراتك القادمة.",
    body_en:
      "Required to submit direct claims to your insurance provider. Withdrawing switches future visits to cash payment.",
  },
  {
    type: "photography_recording",
    version: "1.0",
    required: false,
    category: "optional",
    title_ar: "التصوير والتسجيل السريري",
    title_en: "Clinical Photography & Recording",
    summary_ar: "الموافقة على التصوير السريري (جلدية/جراحة/أشعة) لأغراض توثيق الحالة.",
    summary_en: "Consent to clinical photography for case documentation.",
    body_ar:
      "تُستخدم الصور والتسجيلات لأغراض توثيق الحالة داخل ملفك الطبي فقط، ولن تُنشر أو تُستخدم للأغراض التعليمية أو التسويقية دون موافقة كتابية منفصلة.",
    body_en:
      "Media is used strictly for case documentation in your record and will not be published or used for teaching/marketing without a separate written consent.",
  },
  {
    type: "research_participation",
    version: "1.0",
    required: false,
    category: "optional",
    title_ar: "المشاركة في الأبحاث الطبية",
    title_en: "Medical Research Participation",
    summary_ar: "السماح باستخدام بياناتك المجهولة الهوية في الأبحاث والدراسات المعتمدة.",
    summary_en: "Allow anonymized data to be used in approved research studies.",
    body_ar:
      "تُزال جميع المعرّفات الشخصية قبل الاستخدام البحثي. لا يترتب على الموافقة أو الرفض أي تأثير على جودة الرعاية المقدَّمة لك.",
    body_en:
      "All personal identifiers are removed before research use. Your decision does not affect the quality of care you receive.",
  },
  {
    type: "marketing_communications",
    version: "1.0",
    required: false,
    category: "optional",
    title_ar: "الرسائل التسويقية والعروض",
    title_en: "Marketing Communications",
    summary_ar: "استلام العروض والحملات الصحية عبر البريد الإلكتروني/الرسائل النصية.",
    summary_en: "Receive promotions and health campaigns via email/SMS.",
    body_ar:
      "لا يشمل هذا الخيار الإشعارات التشغيلية (تذكيرات المواعيد، جاهزية التقارير، الفواتير) — هذه تبقى دائمًا مفعّلة.",
    body_en:
      "Does not include operational alerts (appointment reminders, report readiness, invoices) which always remain enabled.",
  },
];

/* --------------------------- schemas ---------------------------------- */

const ConsentTypeSchema = z.enum([
  "terms_of_service",
  "privacy_policy",
  "data_processing",
  "marketing_communications",
  "medical_treatment",
  "anesthesia",
  "surgical_procedure",
  "telemedicine",
  "share_medical_records",
  "insurance_data_sharing",
  "research_participation",
  "photography_recording",
  "minor_guardian_consent",
]);

/* --------------------------- types ------------------------------------ */

export type ConsentRecord = {
  id: string;
  consent_type: ConsentType;
  status: ConsentStatus;
  version: string;
  granted_at: string;
  withdrawn_at: string | null;
  expires_at: string | null;
  withdrawal_reason: string | null;
  channel: string;
  language: string;
};

export type ConsentView = {
  catalog: ConsentCatalogItem;
  active: ConsentRecord | null;
  history: ConsentRecord[];
};

/* --------------------------- helpers ---------------------------------- */

async function resolvePatientId(
  supabase: Awaited<ReturnType<typeof requireSupabaseAuth.server>>["context"]["supabase"],
  userId: string,
): Promise<string> {
  const { data, error } = await supabase
    .from("patients")
    .select("id")
    .eq("profile_id", userId)
    .maybeSingle();
  if (error) throw new Error(error.message);
  if (!data?.id) {
    throw new Error(
      "لم يتم ربط حسابك بملف مريض بعد. يُرجى إكمال ملفك الشخصي أو التواصل مع الاستقبال.",
    );
  }
  return data.id;
}

/* --------------------------- server fns ------------------------------- */

/**
 * List every consent type in the catalog with the patient's active record
 * (if any) and full history for that type.
 */
export const listMyConsents = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }): Promise<ConsentView[]> => {
    const patientId = await resolvePatientId(context.supabase, context.userId);

    const { data, error } = await context.supabase
      .from("consent_records")
      .select(
        "id, consent_type, status, version, granted_at, withdrawn_at, expires_at, withdrawal_reason, channel, language",
      )
      .eq("patient_id", patientId)
      .order("granted_at", { ascending: false });
    if (error) throw new Error(error.message);

    const rows = (data ?? []) as ConsentRecord[];

    return CONSENT_CATALOG.map((c) => {
      const history = rows.filter((r) => r.consent_type === c.type);
      const active =
        history.find(
          (r) =>
            r.status === "granted" &&
            r.version === c.version &&
            (r.expires_at == null || new Date(r.expires_at).getTime() > Date.now()),
        ) ?? null;
      return { catalog: c, active, history };
    });
  });

/**
 * Grant (or re-grant after withdrawal) a consent of the given type at the
 * catalog's current version. Fails silently if an active record already
 * exists for that version.
 */
export const grantConsent = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) =>
    z
      .object({
        consent_type: ConsentTypeSchema,
        language: z.enum(["ar", "en"]).default("ar"),
      })
      .parse(d),
  )
  .handler(async ({ data, context }): Promise<{ id: string; already_active: boolean }> => {
    const patientId = await resolvePatientId(context.supabase, context.userId);

    const catalog = CONSENT_CATALOG.find((c) => c.type === data.consent_type);
    if (!catalog) throw new Error("نوع موافقة غير معروف");

    // Short-circuit: if there's already an active record at this version, done.
    const { data: existing, error: exErr } = await context.supabase
      .from("consent_records")
      .select("id")
      .eq("patient_id", patientId)
      .eq("consent_type", data.consent_type)
      .eq("version", catalog.version)
      .eq("status", "granted")
      .maybeSingle();
    if (exErr) throw new Error(exErr.message);
    if (existing?.id) return { id: existing.id, already_active: true };

    const { data: inserted, error } = await context.supabase
      .from("consent_records")
      .insert({
        patient_id: patientId,
        user_id: context.userId,
        granted_by: context.userId,
        consent_type: data.consent_type,
        version: catalog.version,
        status: "granted",
        channel: "portal",
        language: data.language,
        document_url: catalog.document_url ?? null,
      })
      .select("id")
      .single();
    if (error) throw new Error(error.message);
    return { id: inserted.id, already_active: false };
  });

/**
 * Withdraw an active consent. `withdrawn_at` is set automatically by the
 * table trigger; we just flip the status and attach an optional reason.
 */
export const withdrawConsent = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) =>
    z
      .object({
        record_id: z.string().uuid(),
        reason: z.string().trim().max(500).optional(),
      })
      .parse(d),
  )
  .handler(async ({ data, context }): Promise<{ ok: true }> => {
    const patientId = await resolvePatientId(context.supabase, context.userId);

    const { error } = await context.supabase
      .from("consent_records")
      .update({
        status: "withdrawn",
        withdrawal_reason: data.reason ?? null,
      })
      .eq("id", data.record_id)
      .eq("patient_id", patientId)
      .eq("status", "granted");
    if (error) throw new Error(error.message);
    return { ok: true };
  });
