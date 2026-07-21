import { createFileRoute } from "@tanstack/react-router";
import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import {
  listAccounts,
  grantRole,
  revokeRole,
  sendPasswordReset,
  setUserPassword,
  setUserBan,
  deleteAccount,
} from "@/lib/owner/accounts.functions";
import { Loader2, Search, Shield, UserX, KeyRound, Mail, Trash2, UserCheck } from "lucide-react";
import { UserPermissionsPanel } from "@/components/owner/UserPermissionsPanel";

export const Route = createFileRoute("/_authenticated/owner/accounts")({
  head: () => ({
    meta: [
      { title: "إدارة الحسابات | Site Builder" },
      { name: "robots", content: "noindex,nofollow" },
    ],
  }),
  component: AccountsPage,
});

function AccountsPage() {
  const qc = useQueryClient();
  const [search, setSearch] = useState("");
  const [status, setStatus] = useState<"all" | "confirmed" | "unconfirmed" | "disabled">("all");
  const [role, setRole] = useState<string>("all");
  const [page, setPage] = useState(1);
  const [expanded, setExpanded] = useState<string | null>(null);

  const q = useQuery({
    queryKey: ["owner-accounts", page, search, status, role],
    queryFn: () =>
      listAccounts({ data: { page, perPage: 50, search, status, role: role as any } }),
  });

  const invalidate = () => qc.invalidateQueries({ queryKey: ["owner-accounts"] });

  const mGrant = useMutation({
    mutationFn: (v: { user_id: string; role: any }) => grantRole({ data: v }),
    onSuccess: () => { toast.success("تم تعيين الدور"); invalidate(); },
    onError: (e: Error) => toast.error(e.message),
  });
  const mRevoke = useMutation({
    mutationFn: (v: { user_id: string; role: any }) => revokeRole({ data: v }),
    onSuccess: () => { toast.success("تم إزالة الدور"); invalidate(); },
    onError: (e: Error) => toast.error(e.message),
  });
  const mReset = useMutation({
    mutationFn: (email: string) => sendPasswordReset({ data: { email } }),
    onSuccess: () => toast.success("تم إنشاء رابط إعادة التعيين"),
    onError: (e: Error) => toast.error(e.message),
  });
  const mBan = useMutation({
    mutationFn: (v: { user_id: string; disable: boolean }) => setUserBan({ data: v }),
    onSuccess: (_d, v) => { toast.success(v.disable ? "تم التعطيل" : "تم التفعيل"); invalidate(); },
    onError: (e: Error) => toast.error(e.message),
  });
  const mDelete = useMutation({
    mutationFn: (v: { user_id: string; confirm_email: string }) => deleteAccount({ data: v }),
    onSuccess: () => { toast.success("تم حذف الحساب"); invalidate(); },
    onError: (e: Error) => toast.error(e.message),
  });
  const mSetPwd = useMutation({
    mutationFn: (v: { user_id: string; password: string }) => setUserPassword({ data: v }),
    onSuccess: () => toast.success("تم تعيين كلمة المرور"),
    onError: (e: Error) => toast.error(e.message),
  });

  const roles = q.data?.roles ?? [];
  const hasFilter = search !== "" || status !== "all" || role !== "all";
  const resetFilters = () => {
    setSearch("");
    setStatus("all");
    setRole("all");
    setPage(1);
  };

  return (
    <div className="p-6 max-w-7xl mx-auto" dir="rtl">
      <div className="mb-6">
        <h1 className="text-2xl font-bold text-slate-900">إدارة الحسابات</h1>
        <p className="text-sm text-slate-600 mt-1">
          حصريًا لدور <code>super_admin</code>. كل إجراء يُسجَّل في سجل النشاط.
        </p>
      </div>

      <div className="bg-white rounded-xl shadow-sm border border-slate-200 p-4 mb-4 space-y-3">
        <div className="flex flex-wrap gap-3 items-center">
          <div className="relative flex-1 min-w-[240px]">
            <Search className="absolute right-3 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-400" />
            <input
              value={search}
              onChange={(e) => { setSearch(e.target.value); setPage(1); }}
              placeholder="بحث بالاسم أو البريد أو الجوال أو المعرف…"
              className="w-full pr-10 pl-3 py-2 border border-slate-300 rounded-lg text-sm"
            />
          </div>
          <select
            value={status}
            onChange={(e) => { setStatus(e.target.value as any); setPage(1); }}
            className="px-3 py-2 border border-slate-300 rounded-lg text-sm bg-white"
            aria-label="تصفية بالحالة"
          >
            <option value="all">كل الحالات</option>
            <option value="confirmed">مؤكد</option>
            <option value="unconfirmed">غير مؤكد</option>
            <option value="disabled">معطّل</option>
          </select>
          <select
            value={role}
            onChange={(e) => { setRole(e.target.value); setPage(1); }}
            className="px-3 py-2 border border-slate-300 rounded-lg text-sm bg-white"
            aria-label="تصفية بالدور"
          >
            <option value="all">كل الأدوار</option>
            <option value="none">بدون دور</option>
            {roles.map((r) => (
              <option key={r} value={r}>{r}</option>
            ))}
          </select>
          {hasFilter && (
            <button
              onClick={resetFilters}
              className="px-3 py-2 text-xs text-slate-600 hover:text-slate-900 border border-slate-200 rounded-lg"
            >
              مسح الفلاتر
            </button>
          )}
        </div>
        <div className="text-xs text-slate-500">
          {q.data
            ? hasFilter
              ? `${q.data.users.length} معروض من ${q.data.totalFiltered} مطابق (إجمالي ${q.data.total})`
              : `${q.data.users.length} من ${q.data.total}`
            : "…"}
        </div>
      </div>

      <div className="bg-white rounded-xl shadow-sm border border-slate-200 overflow-hidden">
        {q.isLoading && (
          <div className="p-8 flex justify-center"><Loader2 className="h-6 w-6 animate-spin text-slate-400" /></div>
        )}
        {q.error && <div className="p-4 text-sm text-red-600">{(q.error as Error).message}</div>}
        {q.data && (
          <table className="w-full text-sm">
            <thead className="bg-slate-50 text-slate-600 text-xs">
              <tr>
                <th className="text-right px-4 py-3">المستخدم</th>
                <th className="text-right px-4 py-3">الأدوار</th>
                <th className="text-right px-4 py-3">الحالة</th>
                <th className="text-right px-4 py-3">آخر دخول</th>
                <th className="text-right px-4 py-3">إجراءات</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {q.data.users.map((u) => {
                const isOpen = expanded === u.id;
                return (
                  <>
                    <tr key={u.id} className="hover:bg-slate-50">
                      <td className="px-4 py-3">
                        <div className="font-medium text-slate-900">{u.full_name || "—"}</div>
                        <div className="text-xs text-slate-500 font-mono">{u.email || u.phone || u.id.slice(0, 8)}</div>
                      </td>
                      <td className="px-4 py-3">
                        <div className="flex flex-wrap gap-1">
                          {u.roles.length === 0 && <span className="text-xs text-slate-400">—</span>}
                          {u.roles.map((r) => (
                            <span key={r} className="inline-flex items-center gap-1 px-2 py-0.5 rounded text-[11px] bg-blue-50 text-blue-700 border border-blue-100">
                              <Shield className="h-3 w-3" />{r}
                            </span>
                          ))}
                        </div>
                      </td>
                      <td className="px-4 py-3">
                        {u.banned_until && new Date(u.banned_until) > new Date() ? (
                          <span className="text-xs text-red-600 font-semibold">معطّل</span>
                        ) : u.confirmed ? (
                          <span className="text-xs text-emerald-600">مؤكد</span>
                        ) : (
                          <span className="text-xs text-amber-600">غير مؤكد</span>
                        )}
                      </td>
                      <td className="px-4 py-3 text-xs text-slate-500">
                        {u.last_sign_in_at ? new Date(u.last_sign_in_at).toLocaleString("ar") : "—"}
                      </td>
                      <td className="px-4 py-3">
                        <button
                          onClick={() => setExpanded(isOpen ? null : u.id)}
                          className="text-xs text-blue-600 hover:underline"
                        >
                          {isOpen ? "إغلاق" : "إدارة"}
                        </button>
                      </td>
                    </tr>
                    {isOpen && (
                      <tr className="bg-slate-50/60">
                        <td colSpan={5} className="px-4 py-4">
                          <div className="grid gap-4 md:grid-cols-2">
                            <div>
                              <div className="text-xs font-semibold text-slate-700 mb-2">الأدوار</div>
                              <div className="flex flex-wrap gap-1.5">
                                {roles.map((r) => {
                                  const has = u.roles.includes(r);
                                  return (
                                    <button
                                      key={r}
                                      disabled={mGrant.isPending || mRevoke.isPending}
                                      onClick={() =>
                                        has
                                          ? mRevoke.mutate({ user_id: u.id, role: r })
                                          : mGrant.mutate({ user_id: u.id, role: r })
                                      }
                                      className={`px-2.5 py-1 rounded text-[11px] border transition ${
                                        has
                                          ? "bg-blue-600 text-white border-blue-600"
                                          : "bg-white text-slate-600 border-slate-300 hover:border-blue-400"
                                      }`}
                                    >
                                      {r}
                                    </button>
                                  );
                                })}
                              </div>
                            </div>
                            <div className="space-y-2">
                              <div className="text-xs font-semibold text-slate-700 mb-2">إجراءات</div>
                              {u.email && (
                                <button
                                  onClick={() => mReset.mutate(u.email!)}
                                  className="w-full text-right px-3 py-2 rounded border border-slate-200 hover:bg-white text-xs flex items-center gap-2"
                                >
                                  <Mail className="h-3.5 w-3.5" /> إرسال رابط إعادة تعيين كلمة المرور
                                </button>
                              )}
                              <button
                                onClick={() => {
                                  const pwd = window.prompt("كلمة المرور الجديدة (8 حروف على الأقل):");
                                  if (pwd && pwd.length >= 8) mSetPwd.mutate({ user_id: u.id, password: pwd });
                                }}
                                className="w-full text-right px-3 py-2 rounded border border-slate-200 hover:bg-white text-xs flex items-center gap-2"
                              >
                                <KeyRound className="h-3.5 w-3.5" /> تعيين كلمة مرور جديدة
                              </button>
                              {u.banned_until && new Date(u.banned_until) > new Date() ? (
                                <button
                                  onClick={() => mBan.mutate({ user_id: u.id, disable: false })}
                                  className="w-full text-right px-3 py-2 rounded border border-emerald-200 text-emerald-700 hover:bg-emerald-50 text-xs flex items-center gap-2"
                                >
                                  <UserCheck className="h-3.5 w-3.5" /> تفعيل الحساب
                                </button>
                              ) : (
                                <button
                                  onClick={() => {
                                    if (window.confirm("تعطيل هذا الحساب؟")) mBan.mutate({ user_id: u.id, disable: true });
                                  }}
                                  className="w-full text-right px-3 py-2 rounded border border-amber-200 text-amber-700 hover:bg-amber-50 text-xs flex items-center gap-2"
                                >
                                  <UserX className="h-3.5 w-3.5" /> تعطيل الحساب
                                </button>
                              )}
                              <button
                                onClick={() => {
                                  const email = window.prompt(`للتأكيد، أدخل بريد المستخدم (${u.email ?? "—"}):`);
                                  if (email) mDelete.mutate({ user_id: u.id, confirm_email: email });
                                }}
                                className="w-full text-right px-3 py-2 rounded border border-red-200 text-red-700 hover:bg-red-50 text-xs flex items-center gap-2"
                              >
                                <Trash2 className="h-3.5 w-3.5" /> حذف الحساب نهائيًا
                              </button>
                            </div>
                          </div>
                        </td>
                      </tr>
                    )}
                  </>
                );
              })}
            </tbody>
          </table>
        )}
      </div>

      <div className="flex justify-between items-center mt-4 text-sm">
        <button
          disabled={page <= 1}
          onClick={() => setPage((p) => Math.max(1, p - 1))}
          className="px-3 py-1.5 rounded border border-slate-300 disabled:opacity-40"
        >السابق</button>
        <span className="text-slate-500 text-xs">صفحة {page}</span>
        <button
          disabled={!q.data || q.data.users.length < q.data.perPage}
          onClick={() => setPage((p) => p + 1)}
          className="px-3 py-1.5 rounded border border-slate-300 disabled:opacity-40"
        >التالي</button>
      </div>
    </div>
  );
}
