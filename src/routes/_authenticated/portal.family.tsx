import { createFileRoute, Link, useNavigate, useRouter } from "@tanstack/react-router";
import {
  queryOptions,
  useSuspenseQuery,
  useMutation,
  useQuery,
  useQueryClient,
} from "@tanstack/react-query";
import { useState } from "react";
import { toast } from "sonner";
import {
  listDependents,
  createDependent,
  updateDependent,
  deleteDependent,
  setDependentAccessScopes,
  listDependentAppointments,
  countDependentAppointments,
  cancelDependentActiveAppointments,
  type Dependent,
  type DependentAccessScopes,
  type DependentAppointment,
} from "@/lib/portal/dependents.functions";



import { getMyProfile, updateMyProfile } from "@/lib/portal/portal.functions";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/dialog";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import {
  UsersRound,
  UserPlus,
  Pencil,
  Trash2,
  CalendarPlus,
  Loader2,
  AlertTriangle,
  RefreshCw,
  BadgeCheck,
  ShieldAlert,
  ClipboardList,
  CalendarClock,
  MapPin,
  Stethoscope,
  CheckCircle2,
  XCircle,
  Clock3,
  Languages,
} from "lucide-react";
import { PortalPageHeader, PortalEmptyState } from "@/components/portal/ui";

const dependentsQuery = queryOptions({
  queryKey: ["portal", "dependents"],
  queryFn: () => listDependents(),
  staleTime: 30_000,
});
const profileQuery = queryOptions({
  queryKey: ["portal", "my-profile"],
  queryFn: () => getMyProfile(),
  staleTime: 60_000,
});

export const Route = createFileRoute("/_authenticated/portal/family")({
  loader: async ({ context }) => {
    await Promise.all([
      context.queryClient.ensureQueryData(dependentsQuery),
      context.queryClient.ensureQueryData(profileQuery),
    ]);
  },
  head: () => ({
    meta: [
      { title: "أفراد العائلة | بوابة المريض" },
      {
        name: "description",
        content:
          "إدارة أفراد العائلة والمعالين وحجز مواعيدهم من خلال بوابة المريض.",
      },
      { name: "robots", content: "noindex" },
    ],
  }),
  component: FamilyPage,
  errorComponent: FamilyError,
  notFoundComponent: () => null,
});

/* ---------------- i18n ---------------- */

type Lang = "ar" | "en";
const T = {
  title:            { ar: "أفراد العائلة", en: "Family Members" },
  subtitle: {
    ar: "أضف أفراد عائلتك لإدارة سجلاتهم وحجز مواعيدهم من حسابك.",
    en: "Add family members to manage their records and book appointments from your account.",
  },
  add:              { ar: "إضافة فرد جديد", en: "Add Member" },
  empty_title:      { ar: "لم تُضف أي أفراد بعد", en: "No members added yet" },
  empty_body: {
    ar: "ابدأ بإضافة طفلك أو زوجك/زوجتك أو أحد والديك لإدارة سجلاتهم وحجز المواعيد نيابةً عنهم.",
    en: "Start by adding a child, spouse, or parent to manage their records and book on their behalf.",
  },
  edit:             { ar: "تعديل", en: "Edit" },
  delete:           { ar: "حذف", en: "Delete" },
  book_for:         { ar: "احجز موعدًا لهذا الفرد", en: "Book an appointment" },
  verified:         { ar: "موثّق", en: "Verified" },
  pending:          { ar: "قيد التوثيق", en: "Pending verification" },
  // form
  form_add_title:   { ar: "إضافة فرد إلى العائلة", en: "Add family member" },
  form_edit_title:  { ar: "تعديل بيانات فرد", en: "Edit family member" },
  form_desc: {
    ar: "املأ البيانات المطلوبة. تُطبَّق قواعد تحقق مطابقة لنظام الهوية والجوال السعودي.",
    en: "Fill in the required fields. Saudi ID and mobile validation are applied.",
  },
  f_name:           { ar: "الاسم الرباعي",     en: "Full name" },
  f_relationship:   { ar: "صلة القرابة",       en: "Relationship" },
  f_gender:         { ar: "الجنس",             en: "Gender" },
  f_dob:            { ar: "تاريخ الميلاد",     en: "Date of birth" },
  f_nid:            { ar: "رقم الهوية",         en: "National ID" },
  f_phone:          { ar: "رقم الجوال",        en: "Mobile number" },
  optional:         { ar: "اختياري",           en: "optional" },
  save:             { ar: "حفظ",              en: "Save" },
  cancel:           { ar: "إلغاء",            en: "Cancel" },
  saving:           { ar: "جارٍ الحفظ…",      en: "Saving…" },
  // relationships
  r_child:          { ar: "ابن/ابنة",         en: "Child" },
  r_spouse:         { ar: "زوج/زوجة",         en: "Spouse" },
  r_parent:         { ar: "والد/والدة",       en: "Parent" },
  r_sibling:        { ar: "أخ/أخت",           en: "Sibling" },
  r_other:          { ar: "أخرى",             en: "Other" },
  g_male:           { ar: "ذكر", en: "Male" },
  g_female:         { ar: "أنثى", en: "Female" },
  choose:           { ar: "اختر…", en: "Choose…" },
  // delete confirm
  del_title:        { ar: "حذف فرد من العائلة؟", en: "Delete family member?" },
  del_body: {
    ar: "لن يتم حذف السجلات الطبية المرتبطة بهذا الفرد إن وُجدت. يمكنك إعادة إضافته لاحقًا.",
    en: "Existing linked medical records won't be deleted. You can add them again later.",
  },
  del_warning: {
    ar: "هذا الإجراء لا يمكن التراجع عنه. سيتم إزالة الفرد من قائمة عائلتك فورًا.",
    en: "This action cannot be undone. The member will be removed from your family list immediately.",
  },
  del_ok:           { ar: "نعم، احذف", en: "Yes, delete" },
  del_keep:         { ar: "لا، احتفظ به", en: "No, keep it" },
  del_counting:     { ar: "جارٍ التحقق من المواعيد المرتبطة…", en: "Checking linked appointments…" },
  del_count_error:  { ar: "تعذّر التحقق من المواعيد المرتبطة.", en: "Could not check linked appointments." },
  del_total_label:  { ar: "إجمالي المواعيد المرتبطة", en: "Total linked appointments" },
  del_active_label: { ar: "مواعيد نشطة (قادمة/قيد التأكيد)", en: "Active appointments (upcoming/pending)" },
  del_blocked_title:{ ar: "لا يمكن الحذف حاليًا", en: "Deletion currently blocked" },
  del_blocked_body: {
    ar: "يوجد لدى هذا الفرد مواعيد نشطة. الرجاء إلغاؤها أو إتمامها أولًا قبل حذفه.",
    en: "This member has active appointments. Please cancel or complete them before deleting.",
  },
  del_history_note: {
    ar: "توجد مواعيد سابقة لهذا الفرد. سيتم الاحتفاظ بسجلها ولن تُحذف.",
    en: "This member has past appointments. Their history will be kept and not deleted.",
  },
  del_cancel_active: {
    ar: "إلغاء المواعيد النشطة",
    en: "Cancel active appointments",
  },
  del_cancel_confirm: {
    ar: "سيتم إلغاء جميع المواعيد النشطة لهذا الفرد وتحرير حجوزاتها. هل تريد المتابعة؟",
    en: "All active appointments for this member will be cancelled and their slots freed. Continue?",
  },
  del_cancel_confirm_title: {
    ar: "تأكيد إلغاء المواعيد النشطة",
    en: "Confirm cancelling active appointments",
  },
  del_cancel_confirm_warning: {
    ar: "لا يمكن التراجع عن هذا الإجراء. سيتم إشعار العيادة وتحرير الحجوزات.",
    en: "This action cannot be undone. The clinic will be notified and slots freed.",
  },
  del_cancel_confirm_ok: {
    ar: "نعم، ألغِ المواعيد",
    en: "Yes, cancel appointments",
  },
  del_cancel_confirm_keep: {
    ar: "تراجع",
    en: "Go back",
  },

  del_cancel_success: {
    ar: "تم إلغاء المواعيد النشطة. يمكنك الآن حذف الفرد.",
    en: "Active appointments cancelled. You can now delete the member.",
  },
  del_cancel_none: {
    ar: "لا توجد مواعيد نشطة لإلغائها.",
    en: "No active appointments to cancel.",
  },
  del_cancel_error: {
    ar: "تعذّر إلغاء المواعيد النشطة.",
    en: "Could not cancel active appointments.",
  },
  del_cancelling: { ar: "جارٍ الإلغاء…", en: "Cancelling…" },


  // errors
  e_name_too_short: { ar: "الاسم قصير جدًا.", en: "Name is too short." },
  e_name_too_long:  { ar: "الاسم طويل جدًا.", en: "Name is too long." },
  e_nid:            { ar: "رقم الهوية يجب أن يتكوّن من 10 أرقام.", en: "National ID must be 10 digits." },
  e_phone:          { ar: "رقم الجوال غير صالح (مثال: 05XXXXXXXX).", en: "Invalid mobile number (e.g. 05XXXXXXXX)." },
  e_date:           { ar: "التاريخ غير صالح.", en: "Invalid date." },
  e_relationship:   { ar: "اختر صلة القرابة.", en: "Choose a relationship." },
  e_generic:        { ar: "تعذّر حفظ البيانات.", en: "Could not save." },
  // history
  history_toggle:   { ar: "سجل المواعيد", en: "Appointments history" },
  history_show:     { ar: "عرض", en: "Show" },
  history_hide:     { ar: "إخفاء", en: "Hide" },
  history_empty:    { ar: "لا توجد مواعيد مسجلة لهذا الفرد بعد.", en: "No appointments recorded yet." },
  history_loading:  { ar: "جارٍ التحميل…", en: "Loading…" },
  history_error:    { ar: "تعذّر تحميل السجل.", en: "Could not load history." },
  history_retry:    { ar: "إعادة", en: "Retry" },
  st_scheduled:     { ar: "مجدول", en: "Scheduled" },
  st_confirmed:     { ar: "مؤكد", en: "Confirmed" },
  st_completed:     { ar: "منتهي", en: "Completed" },
  st_cancelled:     { ar: "ملغى", en: "Cancelled" },
  st_no_show:       { ar: "لم يحضر", en: "No-show" },
  st_pending:       { ar: "بانتظار المعالجة", en: "Pending" },
  st_in_progress:   { ar: "جارٍ", en: "In progress" },
  st_unknown:       { ar: "غير معروف", en: "Unknown" },
  // completeness
  incomplete_title: { ar: "بيانات ناقصة قبل الحجز", en: "Missing details before booking" },
  incomplete_body: {
    ar: "لإتمام الحجز نيابةً عن هذا الفرد، الرجاء استكمال الحقول التالية:",
    en: "To book on behalf of this member, please complete the following fields:",
  },
  complete_now:     { ar: "استكمل البيانات", en: "Complete details" },
  // language
  lang_toggle_to_en: { ar: "English", en: "English" },
  lang_toggle_to_ar: { ar: "العربية", en: "العربية" },
  lang_switch_aria:  { ar: "التبديل إلى العربية", en: "Switch to English" },
  lang_saved:        { ar: "تم حفظ لغة الحساب.", en: "Account language saved." },
  lang_error:        { ar: "تعذّر حفظ اللغة.", en: "Could not save language." },
  // page-level
  page_error_title:   { ar: "تعذّر تحميل الصفحة", en: "Could not load the page" },
  page_error_generic: { ar: "خطأ غير متوقع.", en: "Unexpected error." },
  page_error_retry:   { ar: "إعادة المحاولة", en: "Retry" },
  member_label:       { ar: "الفرد:", en: "Member:" },
  // save toasts
  saved_created:      { ar: "تم إضافة الفرد بنجاح.", en: "Family member added." },
  saved_updated:      { ar: "تم تحديث بيانات الفرد.", en: "Family member updated." },
  // list join separator (locale-appropriate punctuation)
  list_separator:     { ar: "، ", en: ", " },
} as const;

function t(k: keyof typeof T, lang: Lang) {
  return T[k][lang];
}

const RELATIONSHIP_LABELS: Record<Dependent["relationship"], keyof typeof T> = {
  child: "r_child",
  spouse: "r_spouse",
  parent: "r_parent",
  sibling: "r_sibling",
  other: "r_other",
};

/**
 * Returns the labels of required-but-missing fields on a dependent for
 * booking. National ID + mobile are the payer/registration prerequisites.
 */
export function dependentMissingForBooking(row: Dependent): Array<keyof typeof T> {
  const missing: Array<keyof typeof T> = [];
  if (!row.national_id || !/^\d{10}$/.test(row.national_id)) missing.push("f_nid");
  if (!row.phone || !/^(?:\+?966|0)?5\d{8}$/.test(row.phone)) missing.push("f_phone");
  return missing;
}

/* ---------------- page ---------------- */

function FamilyPage() {
  const { data: profile } = useSuspenseQuery(profileQuery);
  const { data: rows } = useSuspenseQuery(dependentsQuery);
  const lang: Lang = (profile?.preferred_language as Lang) ?? "ar";
  const isAr = lang === "ar";
  const qc = useQueryClient();

  const [dialog, setDialog] = useState<{ mode: "add" } | { mode: "edit"; row: Dependent } | null>(
    null,
  );
  const [toDelete, setToDelete] = useState<Dependent | null>(null);
  const dir =(isAr ? "rtl" : "ltr");

  const langMutation = useMutation({
    mutationFn: (next: Lang) => updateMyProfile({ data: { preferred_language: next } }),
    onSuccess: (_data, next) => {
      qc.setQueryData(profileQuery.queryKey, (old) =>
        old ? { ...old, preferred_language: next } : old,
      );
      qc.invalidateQueries({ queryKey: ["portal"] });
      if (typeof document !== "undefined") {
        document.documentElement.lang = next;
        document.documentElement.dir = next === "ar" ? "rtl" : "ltr";
      }
      toast.success(T.lang_saved[next]);
    },
    onError: () => toast.error(t("lang_error", lang)),
  });

  const nextLang: Lang =(isAr ? "en" : "ar");

  return (
    <div className="space-y-6 pb-24 md:pb-6" dir={dir}>
      <PortalPageHeader
        title={
          <span className="inline-flex items-center gap-2">
            <UsersRound className="h-6 w-6 text-[color:var(--portal-primary)]" />
            {t("title", lang)}
          </span>
        }
        description={t("subtitle", lang)}
        breadcrumbs={[
          { label:(isAr ? "الرئيسية" : "Home"), to: "/portal" },
          { label: t("title", lang) },
        ]}
        isAr={lang === "ar"}
        actions={
          <div className="flex items-center gap-2 flex-wrap">
            <Button
              type="button"
              variant="outline"
              onClick={() => langMutation.mutate(nextLang)}
              disabled={langMutation.isPending}
              className="rounded-full font-semibold"
              aria-label={T.lang_switch_aria[lang]}
            >
              {langMutation.isPending ? (
                <Loader2 className="h-4 w-4 ms-2 animate-spin" />
              ) : (
                <Languages className="h-4 w-4 ms-2" />
              )}
              {nextLang === "en" ? T.lang_toggle_to_en.en : T.lang_toggle_to_ar.ar}
            </Button>
            <Button
              onClick={() => setDialog({ mode: "add" })}
              className="rounded-full text-[color:var(--portal-on-primary)] font-semibold px-5"
              style={{ background: "var(--portal-gradient)" }}
            >
              <UserPlus className="h-4 w-4 ms-2" />
              {t("add", lang)}
            </Button>
          </div>
        }
      />


      {rows.length === 0 ? (
        <PortalEmptyState
          icon={<UsersRound className="h-7 w-7" />}
          title={t("empty_title", lang)}
          description={t("empty_body", lang)}
          action={
            <Button
              onClick={() => setDialog({ mode: "add" })}
              className="rounded-full text-[color:var(--portal-on-primary)] font-semibold px-5"
              style={{ background: "var(--portal-gradient)" }}
            >
              <UserPlus className="h-4 w-4 ms-2" />
              {t("add", lang)}
            </Button>
          }
        />
      ) : (
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {rows.map((r) => (
            <DependentCard
              key={r.id}
              row={r}
              lang={lang}
              onEdit={() => setDialog({ mode: "edit", row: r })}
              onDelete={() => setToDelete(r)}
            />
          ))}
        </div>
      )}

      {dialog && (
        <DependentDialog
          lang={lang}
          mode={dialog.mode}
          initial={dialog.mode === "edit" ? dialog.row : null}
          onClose={() => setDialog(null)}
        />
      )}

      <DeleteDialog
        lang={lang}
        row={toDelete}
        onClose={() => setToDelete(null)}
      />
    </div>
  );
}

/* ---------------- card ---------------- */

function DependentCard({
  row,
  lang,
  onEdit,
  onDelete,
}: {
  row: Dependent;
  lang: Lang;
  onEdit: () => void;
  onDelete: () => void;
}) {
  const isAr = lang === "ar";
  const initials = row.full_name
    .split(" ")
    .slice(0, 2)
    .map((s) => s[0])
    .join("");
  const rel = t(RELATIONSHIP_LABELS[row.relationship], lang);
  const missing = dependentMissingForBooking(row);
  const verified = row.verification_status === "verified";
  const rejected = row.verification_status === "rejected";
  const bookingAllowed = row.access_scopes?.booking !== false;
  const canBook = missing.length === 0 && verified && bookingAllowed;
  const qc = useQueryClient();
  const scopesMut = useMutation({
    mutationFn: (patch: Partial<DependentAccessScopes>) =>
      setDependentAccessScopes({ data: { id: row.id, scopes: patch } }),
    onSuccess: () => {
      toast.success(isAr ? "تم تحديث الصلاحيات" : "Access updated");
      qc.invalidateQueries({ queryKey: ["portal", "dependents"] });
    },
    onError: (e: any) =>
      toast.error(e?.message ?? (isAr ? "تعذّر التحديث" : "Update failed")),
  });
  const badgeCls = verified
    ? "bg-emerald-50 text-emerald-700"
    : rejected
      ? "bg-red-50 text-red-700"
      : "bg-amber-50 text-amber-700";
  const badgeLabel = verified
    ? t("verified", lang)
    : rejected
      ? (isAr ? "مرفوض" : "Rejected")
      : t("pending", lang);
  return (
    <div className="glass-card p-4 flex flex-col gap-3">
      <div className="flex items-center gap-3">
        <div
          className="h-12 w-12 rounded-full grid place-items-center text-[color:var(--portal-on-primary)] font-bold shrink-0"
          style={{ background: "var(--portal-gradient)" }}
        >
          <span>{initials || "?"}</span>
        </div>
        <div className="min-w-0 flex-1">
          <div className="font-semibold truncate">{row.full_name}</div>
          <div className="text-xs text-[color:var(--portal-ink-2)] truncate">{rel}</div>
        </div>
        <span
          className={`inline-flex items-center gap-1 text-[11px] font-semibold rounded-full px-2 h-6 whitespace-nowrap ${badgeCls}`}
        >
          {verified ? (
            <BadgeCheck className="h-3 w-3" />
          ) : (
            <ShieldAlert className="h-3 w-3" />
          )}
          {badgeLabel}
        </span>
      </div>


      <dl className="text-xs grid gap-1.5 text-[color:var(--portal-ink-2)]">
        {row.date_of_birth && (
          <div className="flex justify-between gap-2">
            <dt>{t("f_dob", lang)}</dt>
            <dd className="font-mono" dir="ltr">{row.date_of_birth}</dd>
          </div>
        )}
        {row.national_id && (
          <div className="flex justify-between gap-2">
            <dt>{t("f_nid", lang)}</dt>
            <dd className="font-mono" dir="ltr">{row.national_id}</dd>
          </div>
        )}
        {row.phone && (
          <div className="flex justify-between gap-2">
            <dt>{t("f_phone", lang)}</dt>
            <dd className="font-mono" dir="ltr">{row.phone}</dd>
          </div>
        )}
      </dl>

      <fieldset
        className="rounded-xl border border-[color:var(--portal-border)] bg-[color:var(--portal-surface)]/60 p-2.5 text-[11px]"
        disabled={scopesMut.isPending}
      >
        <legend className="px-1 text-[10px] font-semibold text-[color:var(--portal-ink-2)]">
          {(isAr ? "صلاحيات الوصول" : "Access scopes")}
        </legend>
        <div className="grid grid-cols-2 gap-1.5">
          {(
            [
              ["booking",(isAr ? "الحجز" : "Booking")],
              ["reports",(isAr ? "التقارير" : "Reports")],
              ["prescriptions",(isAr ? "الوصفات" : "Prescriptions")],
              ["billing",(isAr ? "الفواتير" : "Billing")],
            ] as const
          ).map(([key, label]) => {
            const active = row.access_scopes?.[key] === true;
            return (
              <label
                key={key}
                className="flex items-center gap-1.5 cursor-pointer select-none rounded-lg px-2 py-1 hover:bg-slate-50"
              >
                <input
                  type="checkbox"
                  className="accent-[color:var(--portal-primary)]"
                  checked={active}
                  onChange={(e) =>
                    scopesMut.mutate({ [key]: e.currentTarget.checked } as Partial<DependentAccessScopes>)
                  }
                />
                <span>{label}</span>
              </label>
            );
          })}
        </div>
        {!verified && (
          <div className="mt-1.5 text-[10px] text-amber-700">
            {(isAr ? "الصلاحيات لن تُفعَّل قبل توثيق العلاقة." : "Scopes take effect only after the relationship is verified.")}
          </div>
        )}
      </fieldset>



      {!canBook && (
        <div
          className="rounded-xl border border-amber-300/60 bg-amber-50/70 p-2.5 text-[11px] text-amber-800"
          role="status"
        >
          <div className="flex items-start gap-1.5">
            <ShieldAlert className="h-3.5 w-3.5 shrink-0 mt-0.5" />
            <div className="min-w-0">
              <div className="font-semibold">{t("incomplete_title", lang)}</div>
              <div className="opacity-90 mt-0.5">{t("incomplete_body", lang)}</div>
              <ul className="mt-1 list-disc pr-4 space-y-0.5">
                {missing.map((k) => (
                  <li key={k}>{t(k, lang)}</li>
                ))}
                {!verified && (
                  <li>
                    {(isAr ? "توثيق العلاقة من الاستقبال" : "Relationship verification by reception")}
                  </li>
                )}
                {verified && !bookingAllowed && (
                  <li>
                    {(isAr ? "تفعيل صلاحية الحجز نيابةً من قائمة الصلاحيات أعلاه" : "Enable the ‘Booking’ scope above")}
                  </li>
                )}
              </ul>

            </div>
          </div>
        </div>
      )}

      <div className="flex items-center justify-between gap-2 pt-1 mt-auto">
        {canBook ? (
          <Link
            to="/portal/book"
            search={{ forDependent: row.id }}
            className="inline-flex items-center gap-1.5 text-xs font-semibold rounded-full px-3 h-8 text-[color:var(--portal-on-primary)]"
            style={{ background: "var(--portal-gradient)" }}
          >
            <CalendarPlus className="h-3.5 w-3.5" />
            {t("book_for", lang)}
          </Link>
        ) : (
          <button
            type="button"
            onClick={() => {
              toast.warning(t("incomplete_title", lang), {
                description: `${t("incomplete_body", lang)} ${missing
                  .map((k) => t(k, lang))
                  .join(T.list_separator[lang])}`,
              });
              onEdit();
            }}
            className="inline-flex items-center gap-1.5 text-xs font-semibold rounded-full px-3 h-8 border border-amber-400 bg-amber-50 text-amber-800 hover:bg-amber-100"
          >
            <ShieldAlert className="h-3.5 w-3.5" />
            {t("complete_now", lang)}
          </button>
        )}
        <div className="flex items-center gap-1">
          <button
            onClick={onEdit}
            className="h-8 w-8 rounded-full grid place-items-center hover:bg-slate-100 text-[color:var(--portal-ink-2)]"
            aria-label={t("edit", lang)}
            title={t("edit", lang)}
          >
            <Pencil className="h-4 w-4" />
          </button>
          <button
            onClick={onDelete}
            className="h-8 w-8 rounded-full grid place-items-center hover:bg-red-50 text-red-600"
            aria-label={t("delete", lang)}
            title={t("delete", lang)}
          >
            <Trash2 className="h-4 w-4" />
          </button>
        </div>
      </div>

      <DependentAppointmentsSection dependentId={row.id} lang={lang} />

    </div>
  );
}

/* ---------------- appointments history ---------------- */

const STATUS_LABEL: Record<string, keyof typeof T> = {
  scheduled: "st_scheduled",
  confirmed: "st_confirmed",
  completed: "st_completed",
  cancelled: "st_cancelled",
  canceled: "st_cancelled",
  no_show: "st_no_show",
  pending: "st_pending",
  in_progress: "st_in_progress",
};

function statusVisual(status: string): {
  cls: string;
  Icon: typeof CheckCircle2;
} {
  const s = (status || "").toLowerCase();
  if (s === "completed") return { cls: "bg-emerald-50 text-emerald-700", Icon: CheckCircle2 };
  if (s === "cancelled" || s === "canceled" || s === "no_show")
    return { cls: "bg-red-50 text-red-700", Icon: XCircle };
  if (s === "confirmed") return { cls: "bg-teal-50 text-teal-700", Icon: CheckCircle2 };
  if (s === "in_progress") return { cls: "bg-teal-50 text-teal-700", Icon: Clock3 };
  return { cls: "bg-amber-50 text-amber-700", Icon: Clock3 };
}

function DependentAppointmentsSection({
  dependentId,
  lang,
}: {
  dependentId: string;
  lang: Lang;
}) {
  const [open, setOpen] = useState(false);
  const q = useQuery({
    queryKey: ["portal", "dependent-appointments", dependentId],
    queryFn: () =>
      listDependentAppointments({ data: { dependent_id: dependentId, limit: 20 } }),
    enabled: open,
    staleTime: 30_000,
  });

  return (
    <details
      className="rounded-xl border border-[color:var(--portal-border)] bg-white/60 group"
      open={open}
      onToggle={(e) => setOpen((e.currentTarget as HTMLDetailsElement).open)}
    >
      <summary className="cursor-pointer list-none px-3 py-2 flex items-center justify-between gap-2 text-xs font-semibold">
        <span className="flex items-center gap-1.5">
          <ClipboardList className="h-3.5 w-3.5 text-[color:var(--portal-primary)]" />
          {t("history_toggle", lang)}
          {typeof q.data?.length === "number" && (
            <span className="text-[10px] font-normal text-[color:var(--portal-ink-2)]">
              ({q.data.length})
            </span>
          )}
        </span>
        <span className="text-[10px] font-normal text-[color:var(--portal-ink-2)]">
          {open ? t("history_hide", lang) : t("history_show", lang)}
        </span>
      </summary>
      <div className="px-3 pb-3">
        {q.isLoading ? (
          <div className="flex items-center gap-2 text-xs text-[color:var(--portal-ink-2)] py-3">
            <Loader2 className="h-3.5 w-3.5 animate-spin" />
            {t("history_loading", lang)}
          </div>
        ) : q.isError ? (
          <div className="flex items-center justify-between gap-2 text-xs text-red-600 py-3">
            <span>{t("history_error", lang)}</span>
            <button
              onClick={() => q.refetch()}
              className="rounded-full px-2 h-6 border border-red-200 hover:bg-red-50 text-red-700 font-semibold"
            >
              {t("history_retry", lang)}
            </button>
          </div>
        ) : (q.data?.length ?? 0) === 0 ? (
          <p className="text-xs text-[color:var(--portal-ink-2)] py-3 text-center">
            {t("history_empty", lang)}
          </p>
        ) : (
          <ul className="space-y-2 mt-1">
            {q.data!.map((a) => (
              <AppointmentRow key={a.id} row={a} lang={lang} />
            ))}
          </ul>
        )}
      </div>
    </details>
  );
}

function AppointmentRow({ row, lang }: { row: DependentAppointment; lang: Lang }) {
  const isAr = lang === "ar";
  const statusKey = (STATUS_LABEL[(row.status || "").toLowerCase()] ?? "st_unknown") as keyof typeof T;
  const { cls, Icon } = statusVisual(row.status);
  const dateLabel = new Date(`${row.appointment_date}T${row.appointment_time}`).toLocaleString(isAr ? "ar-SA-u-ca-gregory" : "en-GB",
    { day: "numeric", month: "short", year: "numeric", hour: "2-digit", minute: "2-digit" },
  );
  const doctorName = lang === "ar" ? row.doctor_name_ar : row.doctor_name_en ?? row.doctor_name_ar;

  return (
    <li className="rounded-lg border border-[color:var(--portal-border)] bg-[color:var(--portal-surface)] p-2.5 text-[11px] space-y-1">
      <div className="flex items-center justify-between gap-2 flex-wrap">
        <span className="inline-flex items-center gap-1 font-semibold text-[color:var(--portal-ink)]">
          <CalendarClock className="h-3 w-3 text-[color:var(--portal-primary)]" />
          <span dir="ltr">{dateLabel}</span>
        </span>
        <span
          className={`inline-flex items-center gap-1 rounded-full px-2 h-5 font-semibold ${cls}`}
        >
          <Icon className="h-3 w-3" />
          {t(statusKey, lang)}
        </span>
      </div>
      <div className="flex items-center flex-wrap gap-x-3 gap-y-0.5 text-[color:var(--portal-ink-2)]">
        {doctorName && (
          <span className="inline-flex items-center gap-1">
            <Stethoscope className="h-3 w-3" />
            {doctorName}
          </span>
        )}
        {row.branch_name_ar && (
          <span className="inline-flex items-center gap-1">
            <MapPin className="h-3 w-3" />
            {row.branch_name_ar}
          </span>
        )}
        {row.specialty_name_ar && lang === "ar" && (
          <span>· {row.specialty_name_ar}</span>
        )}
      </div>
      {row.reason && (
        <p className="text-[color:var(--portal-ink-2)] line-clamp-2">{row.reason}</p>
      )}
    </li>
  );
}


/* ---------------- form dialog ---------------- */

type FormState = {
  full_name: string;
  relationship: Dependent["relationship"] | "";
  gender: "" | "male" | "female";
  date_of_birth: string;
  national_id: string;
  phone: string;
};

const EMPTY: FormState = {
  full_name: "",
  relationship: "",
  gender: "",
  date_of_birth: "",
  national_id: "",
  phone: "",
};

const ERROR_KEY: Record<string, keyof typeof T> = {
  name_too_short: "e_name_too_short",
  name_too_long: "e_name_too_long",
  national_id_invalid: "e_nid",
  phone_invalid: "e_phone",
  date_invalid: "e_date",
};

function DependentDialog({
  lang,
  mode,
  initial,
  onClose,
}: {
  lang: Lang;
  mode: "add" | "edit";
  initial: Dependent | null;
  onClose: () => void;
}) {
  const isAr = lang === "ar";
  const qc = useQueryClient();
  const [form, setForm] = useState<FormState>(
    initial
      ? {
          full_name: initial.full_name,
          relationship: initial.relationship,
          gender: (initial.gender as FormState["gender"]) ?? "",
          date_of_birth: initial.date_of_birth ?? "",
          national_id: initial.national_id ?? "",
          phone: initial.phone ?? "",
        }
      : EMPTY,
  );
  const [errors, setErrors] = useState<Partial<Record<keyof FormState, string>>>({});

  const mut = useMutation({
    mutationFn: async (payload: FormState) => {
      const data = {
        full_name: payload.full_name.trim(),
        relationship: payload.relationship as Dependent["relationship"],
        gender: payload.gender || null,
        date_of_birth: payload.date_of_birth || null,
        national_id: payload.national_id.trim() || null,
        phone: payload.phone.trim() || null,
      };
      if (mode === "edit" && initial) {
        return updateDependent({ data: { id: initial.id, ...data } });
      }
      return createDependent({ data });
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["portal", "dependents"] });
      toast.success(mode === "edit" ? T.saved_updated[lang] : T.saved_created[lang]);
      onClose();
    },
    onError: (err: unknown) => {
      const msg = err instanceof Error ? err.message : String(err);
      // Map validator errors from Zod payload
      const found = Object.keys(ERROR_KEY).find((k) => msg.includes(k));
      if (found) {
        // best-effort field mapping
        const field: keyof FormState =
          found === "national_id_invalid" ? "national_id"
          : found === "phone_invalid" ? "phone"
          : found === "date_invalid" ? "date_of_birth"
          : "full_name";
        setErrors((e) => ({ ...e, [field]: T[ERROR_KEY[found]][lang] }));
      } else {
        toast.error(T.e_generic[lang]);
      }
    },
  });

  function submit(e: React.FormEvent) {
    e.preventDefault();
    const nextErrors: Partial<Record<keyof FormState, string>> = {};
    if (form.full_name.trim().length < 2) nextErrors.full_name = T.e_name_too_short[lang];
    if (!form.relationship) nextErrors.relationship = T.e_relationship[lang];
    if (form.national_id && !/^\d{10}$/.test(form.national_id.trim()))
      nextErrors.national_id = T.e_nid[lang];
    if (form.phone && !/^(?:\+?966|0)?5\d{8}$/.test(form.phone.trim()))
      nextErrors.phone = T.e_phone[lang];
    if (form.date_of_birth && !/^\d{4}-\d{2}-\d{2}$/.test(form.date_of_birth))
      nextErrors.date_of_birth = T.e_date[lang];
    setErrors(nextErrors);
    if (Object.keys(nextErrors).length > 0) return;
    mut.mutate(form);
  }

  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="sm:max-w-lg" dir={(isAr ? "rtl" : "ltr")}>
        <DialogHeader>
          <DialogTitle>
            {mode === "edit" ? t("form_edit_title", lang) : t("form_add_title", lang)}
          </DialogTitle>
          <DialogDescription>{t("form_desc", lang)}</DialogDescription>
        </DialogHeader>

        <form onSubmit={submit} className="grid gap-4">
          <Field label={t("f_name", lang)} error={errors.full_name}>
            <Input
              value={form.full_name}
              onChange={(e) => setForm({ ...form, full_name: e.target.value })}
              autoFocus
              required
              maxLength={120}
            />
          </Field>

          <div className="grid gap-4 sm:grid-cols-2">
            <Field label={t("f_relationship", lang)} error={errors.relationship}>
              <Select
                value={form.relationship || undefined}
                onValueChange={(v) =>
                  setForm({ ...form, relationship: v as Dependent["relationship"] })
                }
              >
                <SelectTrigger className="bg-[color:var(--portal-surface)]">
                  <SelectValue placeholder={t("choose", lang)} />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="child">{t("r_child", lang)}</SelectItem>
                  <SelectItem value="spouse">{t("r_spouse", lang)}</SelectItem>
                  <SelectItem value="parent">{t("r_parent", lang)}</SelectItem>
                  <SelectItem value="sibling">{t("r_sibling", lang)}</SelectItem>
                  <SelectItem value="other">{t("r_other", lang)}</SelectItem>
                </SelectContent>
              </Select>
            </Field>

            <Field
              label={`${t("f_gender", lang)} — ${t("optional", lang)}`}
              error={undefined}
            >
              <Select
                value={form.gender || undefined}
                onValueChange={(v) =>
                  setForm({ ...form, gender: v as FormState["gender"] })
                }
              >
                <SelectTrigger className="bg-[color:var(--portal-surface)]">
                  <SelectValue placeholder={t("choose", lang)} />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="male">{t("g_male", lang)}</SelectItem>
                  <SelectItem value="female">{t("g_female", lang)}</SelectItem>
                </SelectContent>
              </Select>
            </Field>
          </div>

          <div className="grid gap-4 sm:grid-cols-2">
            <Field
              label={`${t("f_dob", lang)} — ${t("optional", lang)}`}
              error={errors.date_of_birth}
            >
              <Input
                type="date"
                value={form.date_of_birth}
                onChange={(e) => setForm({ ...form, date_of_birth: e.target.value })}
                max={new Date().toISOString().slice(0, 10)}
              />
            </Field>
            <Field
              label={`${t("f_nid", lang)} — ${t("optional", lang)}`}
              error={errors.national_id}
            >
              <Input
                value={form.national_id}
                onChange={(e) => setForm({ ...form, national_id: e.target.value })}
                inputMode="numeric"
                maxLength={10}
                dir="ltr"
                placeholder="1XXXXXXXXX"
              />
            </Field>
          </div>

          <Field
            label={`${t("f_phone", lang)} — ${t("optional", lang)}`}
            error={errors.phone}
          >
            <Input
              value={form.phone}
              onChange={(e) => setForm({ ...form, phone: e.target.value })}
              inputMode="tel"
              maxLength={14}
              dir="ltr"
              placeholder="05XXXXXXXX"
            />
          </Field>

          <DialogFooter className="gap-2">
            <Button
              type="button"
              variant="ghost"
              onClick={onClose}
              disabled={mut.isPending}
            >
              {t("cancel", lang)}
            </Button>
            <Button
              type="submit"
              disabled={mut.isPending}
              className="rounded-full text-[color:var(--portal-on-primary)] font-semibold px-6"
              style={{ background: "var(--portal-gradient)" }}
            >
              {mut.isPending ? (
                <>
                  <Loader2 className="h-4 w-4 ms-2 animate-spin" />
                  {t("saving", lang)}
                </>
              ) : (
                t("save", lang)
              )}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

function Field({
  label,
  error,
  children,
}: {
  label: string;
  error?: string;
  children: React.ReactNode;
}) {
  return (
    <div className="grid gap-1.5">
      <Label className="text-xs">{label}</Label>
      {children}
      {error && <p className="text-xs text-red-600">{error}</p>}
    </div>
  );
}

/* ---------------- delete dialog ---------------- */

function DeleteDialog({
  lang,
  row,
  onClose,
}: {
  lang: Lang;
  row: Dependent | null;
  onClose: () => void;
}) {
  const isAr = lang === "ar";
  const qc = useQueryClient();
  const [confirmCancel, setConfirmCancel] = useState(false);

  const countQ = useQuery({
    queryKey: ["portal", "dependent-appt-count", row?.id],
    queryFn: () =>
      countDependentAppointments({ data: { dependent_id: row!.id } }),
    enabled: !!row,
    staleTime: 15_000,
  });
  const mut = useMutation({
    mutationFn: (id: string) => deleteDependent({ data: { id } }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["portal", "dependents"] });
      toast.success(T.del_ok[lang]);
      onClose();
    },
    onError: () => toast.error(T.e_generic[lang]),
  });
  const cancelMut = useMutation({
    mutationFn: (dependent_id: string) =>
      cancelDependentActiveAppointments({ data: { dependent_id } }),
    onSuccess: (res) => {
      if (res.cancelled > 0) {
        toast.success(T.del_cancel_success[lang], {
          description:
            lang === "ar"
              ? `تم إلغاء ${res.cancelled} موعدًا نشطًا وتحرير حجوزاتها.`
              : `Cancelled ${res.cancelled} active appointment${res.cancelled === 1 ? "" : "s"} and freed their slots.`,
        });
      } else {
        toast.info(T.del_cancel_none[lang]);
      }
      if (row) {
        qc.invalidateQueries({
          queryKey: ["portal", "dependent-appt-count", row.id],
        });
        qc.invalidateQueries({
          queryKey: ["portal", "dependent-appointments", row.id],
        });
      }
      setConfirmCancel(false);
    },
    onError: (err: unknown) => {
      const detail =
        err instanceof Error && err.message
          ? err.message
          :(isAr ? "خطأ غير متوقع أثناء الاتصال بالخادم." : "Unexpected server error.");
      toast.error(T.del_cancel_error[lang], {
        description: detail,
        duration: 8000,
      });
      setConfirmCancel(false);
    },

  });


  const activeCount = countQ.data?.active ?? 0;
  const totalCount = countQ.data?.total ?? 0;
  const blocked = activeCount > 0;
  const hasHistory = !blocked && totalCount > 0;
  const busy = mut.isPending || cancelMut.isPending;
  const canDelete = countQ.isSuccess && !blocked && !busy;


  return (
    <AlertDialog
      open={!!row}
      onOpenChange={(o) => {
        if (o) return;
        if (busy) return; // don't close while a mutation is running
        onClose();
      }}
    >
      <AlertDialogContent
        dir={(isAr ? "rtl" : "ltr")}
        aria-busy={busy}
        aria-labelledby="dep-del-title"
        aria-describedby="dep-del-desc"
        onEscapeKeyDown={(e) => {
          if (busy) e.preventDefault();
        }}
        onOpenAutoFocus={(e) => {
          // Move initial focus to the safe (Cancel/keep) button
          e.preventDefault();
          const el = document.querySelector<HTMLButtonElement>(
            '[data-dep-del-cancel="true"]',
          );
          el?.focus();
        }}
      >


        <AlertDialogHeader>
          <AlertDialogTitle
            id="dep-del-title"
            className="flex items-center gap-2 text-red-700"
          >
            <AlertTriangle className="h-5 w-5" aria-hidden />
            {T.del_title[lang]}
          </AlertDialogTitle>
          <AlertDialogDescription asChild>
            <div id="dep-del-desc" className="space-y-3 text-sm">

              <div className="rounded-lg border border-red-200 bg-red-50 p-3 flex items-start gap-2">
                <ShieldAlert className="h-4 w-4 mt-0.5 text-red-600 shrink-0" aria-hidden />
                <div className="text-red-800 font-medium">
                  {T.del_warning[lang]}
                </div>
              </div>
              <div className="text-foreground">
                <span className="text-muted-foreground">{T.member_label[lang]} </span>
                <span className="font-semibold">{row?.full_name}</span>
              </div>

              {/* Linked-appointments summary */}
              {countQ.isLoading ? (
                <div className="flex items-center gap-2 text-muted-foreground">
                  <Loader2 className="h-4 w-4 animate-spin" />
                  <span>{T.del_counting[lang]}</span>
                </div>
              ) : countQ.isError ? (
                <div className="rounded-lg border border-amber-200 bg-amber-50 p-3 text-amber-800">
                  {T.del_count_error[lang]}
                </div>
              ) : (
                <div className="rounded-lg border border-border bg-muted/40 p-3 space-y-1.5">
                  <div className="flex items-center justify-between gap-3">
                    <span className="text-muted-foreground">{T.del_total_label[lang]}</span>
                    <span className="font-semibold tabular-nums">{totalCount}</span>
                  </div>
                  <div className="flex items-center justify-between gap-3">
                    <span className="text-muted-foreground">{T.del_active_label[lang]}</span>
                    <span
                      className={`font-semibold tabular-nums ${
                        activeCount > 0 ? "text-red-600" : ""
                      }`}
                    >
                      {activeCount}
                    </span>
                  </div>
                </div>
              )}

              {blocked && (
                <div className="rounded-lg border border-red-300 bg-red-100/70 p-3 space-y-2">
                  <div className="flex items-start gap-2">
                    <ShieldAlert className="h-4 w-4 mt-0.5 text-red-700 shrink-0" aria-hidden />
                    <div className="text-red-900">
                      <div className="font-semibold">{T.del_blocked_title[lang]}</div>
                      <div className="mt-0.5">{T.del_blocked_body[lang]}</div>
                    </div>
                  </div>
                  <button
                    type="button"
                    disabled={busy}
                    onClick={() => {
                      if (!row || busy) return;
                      setConfirmCancel(true);
                    }}

                    className="inline-flex items-center gap-2 rounded-md border border-red-300 bg-white/70 px-3 h-9 text-xs font-semibold text-red-800 hover:bg-[color:var(--portal-surface)] disabled:opacity-50 disabled:cursor-not-allowed"
                  >
                    {cancelMut.isPending ? (
                      <>
                        <Loader2 className="h-3.5 w-3.5 animate-spin" />
                        {T.del_cancelling[lang]}
                      </>
                    ) : (
                      <>
                        <XCircle className="h-3.5 w-3.5" />
                        {T.del_cancel_active[lang]} ({activeCount})
                      </>
                    )}
                  </button>
                </div>
              )}

              {hasHistory && (
                <div className="text-xs text-muted-foreground">
                  {T.del_history_note[lang]}
                </div>
              )}

              <div className="text-muted-foreground">{T.del_body[lang]}</div>
            </div>
          </AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel
            data-dep-del-cancel="true"
            disabled={busy}
            aria-disabled={busy}
            className="font-semibold border-2 disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {T.del_keep[lang]}
          </AlertDialogCancel>

          <AlertDialogAction
            disabled={!canDelete}
            onClick={(e) => {
              e.preventDefault();
              if (!canDelete) return;
              if (row) mut.mutate(row.id);
            }}
            className="bg-red-600 hover:bg-red-700 text-[color:var(--portal-on-primary)] font-semibold disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {mut.isPending ? (
              <>
                <Loader2 className="h-4 w-4 ms-2 animate-spin" />
                {T.saving[lang]}
              </>
            ) : (
              T.del_ok[lang]
            )}
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>

      {/* Second confirmation: cancelling active appointments */}
      <AlertDialog
        open={confirmCancel}
        onOpenChange={(o) => {
          if (!o && !cancelMut.isPending) setConfirmCancel(false);
        }}
      >
        <AlertDialogContent
          dir={(isAr ? "rtl" : "ltr")}
          aria-busy={cancelMut.isPending}
          aria-labelledby="dep-cancel-title"
          aria-describedby="dep-cancel-desc"
          onEscapeKeyDown={(e) => {
            if (cancelMut.isPending) e.preventDefault();
          }}
          onOpenAutoFocus={(e) => {
            e.preventDefault();
            const el = document.querySelector<HTMLButtonElement>(
              '[data-dep-cancel-back="true"]',
            );
            el?.focus();
          }}
        >
          <AlertDialogHeader>
            <AlertDialogTitle
              id="dep-cancel-title"
              className="flex items-center gap-2 text-red-700"
            >
              <AlertTriangle className="h-5 w-5" aria-hidden />
              {T.del_cancel_confirm_title[lang]}
            </AlertDialogTitle>
            <AlertDialogDescription asChild>
              <div id="dep-cancel-desc" className="space-y-3 text-sm">

                <div className="rounded-lg border border-red-200 bg-red-50 p-3 flex items-start gap-2">
                  <ShieldAlert className="h-4 w-4 mt-0.5 text-red-600 shrink-0" aria-hidden />
                  <div className="text-red-800 font-medium">
                    {T.del_cancel_confirm_warning[lang]}
                  </div>
                </div>
                <div className="text-foreground">{T.del_cancel_confirm[lang]}</div>
                <div className="rounded-lg border border-border bg-muted/40 p-3 flex items-center justify-between gap-3">
                  <span className="text-muted-foreground">
                    {T.del_active_label[lang]}
                  </span>
                  <span className="font-semibold tabular-nums text-red-600">
                    {activeCount}
                  </span>
                </div>
                <div className="text-foreground">
                  <span className="text-muted-foreground">{T.member_label[lang]} </span>
                  <span className="font-semibold">{row?.full_name}</span>
                </div>

                {cancelMut.isPending && (
                  <div
                    role="status"
                    aria-live="polite"
                    className="flex items-center gap-2 rounded-lg border border-red-200 bg-red-50/70 p-3 text-red-800"
                  >
                    <Loader2 className="h-4 w-4 animate-spin shrink-0" aria-hidden />
                    <span className="font-medium">{T.del_cancelling[lang]}</span>
                  </div>
                )}
              </div>
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel
              data-dep-cancel-back="true"
              disabled={cancelMut.isPending}
              aria-disabled={cancelMut.isPending}
              className="font-semibold border-2 disabled:opacity-50 disabled:cursor-not-allowed"
            >

              {T.del_cancel_confirm_keep[lang]}
            </AlertDialogCancel>
            <AlertDialogAction
              disabled={cancelMut.isPending || !row}
              aria-disabled={cancelMut.isPending || !row}
              onClick={(e) => {
                e.preventDefault();
                if (!row || cancelMut.isPending) return;
                cancelMut.mutate(row.id);
              }}
              className="bg-red-600 hover:bg-red-700 text-[color:var(--portal-on-primary)] font-semibold disabled:opacity-50 disabled:cursor-not-allowed inline-flex items-center gap-2"
            >
              {cancelMut.isPending ? (
                <>
                  <Loader2 className="h-4 w-4 animate-spin" aria-hidden />
                  {T.del_cancelling[lang]}
                </>
              ) : (
                T.del_cancel_confirm_ok[lang]
              )}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>

      </AlertDialog>
    </AlertDialog>
  );
}



/* ---------------- error boundary ---------------- */

function FamilyError({ error, reset }: { error: Error; reset: () => void }) {
  const router = useRouter();
  const qc = useQueryClient();
  const cached = qc.getQueryData(profileQuery.queryKey) as
    | { preferred_language?: string | null }
    | undefined;
  const docLang =
    typeof document !== "undefined" ? document.documentElement.lang : "ar";
  const lang: Lang = ((cached?.preferred_language as Lang | undefined) ??
  const isAr = lang === "ar";
    (docLang === "en" ? "en" : "ar")) as Lang;
  return (
    <div className="glass-card max-w-md mx-auto p-8 text-center" dir={(isAr ? "rtl" : "ltr")}>
      <div className="mx-auto h-14 w-14 rounded-2xl grid place-items-center bg-red-50 text-red-500 mb-4">
        <AlertTriangle className="h-7 w-7" />
      </div>
      <h3 className="text-lg font-bold">{T.page_error_title[lang]}</h3>
      <p className="text-sm text-[color:var(--portal-ink-2)] mt-2 break-words">
        {error.message || T.page_error_generic[lang]}
      </p>
      <button
        onClick={() => {
          router.invalidate();
          reset();
        }}
        className="mt-5 inline-flex items-center gap-2 rounded-full px-4 h-10 text-sm font-semibold text-[color:var(--portal-on-primary)]"
        style={{ background: "var(--portal-gradient)" }}
      >
        <RefreshCw className="h-4 w-4" />
        {T.page_error_retry[lang]}
      </button>
    </div>
  );
}
