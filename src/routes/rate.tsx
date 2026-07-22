import { createFileRoute } from "@tanstack/react-router";
import { useState, useMemo, useEffect } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { Star, Send, CheckCircle2, Building2, Stethoscope } from "lucide-react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { z } from "zod";
import { bmcOgImageMeta } from "@/lib/og-meta";

const searchSchema = z.object({
  branch: z.string().uuid().optional(),
  doctor: z.string().uuid().optional(),
  appointment: z.string().optional(),
});

export const Route = createFileRoute("/rate")({
  validateSearch: (s) => searchSchema.parse(s),
  head: () => ({
    meta: [
      ...bmcOgImageMeta(),
      { title: "قيّم تجربتك | مجمع باعشن الطبي" },
      { name: "description", content: "شاركنا رأيك في زيارتك — تقييمك يساعدنا على تحسين خدماتنا." },
      { name: "robots", content: "index, follow" },
    ],
  }),
  component: RatePage,
});

type Branch = { id: string; name_ar: string; name_en: string | null };
type Doctor = {
  id: string;
  name_ar: string;
  name_en: string | null;
  branch_id: string | null;
  specialty_name_ar: string | null;
};

function RatePage() {
  const search = Route.useSearch();
  const [branchId, setBranchId] = useState<string | null>(search.branch ?? null);
  const [doctorId, setDoctorId] = useState<string | null>(search.doctor ?? null);
  const [rating, setRating] = useState<number>(0);
  const [hover, setHover] = useState<number>(0);
  const [comment, setComment] = useState("");
  const [name, setName] = useState("");
  const [phone, setPhone] = useState("");
  const [submitted, setSubmitted] = useState(false);

  const branchesQ = useQuery({
    queryKey: ["rate-branches"],
    queryFn: async () => {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const { data, error } = await (supabase.rpc as any)("list_public_branches_for_rating");
      if (error) throw new Error(error.message);
      return (data ?? []) as Branch[];
    },
    staleTime: 5 * 60_000,
  });

  const doctorsQ = useQuery({
    queryKey: ["rate-doctors", branchId],
    queryFn: async () => {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const { data, error } = await (supabase.rpc as any)("list_public_doctors_for_rating", {
        _branch_id: branchId,
      });
      if (error) throw new Error(error.message);
      return (data ?? []) as Doctor[];
    },
    staleTime: 5 * 60_000,
  });

  // Auto-select branch if a doctor is preselected but branch isn't
  useEffect(() => {
    if (doctorId && !branchId && doctorsQ.data) {
      const d = doctorsQ.data.find((x) => x.id === doctorId);
      if (d?.branch_id) setBranchId(d.branch_id);
    }
  }, [doctorId, branchId, doctorsQ.data]);

  const selectedBranch = useMemo(
    () => (branchesQ.data ?? []).find((b) => b.id === branchId),
    [branchesQ.data, branchId],
  );
  const selectedDoctor = useMemo(
    () => (doctorsQ.data ?? []).find((d) => d.id === doctorId),
    [doctorsQ.data, doctorId],
  );

  const submitM = useMutation({
    mutationFn: async () => {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const { data, error } = await (supabase.rpc as any)("submit_public_rating", {
        _branch_id: branchId,
        _doctor_id: doctorId,
        _rating: rating,
        _comment: comment || null,
        _patient_name: name || null,
        _patient_phone: phone || null,
        _appointment_ref: search.appointment || null,
      });
      if (error) throw new Error(error.message);
      return data;
    },
    onSuccess: () => {
      setSubmitted(true);
      toast.success("تم إرسال تقييمك — شكرًا لك!");
    },
    onError: (e: Error) => toast.error(e.message || "فشل الإرسال"),
  });

  const canSubmit = rating > 0 && (branchId || doctorId) && !submitM.isPending;

  if (submitted) {
    return (
      <div
        className="min-h-screen bg-gradient-to-b from-primary/5 to-background flex items-center justify-center p-4"
        dir="rtl"
      >
        <div className="max-w-md w-full rounded-2xl border border-border bg-card p-8 text-center shadow-lg">
          <div className="mx-auto mb-4 h-16 w-16 rounded-full bg-emerald-500/10 grid place-items-center">
            <CheckCircle2 className="h-10 w-10 text-emerald-600" />
          </div>
          <h1 className="text-2xl font-bold mb-2">شكرًا لك!</h1>
          <p className="text-muted-foreground mb-6">
            تم استلام تقييمك بنجاح، وسيساعدنا في تحسين خدماتنا.
          </p>
          <button
            onClick={() => {
              setSubmitted(false);
              setRating(0);
              setComment("");
              setName("");
              setPhone("");
            }}
            className="rounded-md border border-input bg-background px-4 py-2 text-sm hover:bg-muted"
          >
            إرسال تقييم آخر
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gradient-to-b from-primary/5 to-background py-8 px-4" dir="rtl">
      <div className="mx-auto max-w-xl">
        <div className="mb-6 text-center">
          <h1 className="text-3xl font-bold">قيّم تجربتك</h1>
          <p className="mt-2 text-muted-foreground">مجمع باعشن الطبي — رأيك يهمنا</p>
        </div>

        <div className="rounded-2xl border border-border bg-card p-6 shadow-sm space-y-6">
          {/* Branch selector */}
          <div>
            <label className="text-sm font-semibold mb-2 flex items-center gap-2">
              <Building2 className="h-4 w-4 text-primary" />
              الفرع
            </label>
            <select
              value={branchId ?? ""}
              onChange={(e) => {
                setBranchId(e.target.value || null);
                setDoctorId(null);
              }}
              className="w-full rounded-lg border border-input bg-background px-3 py-2.5"
            >
              <option value="">اختر الفرع…</option>
              {(branchesQ.data ?? []).map((b) => (
                <option key={b.id} value={b.id}>
                  {b.name_ar}
                </option>
              ))}
            </select>
          </div>

          {/* Doctor selector (optional) */}
          <div>
            <label className="text-sm font-semibold mb-2 flex items-center gap-2">
              <Stethoscope className="h-4 w-4 text-primary" />
              الطبيب <span className="text-xs font-normal text-muted-foreground">(اختياري)</span>
            </label>
            <select
              value={doctorId ?? ""}
              onChange={(e) => setDoctorId(e.target.value || null)}
              className="w-full rounded-lg border border-input bg-background px-3 py-2.5"
            >
              <option value="">لا أخصص طبيبًا</option>
              {(doctorsQ.data ?? []).map((d) => (
                <option key={d.id} value={d.id}>
                  {d.name_ar}
                  {d.specialty_name_ar ? ` — ${d.specialty_name_ar}` : ""}
                </option>
              ))}
            </select>
          </div>

          {/* Stars */}
          <div>
            <label className="text-sm font-semibold mb-3 block">تقييمك</label>
            <div className="flex items-center justify-center gap-2" dir="ltr">
              {[1, 2, 3, 4, 5].map((n) => {
                const active = (hover || rating) >= n;
                return (
                  <button
                    key={n}
                    type="button"
                    onClick={() => setRating(n)}
                    onMouseEnter={() => setHover(n)}
                    onMouseLeave={() => setHover(0)}
                    className="p-1 transition-transform hover:scale-110"
                    aria-label={`${n} نجوم`}
                  >
                    <Star
                      className={`h-10 w-10 transition-colors ${
                        active ? "fill-amber-400 text-amber-400" : "text-muted-foreground/40"
                      }`}
                    />
                  </button>
                );
              })}
            </div>
            {rating > 0 && (
              <p className="text-center text-sm text-muted-foreground mt-2">
                {["", "سيئ جدًا", "سيئ", "مقبول", "جيد", "ممتاز"][rating]}
              </p>
            )}
          </div>

          {/* Comment */}
          <div>
            <label className="text-sm font-semibold mb-2 block">
              تعليقك <span className="text-xs font-normal text-muted-foreground">(اختياري)</span>
            </label>
            <textarea
              value={comment}
              onChange={(e) => setComment(e.target.value.slice(0, 1000))}
              rows={4}
              placeholder="أخبرنا عن تجربتك…"
              className="w-full rounded-lg border border-input bg-background px-3 py-2 resize-none"
            />
            <p className="text-xs text-muted-foreground mt-1 text-right">{comment.length}/1000</p>
          </div>

          {/* Optional identity */}
          <details className="text-sm">
            <summary className="cursor-pointer text-muted-foreground hover:text-foreground">
              معلومات اختيارية (الاسم والجوال)
            </summary>
            <div className="mt-3 space-y-3">
              <input
                type="text"
                value={name}
                onChange={(e) => setName(e.target.value.slice(0, 100))}
                placeholder="الاسم"
                className="w-full rounded-lg border border-input bg-background px-3 py-2"
              />
              <input
                type="tel"
                value={phone}
                onChange={(e) => setPhone(e.target.value.slice(0, 20))}
                placeholder="رقم الجوال"
                className="w-full rounded-lg border border-input bg-background px-3 py-2"
                dir="ltr"
              />
            </div>
          </details>

          <button
            onClick={() => submitM.mutate()}
            disabled={!canSubmit}
            className="w-full inline-flex items-center justify-center gap-2 rounded-lg bg-primary text-primary-foreground px-4 py-3 font-semibold hover:opacity-90 disabled:opacity-40 disabled:cursor-not-allowed transition"
          >
            <Send className="h-4 w-4" />
            {submitM.isPending ? "جارٍ الإرسال…" : "إرسال التقييم"}
          </button>

          {(selectedBranch || selectedDoctor) && (
            <p className="text-xs text-center text-muted-foreground">
              تقييم لـ:{" "}
              {selectedDoctor && <span className="font-medium">{selectedDoctor.name_ar}</span>}
              {selectedDoctor && selectedBranch && " · "}
              {selectedBranch && <span>{selectedBranch.name_ar}</span>}
            </p>
          )}
        </div>
      </div>
    </div>
  );
}
