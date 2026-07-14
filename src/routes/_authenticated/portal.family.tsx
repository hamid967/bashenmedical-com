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
  listDependentAppointments,
  type Dependent,
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
  const qc = useQueryClient();

  const [dialog, setDialog] = useState<{ mode: "add" } | { mode: "edit"; row: Dependent } | null>(
    null,
  );
  const [toDelete, setToDelete] = useState<Dependent | null>(null);
  const dir = lang === "ar" ? "rtl" : "ltr";

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

  const nextLang: Lang = lang === "ar" ? "en" : "ar";

  return (
    <div className="space-y-6 pb-24 md:pb-6" dir={dir}>
      <header className="flex items-start justify-between gap-3 flex-wrap">
        <div>
          <h1 className="text-2xl md:text-3xl font-bold flex items-center gap-2">
            <UsersRound className="h-6 w-6 text-[color:var(--portal-primary)]" />
            {t("title", lang)}
          </h1>
          <p className="text-sm text-[color:var(--portal-ink-2)] mt-1 max-w-xl">
            {t("subtitle", lang)}
          </p>
        </div>
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
            className="rounded-full text-white font-semibold px-5"
            style={{ background: "var(--portal-gradient)" }}
          >
            <UserPlus className="h-4 w-4 ms-2" />
            {t("add", lang)}
          </Button>
        </div>
      </header>


      {rows.length === 0 ? (
        <div className="glass-card p-10 text-center">
          <div className="mx-auto h-14 w-14 rounded-2xl grid place-items-center bg-[color:var(--portal-primary)]/10 text-[color:var(--portal-primary)] mb-4">
            <UsersRound className="h-7 w-7" />
          </div>
          <h2 className="text-lg font-bold">{t("empty_title", lang)}</h2>
          <p className="text-sm text-[color:var(--portal-ink-2)] mt-2 max-w-md mx-auto">
            {t("empty_body", lang)}
          </p>
          <Button
            onClick={() => setDialog({ mode: "add" })}
            className="mt-5 rounded-full text-white font-semibold px-5"
            style={{ background: "var(--portal-gradient)" }}
          >
            <UserPlus className="h-4 w-4 ms-2" />
            {t("add", lang)}
          </Button>
        </div>
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
  const initials = row.full_name
    .split(" ")
    .slice(0, 2)
    .map((s) => s[0])
    .join("");
  const rel = t(RELATIONSHIP_LABELS[row.relationship], lang);
  const missing = dependentMissingForBooking(row);
  const canBook = missing.length === 0;
  return (
    <div className="glass-card p-4 flex flex-col gap-3">
      <div className="flex items-center gap-3">
        <div
          className="h-12 w-12 rounded-full grid place-items-center text-white font-bold shrink-0"
          style={{ background: "var(--portal-gradient)" }}
        >
          <span>{initials || "?"}</span>
        </div>
        <div className="min-w-0 flex-1">
          <div className="font-semibold truncate">{row.full_name}</div>
          <div className="text-xs text-[color:var(--portal-ink-2)] truncate">{rel}</div>
        </div>
        <span
          className={`inline-flex items-center gap-1 text-[11px] font-semibold rounded-full px-2 h-6 whitespace-nowrap ${
            row.verified
              ? "bg-emerald-50 text-emerald-700"
              : "bg-amber-50 text-amber-700"
          }`}
        >
          {row.verified ? (
            <>
              <BadgeCheck className="h-3 w-3" />
              {t("verified", lang)}
            </>
          ) : (
            <>
              <ShieldAlert className="h-3 w-3" />
              {t("pending", lang)}
            </>
          )}
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
            className="inline-flex items-center gap-1.5 text-xs font-semibold rounded-full px-3 h-8 text-white"
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
  if (s === "confirmed") return { cls: "bg-sky-50 text-sky-700", Icon: CheckCircle2 };
  if (s === "in_progress") return { cls: "bg-indigo-50 text-indigo-700", Icon: Clock3 };
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
  const statusKey = (STATUS_LABEL[(row.status || "").toLowerCase()] ?? "st_unknown") as keyof typeof T;
  const { cls, Icon } = statusVisual(row.status);
  const dateLabel = new Date(`${row.appointment_date}T${row.appointment_time}`).toLocaleString(
    lang === "ar" ? "ar-SA-u-ca-gregory" : "en-GB",
    { day: "numeric", month: "short", year: "numeric", hour: "2-digit", minute: "2-digit" },
  );
  const doctorName = lang === "ar" ? row.doctor_name_ar : row.doctor_name_en ?? row.doctor_name_ar;

  return (
    <li className="rounded-lg border border-[color:var(--portal-border)] bg-white p-2.5 text-[11px] space-y-1">
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
      <DialogContent className="sm:max-w-lg" dir={lang === "ar" ? "rtl" : "ltr"}>
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
                <SelectTrigger className="bg-white">
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
                <SelectTrigger className="bg-white">
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
              className="rounded-full text-white font-semibold px-6"
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
  const qc = useQueryClient();
  const mut = useMutation({
    mutationFn: (id: string) => deleteDependent({ data: { id } }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["portal", "dependents"] });
      toast.success(T.del_ok[lang]);
      onClose();
    },
    onError: () => toast.error(T.e_generic[lang]),
  });
  return (
    <AlertDialog open={!!row} onOpenChange={(o) => !o && onClose()}>
      <AlertDialogContent dir={lang === "ar" ? "rtl" : "ltr"}>
        <AlertDialogHeader>
          <AlertDialogTitle className="flex items-center gap-2 text-red-700 dark:text-red-400">
            <AlertTriangle className="h-5 w-5" aria-hidden />
            {T.del_title[lang]}
          </AlertDialogTitle>
          <AlertDialogDescription asChild>
            <div className="space-y-3 text-sm">
              <div className="rounded-lg border border-red-200 bg-red-50 dark:bg-red-950/30 dark:border-red-900/60 p-3 flex items-start gap-2">
                <ShieldAlert className="h-4 w-4 mt-0.5 text-red-600 dark:text-red-400 shrink-0" aria-hidden />
                <div className="text-red-800 dark:text-red-200 font-medium">
                  {T.del_warning[lang]}
                </div>
              </div>
              <div className="text-foreground">
                <span className="text-muted-foreground">{T.member_label[lang]} </span>
                <span className="font-semibold">{row?.full_name}</span>
              </div>
              <div className="text-muted-foreground">{T.del_body[lang]}</div>
            </div>
          </AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel
            disabled={mut.isPending}
            className="font-semibold border-2"
            autoFocus
          >
            {T.del_keep[lang]}
          </AlertDialogCancel>
          <AlertDialogAction
            disabled={mut.isPending}
            onClick={(e) => {
              e.preventDefault();
              if (row) mut.mutate(row.id);
            }}
            className="bg-red-600 hover:bg-red-700 text-white font-semibold"
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
    </AlertDialog>
  );
}

/* ---------------- error boundary ---------------- */

function FamilyError({ error, reset }: { error: Error; reset: () => void }) {
  const router = useRouter();
  return (
    <div className="glass-card max-w-md mx-auto p-8 text-center">
      <div className="mx-auto h-14 w-14 rounded-2xl grid place-items-center bg-red-50 text-red-500 mb-4">
        <AlertTriangle className="h-7 w-7" />
      </div>
      <h3 className="text-lg font-bold">تعذّر تحميل الصفحة</h3>
      <p className="text-sm text-[color:var(--portal-ink-2)] mt-2 break-words">
        {error.message || "خطأ غير متوقع."}
      </p>
      <button
        onClick={() => {
          router.invalidate();
          reset();
        }}
        className="mt-5 inline-flex items-center gap-2 rounded-full px-4 h-10 text-sm font-semibold text-white"
        style={{ background: "var(--portal-gradient)" }}
      >
        <RefreshCw className="h-4 w-4" />
        إعادة المحاولة
      </button>
    </div>
  );
}
