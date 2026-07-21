import { useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { Loader2, Plus, X, FileText, Wrench } from "lucide-react";
import {
  listResources,
  listUserPermissions,
  grantPermission,
  revokePermission,
} from "@/lib/owner/permissions.functions";

type Kind = "service" | "page";
type Perm = "view" | "edit" | "manage";

const PERM_LABELS: Record<Perm, string> = {
  view: "عرض",
  edit: "تعديل",
  manage: "إدارة كاملة",
};

export function UserPermissionsPanel({ userId }: { userId: string }) {
  const qc = useQueryClient();
  const [kind, setKind] = useState<Kind>("service");
  const [resourceId, setResourceId] = useState<string>("");
  const [perm, setPerm] = useState<Perm>("edit");

  const resourcesQ = useQuery({
    queryKey: ["owner-resources"],
    queryFn: () => listResources(),
    staleTime: 60_000,
  });
  const permsQ = useQuery({
    queryKey: ["owner-perms", userId],
    queryFn: () => listUserPermissions({ data: { user_id: userId } }),
  });

  const invalidate = () => qc.invalidateQueries({ queryKey: ["owner-perms", userId] });

  const mGrant = useMutation({
    mutationFn: () =>
      grantPermission({
        data: { user_id: userId, resource_kind: kind, resource_id: resourceId, permission: perm },
      }),
    onSuccess: () => { toast.success("تم منح الصلاحية"); setResourceId(""); invalidate(); },
    onError: (e: Error) => toast.error(e.message),
  });
  const mRevoke = useMutation({
    mutationFn: (id: string) => revokePermission({ data: { id } }),
    onSuccess: () => { toast.success("تمت الإزالة"); invalidate(); },
    onError: (e: Error) => toast.error(e.message),
  });

  const options = useMemo(() => {
    if (!resourcesQ.data) return [];
    return kind === "service" ? resourcesQ.data.services : resourcesQ.data.pages;
  }, [kind, resourcesQ.data]);

  const labelFor = (k: Kind, id: string) => {
    const list = k === "service" ? resourcesQ.data?.services : resourcesQ.data?.pages;
    return list?.find((r) => r.id === id)?.label ?? id.slice(0, 8);
  };

  return (
    <div className="border border-slate-200 rounded-lg bg-white p-3 space-y-3">
      <div className="text-xs font-semibold text-slate-700">
        الوصول المرن (حسب الخدمة أو الصفحة)
      </div>

      {permsQ.isLoading ? (
        <Loader2 className="h-4 w-4 animate-spin text-slate-400" />
      ) : (permsQ.data?.rows ?? []).length === 0 ? (
        <div className="text-[11px] text-slate-400">لا صلاحيات مخصصة بعد.</div>
      ) : (
        <ul className="space-y-1.5">
          {permsQ.data!.rows.map((r: any) => (
            <li
              key={r.id}
              className="flex items-center justify-between gap-2 px-2 py-1.5 rounded bg-slate-50 border border-slate-100 text-[11px]"
            >
              <span className="flex items-center gap-1.5 min-w-0">
                {r.resource_kind === "service" ? (
                  <Wrench className="h-3 w-3 text-blue-500 shrink-0" />
                ) : (
                  <FileText className="h-3 w-3 text-emerald-500 shrink-0" />
                )}
                <span className="truncate text-slate-800">{labelFor(r.resource_kind, r.resource_id)}</span>
                <span className="px-1.5 py-0.5 rounded bg-white border border-slate-200 text-slate-600">
                  {PERM_LABELS[r.permission as Perm]}
                </span>
              </span>
              <button
                onClick={() => mRevoke.mutate(r.id)}
                disabled={mRevoke.isPending}
                className="p-1 rounded hover:bg-red-50 text-red-500"
                aria-label="إزالة الصلاحية"
              >
                <X className="h-3 w-3" />
              </button>
            </li>
          ))}
        </ul>
      )}

      <div className="grid gap-2 sm:grid-cols-[110px_1fr_120px_auto] pt-2 border-t border-slate-100">
        <select
          value={kind}
          onChange={(e) => { setKind(e.target.value as Kind); setResourceId(""); }}
          className="px-2 py-1.5 border border-slate-300 rounded text-[11px] bg-white"
        >
          <option value="service">خدمة</option>
          <option value="page">صفحة</option>
        </select>
        <select
          value={resourceId}
          onChange={(e) => setResourceId(e.target.value)}
          className="px-2 py-1.5 border border-slate-300 rounded text-[11px] bg-white min-w-0"
        >
          <option value="">— اختر {kind === "service" ? "خدمة" : "صفحة"} —</option>
          {options.map((o) => (
            <option key={o.id} value={o.id}>{o.label}</option>
          ))}
        </select>
        <select
          value={perm}
          onChange={(e) => setPerm(e.target.value as Perm)}
          className="px-2 py-1.5 border border-slate-300 rounded text-[11px] bg-white"
        >
          <option value="view">عرض</option>
          <option value="edit">تعديل</option>
          <option value="manage">إدارة كاملة</option>
        </select>
        <button
          onClick={() => mGrant.mutate()}
          disabled={!resourceId || mGrant.isPending}
          className="px-3 py-1.5 rounded bg-slate-900 text-white text-[11px] flex items-center gap-1 disabled:opacity-40"
        >
          <Plus className="h-3 w-3" /> منح
        </button>
      </div>
    </div>
  );
}
