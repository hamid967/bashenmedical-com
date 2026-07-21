import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { Loader2, ShieldCheck, ShieldAlert, KeyRound, Trash2 } from "lucide-react";

export const Route = createFileRoute("/_authenticated/owner/security")({
  head: () => ({
    meta: [
      { title: "الأمان والتحقق متعدد العوامل | Site Builder" },
      { name: "robots", content: "noindex,nofollow" },
    ],
  }),
  component: SecurityPage,
});

type Factor = { id: string; friendly_name: string | null; status: string; factor_type: string };

function SecurityPage() {
  const navigate = useNavigate();
  const [loading, setLoading] = useState(true);
  const [aal, setAal] = useState<string | null>(null);
  const [factors, setFactors] = useState<Factor[]>([]);

  // enroll state
  const [enrolling, setEnrolling] = useState(false);
  const [enroll, setEnroll] = useState<{ id: string; qr: string; secret: string } | null>(null);
  const [enrollCode, setEnrollCode] = useState("");
  const [enrollBusy, setEnrollBusy] = useState(false);

  // challenge state
  const [challengeCode, setChallengeCode] = useState("");
  const [challengeBusy, setChallengeBusy] = useState(false);

  const refresh = async () => {
    setLoading(true);
    try {
      const [aalRes, listRes] = await Promise.all([
        supabase.auth.mfa.getAuthenticatorAssuranceLevel(),
        supabase.auth.mfa.listFactors(),
      ]);
      setAal(aalRes.data?.currentLevel ?? null);
      const totp = (listRes.data?.totp ?? []) as Factor[];
      setFactors(totp);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    void refresh();
  }, []);

  const verifiedFactors = factors.filter((f) => f.status === "verified");
  const isAAL2 = aal === "aal2";

  const startEnroll = async () => {
    setEnrollBusy(true);
    try {
      const { data, error } = await supabase.auth.mfa.enroll({
        factorType: "totp",
        friendlyName: `TOTP ${new Date().toLocaleDateString("ar")}`,
      });
      if (error) throw error;
      setEnroll({ id: data.id, qr: data.totp.qr_code, secret: data.totp.secret });
      setEnrolling(true);
    } catch (e: any) {
      toast.error(e.message || "تعذّر بدء التسجيل");
    } finally {
      setEnrollBusy(false);
    }
  };

  const confirmEnroll = async () => {
    if (!enroll || enrollCode.length < 6) return;
    setEnrollBusy(true);
    try {
      const { data: ch, error: chErr } = await supabase.auth.mfa.challenge({ factorId: enroll.id });
      if (chErr) throw chErr;
      const { error: vErr } = await supabase.auth.mfa.verify({
        factorId: enroll.id,
        challengeId: ch.id,
        code: enrollCode.trim(),
      });
      if (vErr) throw vErr;
      toast.success("تم تفعيل TOTP بنجاح");
      setEnroll(null);
      setEnrolling(false);
      setEnrollCode("");
      await refresh();
    } catch (e: any) {
      toast.error(e.message || "الرمز غير صحيح");
    } finally {
      setEnrollBusy(false);
    }
  };

  const cancelEnroll = async () => {
    if (enroll) {
      try {
        await supabase.auth.mfa.unenroll({ factorId: enroll.id });
      } catch {}
    }
    setEnroll(null);
    setEnrolling(false);
    setEnrollCode("");
  };

  const challenge = async () => {
    const factor = verifiedFactors[0];
    if (!factor || challengeCode.length < 6) return;
    setChallengeBusy(true);
    try {
      const { data: ch, error: chErr } = await supabase.auth.mfa.challenge({ factorId: factor.id });
      if (chErr) throw chErr;
      const { error: vErr } = await supabase.auth.mfa.verify({
        factorId: factor.id,
        challengeId: ch.id,
        code: challengeCode.trim(),
      });
      if (vErr) throw vErr;
      toast.success("تم التحقق — الجلسة الآن AAL2");
      setChallengeCode("");
      await refresh();
      navigate({ to: "/owner" });
    } catch (e: any) {
      toast.error(e.message || "الرمز غير صحيح");
    } finally {
      setChallengeBusy(false);
    }
  };

  const removeFactor = async (id: string) => {
    if (!window.confirm("إزالة عامل TOTP هذا؟")) return;
    try {
      const { error } = await supabase.auth.mfa.unenroll({ factorId: id });
      if (error) throw error;
      toast.success("تم الحذف");
      await refresh();
    } catch (e: any) {
      toast.error(e.message);
    }
  };

  return (
    <div className="p-6 max-w-3xl mx-auto" dir="rtl">
      <div className="mb-6">
        <h1 className="text-2xl font-bold text-slate-900">الأمان والتحقق متعدد العوامل</h1>
        <p className="text-sm text-slate-600 mt-1">
          حسابات <code>super_admin</code> و<code>owner</code> تتطلب تفعيل TOTP لإتمام أي عملية إدارية.
        </p>
      </div>

      {loading ? (
        <div className="p-8 flex justify-center"><Loader2 className="h-6 w-6 animate-spin text-slate-400" /></div>
      ) : (
        <>
          <div
            className={`rounded-xl border p-4 mb-4 flex items-center gap-3 ${
              isAAL2
                ? "bg-emerald-50 border-emerald-200 text-emerald-800"
                : "bg-amber-50 border-amber-200 text-amber-800"
            }`}
          >
            {isAAL2 ? <ShieldCheck className="h-5 w-5" /> : <ShieldAlert className="h-5 w-5" />}
            <div className="text-sm">
              <div className="font-semibold">
                {isAAL2 ? "جلستك محمية بـ MFA (AAL2)" : "جلستك بمستوى AAL1 — التحقق مطلوب"}
              </div>
              <div className="text-xs opacity-80">
                {isAAL2
                  ? "يمكنك استخدام كل صفحات لوحة المالك."
                  : "أدخل رمز TOTP أدناه لرفع الجلسة، أو فعّل TOTP إذا لم تفعله بعد."}
              </div>
            </div>
          </div>

          {verifiedFactors.length > 0 && !isAAL2 && (
            <div className="bg-white rounded-xl border border-slate-200 p-5 mb-4">
              <div className="text-sm font-semibold text-slate-800 mb-3 flex items-center gap-2">
                <KeyRound className="h-4 w-4" /> إدخال رمز التحقق
              </div>
              <div className="flex gap-2">
                <input
                  value={challengeCode}
                  onChange={(e) => setChallengeCode(e.target.value.replace(/\D/g, "").slice(0, 6))}
                  placeholder="000000"
                  inputMode="numeric"
                  className="flex-1 px-3 py-2 border border-slate-300 rounded-lg text-lg tracking-widest text-center font-mono"
                />
                <button
                  disabled={challengeBusy || challengeCode.length < 6}
                  onClick={challenge}
                  className="px-4 py-2 rounded-lg bg-blue-600 text-white text-sm font-semibold disabled:opacity-50"
                >
                  {challengeBusy ? "…" : "تحقق"}
                </button>
              </div>
            </div>
          )}

          <div className="bg-white rounded-xl border border-slate-200 p-5">
            <div className="flex items-center justify-between mb-3">
              <div className="text-sm font-semibold text-slate-800">عوامل TOTP المسجلة</div>
              {!enrolling && (
                <button
                  onClick={startEnroll}
                  disabled={enrollBusy}
                  className="px-3 py-1.5 rounded-lg bg-slate-900 text-white text-xs font-semibold disabled:opacity-50"
                >
                  إضافة عامل جديد
                </button>
              )}
            </div>

            {factors.length === 0 && !enrolling && (
              <div className="text-xs text-slate-500 py-6 text-center border border-dashed rounded-lg">
                لا يوجد أي عامل مسجّل. أضف واحدًا لتفعيل MFA.
              </div>
            )}

            {factors.length > 0 && (
              <ul className="divide-y divide-slate-100">
                {factors.map((f) => (
                  <li key={f.id} className="py-3 flex items-center justify-between">
                    <div>
                      <div className="text-sm font-medium text-slate-800">
                        {f.friendly_name || "TOTP"}
                      </div>
                      <div className="text-[11px] text-slate-500">
                        {f.status === "verified" ? "مُفعّل" : "غير مُكتمل"} · {f.id.slice(0, 8)}
                      </div>
                    </div>
                    <button
                      onClick={() => removeFactor(f.id)}
                      className="text-xs text-red-600 hover:underline inline-flex items-center gap-1"
                    >
                      <Trash2 className="h-3.5 w-3.5" /> إزالة
                    </button>
                  </li>
                ))}
              </ul>
            )}

            {enrolling && enroll && (
              <div className="mt-4 p-4 rounded-lg bg-slate-50 border border-slate-200 space-y-3">
                <div className="text-sm font-semibold text-slate-800">امسح QR في تطبيق المصادقة</div>
                <div className="flex flex-col md:flex-row gap-4 items-center">
                  <img
                    src={enroll.qr}
                    alt="TOTP QR"
                    className="w-40 h-40 bg-white p-2 rounded border border-slate-200"
                  />
                  <div className="flex-1 space-y-2 text-xs">
                    <div className="text-slate-600">أو أدخل السر يدويًا:</div>
                    <code className="block bg-white border border-slate-200 rounded p-2 font-mono break-all">
                      {enroll.secret}
                    </code>
                    <div className="text-slate-500">
                      استخدم Google Authenticator أو 1Password أو Authy.
                    </div>
                  </div>
                </div>
                <div>
                  <label className="text-xs text-slate-600 block mb-1">رمز التحقق (6 أرقام)</label>
                  <input
                    value={enrollCode}
                    onChange={(e) => setEnrollCode(e.target.value.replace(/\D/g, "").slice(0, 6))}
                    placeholder="000000"
                    inputMode="numeric"
                    className="w-full px-3 py-2 border border-slate-300 rounded-lg text-lg tracking-widest text-center font-mono"
                  />
                </div>
                <div className="flex gap-2 justify-end">
                  <button
                    onClick={cancelEnroll}
                    className="px-3 py-1.5 rounded border border-slate-300 text-xs"
                  >
                    إلغاء
                  </button>
                  <button
                    disabled={enrollBusy || enrollCode.length < 6}
                    onClick={confirmEnroll}
                    className="px-4 py-1.5 rounded bg-emerald-600 text-white text-xs font-semibold disabled:opacity-50"
                  >
                    {enrollBusy ? "…" : "تفعيل"}
                  </button>
                </div>
              </div>
            )}
          </div>
        </>
      )}
    </div>
  );
}
