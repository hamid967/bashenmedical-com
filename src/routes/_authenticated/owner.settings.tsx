import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { getClinicSettings, updateClinicSettings } from "@/lib/owner/settings.functions";
import { Loader2, Save } from "lucide-react";

export const Route = createFileRoute("/_authenticated/owner/settings")({
  head: () => ({
    meta: [
      { title: "إعدادات الموقع | Site Builder" },
      { name: "robots", content: "noindex,nofollow" },
    ],
  }),
  component: SettingsPage,
});

type Form = {
  name_ar: string;
  name_en: string;
  phone: string;
  mobile: string;
  whatsapp: string;
  email: string;
  address_ar: string;
  address_en: string;
};

const empty: Form = {
  name_ar: "", name_en: "", phone: "", mobile: "", whatsapp: "",
  email: "", address_ar: "", address_en: "",
};

function SettingsPage() {
  const qc = useQueryClient();
  const q = useQuery({
    queryKey: ["owner-settings"],
    queryFn: () => getClinicSettings(),
  });
  const [form, setForm] = useState<Form>(empty);

  useEffect(() => {
    if (q.data?.settings) {
      const s = q.data.settings as any;
      setForm({
        name_ar: s.name_ar ?? "",
        name_en: s.name_en ?? "",
        phone: s.phone ?? "",
        mobile: s.mobile ?? "",
        whatsapp: s.whatsapp ?? "",
        email: s.email ?? "",
        address_ar: s.address_ar ?? "",
        address_en: s.address_en ?? "",
      });
    }
  }, [q.data]);

  const m = useMutation({
    mutationFn: () => updateClinicSettings({ data: form }),
    onSuccess: () => {
      toast.success("تم حفظ الإعدادات");
      qc.invalidateQueries({ queryKey: ["owner-settings"] });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  function field<K extends keyof Form>(k: K, label: string, type: string = "text") {
    return (
      <label className="block">
        <span className="text-xs font-semibold text-slate-700">{label}</span>
        <input
          type={type}
          value={form[k]}
          onChange={(e) => setForm((f) => ({ ...f, [k]: e.target.value }))}
          className="mt-1 w-full px-3 py-2 border border-slate-300 rounded-lg text-sm"
        />
      </label>
    );
  }

  return (
    <div className="p-6 max-w-4xl mx-auto" dir="rtl">
      <div className="mb-6">
        <h1 className="text-2xl font-bold text-slate-900">إعدادات الموقع</h1>
        <p className="text-sm text-slate-600 mt-1">اسم المجمع وأرقام التواصل والعنوان.</p>
      </div>

      {q.isLoading && <div className="p-8 flex justify-center"><Loader2 className="h-6 w-6 animate-spin text-slate-400" /></div>}
      {q.error && <div className="p-4 text-sm text-red-600 bg-red-50 rounded">{(q.error as Error).message}</div>}

      {q.data && (
        <form
          onSubmit={(e) => { e.preventDefault(); m.mutate(); }}
          className="bg-white rounded-xl border border-slate-200 p-6 space-y-4"
        >
          <div className="grid gap-4 md:grid-cols-2">
            {field("name_ar", "الاسم بالعربية")}
            {field("name_en", "Name (English)")}
            {field("phone", "الهاتف الرئيسي")}
            {field("mobile", "الجوال")}
            {field("whatsapp", "واتساب")}
            {field("email", "البريد الإلكتروني", "email")}
          </div>
          {field("address_ar", "العنوان بالعربية")}
          {field("address_en", "Address (English)")}

          <div className="pt-4 border-t flex justify-end">
            <button
              type="submit"
              disabled={m.isPending}
              className="inline-flex items-center gap-2 px-4 py-2 rounded-lg bg-blue-600 text-white text-sm font-semibold disabled:opacity-50"
            >
              {m.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}
              حفظ التغييرات
            </button>
          </div>
        </form>
      )}
    </div>
  );
}
