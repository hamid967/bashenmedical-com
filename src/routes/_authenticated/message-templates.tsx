import { createFileRoute, Link } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useMemo, useState } from "react";
import { toast } from "sonner";
import {
  Bell,
  MessageSquare,
  MessageCircle,
  Mail,
  Smartphone,
  Plus,
  Save,
  Trash2,
  Eye,
  ChevronLeft,
  Sparkles,
} from "lucide-react";
import {
  listMessageTemplates,
  upsertMessageTemplate,
  deleteMessageTemplate,
  renderTemplate,
  TEMPLATE_VARIABLES,
  type MessageChannel,
  type MessageTemplate,
} from "@/lib/message-templates.functions";
import { RequirePermission } from "@/components/rbac/RequirePermission";

export const Route = createFileRoute("/_authenticated/message-templates")({
  head: () => ({
    meta: [{ title: "قوالب الرسائل | مجمع باعشن الطبي" }, { name: "robots", content: "noindex" }],
  }),
  component: () => (
    <RequirePermission anyOf="notifications.manage">
      <MessageTemplatesPage />
    </RequirePermission>
  ),
});

const CHANNELS: Array<{
  value: MessageChannel;
  label: string;
  Icon: any;
  color: string;
  hint: string;
}> = [
  {
    value: "in_app",
    label: "داخل التطبيق",
    Icon: Bell,
    color: "bg-slate-100 text-slate-800",
    hint: "إشعار داخل جرس التطبيق.",
  },
  {
    value: "web_push",
    label: "Push",
    Icon: Smartphone,
    color: "bg-teal-100 text-teal-900",
    hint: "إشعار متصفح/جوال. حافظ على نص قصير.",
  },
  {
    value: "sms",
    label: "SMS",
    Icon: MessageSquare,
    color: "bg-teal-100 text-teal-900",
    hint: "رسالة نصية ≤ 160 حرف موصى بها.",
  },
  {
    value: "whatsapp",
    label: "WhatsApp",
    Icon: MessageCircle,
    color: "bg-emerald-100 text-emerald-900",
    hint: "يدعم أسطر متعددة ورموز.",
  },
  {
    value: "email",
    label: "Email",
    Icon: Mail,
    color: "bg-teal-100 text-teal-900",
    hint: "استخدم عنوانًا واضحًا.",
  },
];

const CHANNEL_META: Record<
  MessageChannel,
  { value: MessageChannel; label: string; Icon: any; color: string; hint: string }
> = Object.fromEntries(CHANNELS.map((c) => [c.value, c])) as any;

type FormState = {
  id: string | null;
  template_key: string;
  channel: MessageChannel;
  name: string;
  title: string;
  body: string;
  description: string;
  is_active: boolean;
};

const EMPTY: FormState = {
  id: null,
  template_key: "",
  channel: "sms",
  name: "",
  title: "",
  body: "",
  description: "",
  is_active: true,
};

function MessageTemplatesPage() {
  const listFn = useServerFn(listMessageTemplates);
  const upsertFn = useServerFn(upsertMessageTemplate);
  const deleteFn = useServerFn(deleteMessageTemplate);
  const qc = useQueryClient();

  const [filterChannel, setFilterChannel] = useState<MessageChannel | null>(null);
  const [form, setForm] = useState<FormState>(EMPTY);
  const [errors, setErrors] = useState<Record<string, string>>({});

  const listQ = useQuery({
    queryKey: ["message-templates", filterChannel],
    queryFn: () => listFn({ data: { channel: filterChannel } }),
  });

  const save = useMutation({
    mutationFn: (v: FormState) =>
      upsertFn({
        data: {
          id: v.id,
          template_key: v.template_key.trim(),
          channel: v.channel,
          name: v.name.trim(),
          title: v.title.trim() || null,
          body: v.body,
          description: v.description.trim() || null,
          is_active: v.is_active,
        },
      }),
    onSuccess: (row) => {
      toast.success(form.id ? "تم تحديث القالب" : "تمت إضافة القالب");
      qc.invalidateQueries({ queryKey: ["message-templates"] });
      setForm({
        id: row.id,
        template_key: row.template_key,
        channel: row.channel,
        name: row.name,
        title: row.title ?? "",
        body: row.body,
        description: row.description ?? "",
        is_active: row.is_active,
      });
      setErrors({});
    },
    onError: (e: any) => toast.error(e?.message ?? "فشل الحفظ"),
  });

  const remove = useMutation({
    mutationFn: (id: string) => deleteFn({ data: { id } }),
    onSuccess: () => {
      toast.success("تم حذف القالب");
      qc.invalidateQueries({ queryKey: ["message-templates"] });
      setForm(EMPTY);
    },
    onError: (e: any) => toast.error(e?.message ?? "فشل الحذف"),
  });

  function validate(v: FormState) {
    const e: Record<string, string> = {};
    if (v.name.trim().length < 2) e.name = "الاسم مطلوب";
    if (!/^[a-z0-9_]{2,80}$/i.test(v.template_key.trim()))
      e.template_key = "مفتاح غير صالح (a-z, 0-9, _)";
    if (v.body.trim().length < 1) e.body = "النص مطلوب";
    if (v.body.length > 4000) e.body = "النص طويل جدًا (الحد 4000)";
    if (v.channel === "sms" && v.body.length > 320) e.body = "رسائل SMS يفضل ألا تتجاوز 320 حرفًا";
    return e;
  }

  function handleSubmit(ev: React.FormEvent) {
    ev.preventDefault();
    const e = validate(form);
    setErrors(e);
    if (Object.keys(e).length) {
      toast.error("راجع الحقول المطلوبة");
      return;
    }
    save.mutate(form);
  }

  const sampleValues = useMemo(
    () => Object.fromEntries(TEMPLATE_VARIABLES.map((v) => [v.key, v.sample])),
    [],
  );
  const previewBody = useMemo(
    () => renderTemplate(form.body || "", sampleValues),
    [form.body, sampleValues],
  );
  const previewTitle = useMemo(
    () => renderTemplate(form.title || "", sampleValues),
    [form.title, sampleValues],
  );

  function insertVariable(key: string) {
    const token = `{{${key}}}`;
    const ta = document.getElementById("tpl-body") as HTMLTextAreaElement | null;
    if (!ta) {
      setForm((f) => ({ ...f, body: (f.body || "") + token }));
      return;
    }
    const start = ta.selectionStart ?? ta.value.length;
    const end = ta.selectionEnd ?? ta.value.length;
    const next = ta.value.slice(0, start) + token + ta.value.slice(end);
    setForm((f) => ({ ...f, body: next }));
    requestAnimationFrame(() => {
      ta.focus();
      const pos = start + token.length;
      ta.setSelectionRange(pos, pos);
    });
  }

  const currentChannelMeta = CHANNEL_META[form.channel];

  return (
    <div className="min-h-screen bg-gradient-to-b from-slate-50 to-white p-4 md:p-6" dir="rtl">
      <div className="mx-auto max-w-7xl">
        <div className="mb-4 flex items-center justify-between gap-2">
          <div>
            <div className="flex items-center gap-2 text-sm text-muted-foreground">
              <Link to="/admin" className="inline-flex items-center gap-1 hover:text-foreground">
                <ChevronLeft className="h-4 w-4" /> لوحة التحكم
              </Link>
            </div>
            <h1 className="mt-1 text-2xl font-bold">قوالب الرسائل</h1>
            <p className="text-sm text-muted-foreground">
              أنشئ قوالب لرسائل التذكيرات والإشعارات مع متغيرات مثل اسم المريض وتاريخ الموعد.
            </p>
          </div>
          <button
            onClick={() => {
              setForm(EMPTY);
              setErrors({});
            }}
            className="inline-flex items-center gap-2 rounded-md bg-primary px-3 py-2 text-sm font-medium text-primary-foreground shadow-sm hover:opacity-95"
          >
            <Plus className="h-4 w-4" /> قالب جديد
          </button>
        </div>

        <div className="grid grid-cols-1 gap-4 lg:grid-cols-12">
          {/* ---------- Sidebar list ---------- */}
          <aside className="lg:col-span-4">
            <div className="rounded-xl border bg-white p-3 shadow-sm">
              <div className="mb-3 flex flex-wrap gap-1">
                <button
                  onClick={() => setFilterChannel(null)}
                  className={`rounded-full px-3 py-1 text-xs ${
                    filterChannel === null
                      ? "bg-slate-900 text-white"
                      : "bg-slate-100 text-slate-700"
                  }`}
                >
                  الكل
                </button>
                {CHANNELS.map((c) => (
                  <button
                    key={c.value}
                    onClick={() => setFilterChannel(c.value)}
                    className={`inline-flex items-center gap-1 rounded-full px-3 py-1 text-xs ${
                      filterChannel === c.value
                        ? "bg-slate-900 text-white"
                        : "bg-slate-100 text-slate-700"
                    }`}
                  >
                    <c.Icon className="h-3.5 w-3.5" /> {c.label}
                  </button>
                ))}
              </div>

              {listQ.isLoading ? (
                <div className="p-4 text-center text-sm text-muted-foreground">جاري التحميل…</div>
              ) : (listQ.data?.length ?? 0) === 0 ? (
                <div className="rounded-lg border border-dashed p-6 text-center text-sm text-muted-foreground">
                  لا توجد قوالب بعد. أنشئ قالبك الأول من الأعلى.
                </div>
              ) : (
                <ul className="max-h-[70vh] space-y-1 overflow-auto pr-1">
                  {listQ.data!.map((t: MessageTemplate) => {
                    const meta = CHANNEL_META[t.channel];
                    const active = form.id === t.id;
                    return (
                      <li key={t.id}>
                        <button
                          onClick={() =>
                            setForm({
                              id: t.id,
                              template_key: t.template_key,
                              channel: t.channel,
                              name: t.name,
                              title: t.title ?? "",
                              body: t.body,
                              description: t.description ?? "",
                              is_active: t.is_active,
                            })
                          }
                          className={`w-full rounded-lg border p-3 text-right transition ${
                            active
                              ? "border-primary bg-primary/5"
                              : "border-transparent hover:border-slate-200 hover:bg-slate-50"
                          }`}
                        >
                          <div className="flex items-center justify-between gap-2">
                            <span className="truncate font-medium">{t.name}</span>
                            <span
                              className={`inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[10px] ${meta.color}`}
                            >
                              <meta.Icon className="h-3 w-3" /> {meta.label}
                            </span>
                          </div>
                          <div className="mt-1 flex items-center justify-between gap-2">
                            <code className="truncate text-[11px] text-muted-foreground">
                              {t.template_key}
                            </code>
                            {!t.is_active && (
                              <span className="rounded-full bg-amber-100 px-2 py-0.5 text-[10px] text-amber-800">
                                معطّل
                              </span>
                            )}
                          </div>
                        </button>
                      </li>
                    );
                  })}
                </ul>
              )}
            </div>
          </aside>

          {/* ---------- Editor + preview ---------- */}
          <section className="lg:col-span-8">
            <form onSubmit={handleSubmit} className="rounded-xl border bg-white p-4 shadow-sm">
              <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
                <div>
                  <label className="mb-1 block text-sm font-medium">اسم القالب</label>
                  <input
                    value={form.name}
                    onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))}
                    placeholder="مثال: تذكير موعد قبل يوم"
                    className="w-full rounded-md border px-3 py-2 text-sm"
                    maxLength={120}
                  />
                  {errors.name && <p className="mt-1 text-xs text-rose-600">{errors.name}</p>}
                </div>
                <div>
                  <label className="mb-1 block text-sm font-medium">
                    المفتاح <span className="text-muted-foreground">(latin/underscore)</span>
                  </label>
                  <input
                    value={form.template_key}
                    onChange={(e) =>
                      setForm((f) => ({
                        ...f,
                        template_key: e.target.value.replace(/[^a-z0-9_]/gi, "_"),
                      }))
                    }
                    placeholder="reminder_24h"
                    className="w-full rounded-md border px-3 py-2 font-mono text-sm ltr:text-left"
                    dir="ltr"
                    maxLength={80}
                  />
                  {errors.template_key && (
                    <p className="mt-1 text-xs text-rose-600">{errors.template_key}</p>
                  )}
                </div>
                <div>
                  <label className="mb-1 block text-sm font-medium">القناة</label>
                  <select
                    value={form.channel}
                    onChange={(e) =>
                      setForm((f) => ({ ...f, channel: e.target.value as MessageChannel }))
                    }
                    className="w-full rounded-md border px-3 py-2 text-sm"
                  >
                    {CHANNELS.map((c) => (
                      <option key={c.value} value={c.value}>
                        {c.label}
                      </option>
                    ))}
                  </select>
                  <p className="mt-1 text-xs text-muted-foreground">{currentChannelMeta.hint}</p>
                </div>
                <div className="flex items-end">
                  <label className="inline-flex items-center gap-2 text-sm">
                    <input
                      type="checkbox"
                      checked={form.is_active}
                      onChange={(e) => setForm((f) => ({ ...f, is_active: e.target.checked }))}
                      className="h-4 w-4 rounded border"
                    />
                    مفعّل
                  </label>
                </div>
              </div>

              {(form.channel === "email" ||
                form.channel === "in_app" ||
                form.channel === "web_push") && (
                <div className="mt-3">
                  <label className="mb-1 block text-sm font-medium">
                    العنوان {form.channel === "email" ? "(موضوع الرسالة)" : ""}
                  </label>
                  <input
                    value={form.title}
                    onChange={(e) => setForm((f) => ({ ...f, title: e.target.value }))}
                    placeholder="تذكير بموعد {{patient_name}}"
                    className="w-full rounded-md border px-3 py-2 text-sm"
                    maxLength={200}
                  />
                </div>
              )}

              <div className="mt-3">
                <div className="mb-1 flex items-center justify-between gap-2">
                  <label className="text-sm font-medium">نص الرسالة</label>
                  <span
                    className={`text-xs ${
                      form.channel === "sms" && form.body.length > 160
                        ? "text-amber-700"
                        : "text-muted-foreground"
                    }`}
                  >
                    {form.body.length}
                    {form.channel === "sms" ? " / 160 حرف" : " حرف"}
                  </span>
                </div>
                <textarea
                  id="tpl-body"
                  value={form.body}
                  onChange={(e) => setForm((f) => ({ ...f, body: e.target.value }))}
                  rows={7}
                  placeholder={
                    "مرحبًا {{patient_name}}، تذكير بموعدك مع {{doctor_name}} في {{branch_name}} يوم {{appointment_date}} الساعة {{appointment_time}}."
                  }
                  className="w-full rounded-md border p-3 text-sm leading-6"
                  maxLength={4000}
                />
                {errors.body && <p className="mt-1 text-xs text-rose-600">{errors.body}</p>}
              </div>

              {/* Variable chips */}
              <div className="mt-3 rounded-lg border bg-slate-50 p-3">
                <div className="mb-2 flex items-center gap-1 text-xs font-medium text-slate-700">
                  <Sparkles className="h-3.5 w-3.5" /> اضغط لإدراج متغيّر:
                </div>
                <div className="flex flex-wrap gap-1.5">
                  {TEMPLATE_VARIABLES.map((v) => (
                    <button
                      key={v.key}
                      type="button"
                      onClick={() => insertVariable(v.key)}
                      className="rounded-full border bg-white px-2.5 py-1 text-xs hover:border-primary hover:text-primary"
                      title={v.sample}
                    >
                      <span>{v.label}</span>
                      <code className="ms-1 text-[10px] text-muted-foreground" dir="ltr">
                        {`{{${v.key}}}`}
                      </code>
                    </button>
                  ))}
                </div>
              </div>

              <div className="mt-3">
                <label className="mb-1 block text-sm font-medium">
                  ملاحظات <span className="text-muted-foreground">(اختياري)</span>
                </label>
                <input
                  value={form.description}
                  onChange={(e) => setForm((f) => ({ ...f, description: e.target.value }))}
                  placeholder="متى يُستخدم هذا القالب؟"
                  className="w-full rounded-md border px-3 py-2 text-sm"
                  maxLength={500}
                />
              </div>

              <div className="mt-4 flex items-center justify-between gap-2">
                <div>
                  {form.id && (
                    <button
                      type="button"
                      onClick={() => {
                        if (confirm("حذف هذا القالب نهائيًا؟")) remove.mutate(form.id!);
                      }}
                      className="inline-flex items-center gap-1 rounded-md border border-rose-300 px-3 py-2 text-sm text-rose-700 hover:bg-rose-50"
                      disabled={remove.isPending}
                    >
                      <Trash2 className="h-4 w-4" /> حذف
                    </button>
                  )}
                </div>
                <div className="flex items-center gap-2">
                  <button
                    type="button"
                    onClick={() => {
                      setForm(EMPTY);
                      setErrors({});
                    }}
                    className="rounded-md border px-3 py-2 text-sm hover:bg-slate-50"
                  >
                    إلغاء
                  </button>
                  <button
                    type="submit"
                    disabled={save.isPending}
                    className="inline-flex items-center gap-1 rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground shadow-sm hover:opacity-95 disabled:opacity-60"
                  >
                    <Save className="h-4 w-4" />
                    {save.isPending ? "جاري الحفظ…" : form.id ? "حفظ التعديلات" : "حفظ القالب"}
                  </button>
                </div>
              </div>
            </form>

            {/* ---------- Live preview ---------- */}
            <div className="mt-4 rounded-xl border bg-white p-4 shadow-sm">
              <div className="mb-3 flex items-center justify-between gap-2">
                <div className="inline-flex items-center gap-2 text-sm font-medium">
                  <Eye className="h-4 w-4" /> معاينة الرسالة
                </div>
                <span
                  className={`inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-xs ${currentChannelMeta.color}`}
                >
                  <currentChannelMeta.Icon className="h-3.5 w-3.5" /> {currentChannelMeta.label}
                </span>
              </div>

              <PreviewCard channel={form.channel} title={previewTitle} body={previewBody} />

              <details className="mt-3 rounded-md border bg-slate-50 p-2 text-xs">
                <summary className="cursor-pointer text-slate-700">
                  القيم التجريبية المستخدمة في المعاينة
                </summary>
                <div className="mt-2 grid grid-cols-1 gap-1 md:grid-cols-2">
                  {TEMPLATE_VARIABLES.map((v) => (
                    <div
                      key={v.key}
                      className="flex items-center justify-between rounded border bg-white px-2 py-1"
                    >
                      <span className="text-slate-700">{v.label}</span>
                      <code className="text-slate-500" dir="ltr">
                        {v.sample}
                      </code>
                    </div>
                  ))}
                </div>
              </details>
            </div>
          </section>
        </div>
      </div>
    </div>
  );
}

function PreviewCard({
  channel,
  title,
  body,
}: {
  channel: MessageChannel;
  title: string;
  body: string;
}) {
  const displayBody = body || "…";
  if (channel === "sms" || channel === "whatsapp") {
    const bubble =
      channel === "whatsapp" ? "bg-emerald-50 border-emerald-200" : "bg-teal-50 border-teal-200";
    return (
      <div className="rounded-2xl border bg-slate-50 p-4">
        <div
          className={`max-w-md whitespace-pre-wrap rounded-2xl border p-3 text-sm shadow-sm ${bubble}`}
        >
          {displayBody}
        </div>
        <div className="mt-2 text-[11px] text-muted-foreground">
          {channel === "sms" ? "معاينة رسالة SMS" : "معاينة رسالة WhatsApp"}
        </div>
      </div>
    );
  }
  if (channel === "email") {
    return (
      <div className="overflow-hidden rounded-lg border">
        <div className="border-b bg-slate-50 px-4 py-2 text-sm">
          <div className="font-medium">{title || "(بدون عنوان)"}</div>
          <div className="text-xs text-muted-foreground">من: مجمع باعشن الطبي</div>
        </div>
        <div className="whitespace-pre-wrap p-4 text-sm leading-7">{displayBody}</div>
      </div>
    );
  }
  // in_app + web_push
  return (
    <div className="max-w-md rounded-xl border bg-white p-3 shadow">
      <div className="flex items-start gap-3">
        <div className="mt-1 h-8 w-8 shrink-0 rounded-full bg-primary/10 grid place-items-center">
          <Bell className="h-4 w-4 text-primary" />
        </div>
        <div className="min-w-0 flex-1">
          <div className="truncate text-sm font-semibold">{title || "إشعار"}</div>
          <div className="whitespace-pre-wrap text-sm text-slate-700">{displayBody}</div>
          <div className="mt-1 text-[11px] text-muted-foreground">
            {channel === "web_push" ? "إشعار Push" : "إشعار داخل التطبيق"}
          </div>
        </div>
      </div>
    </div>
  );
}
