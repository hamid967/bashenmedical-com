import { createFileRoute, Link } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { useQuery } from "@tanstack/react-query";
import { useMemo, useState } from "react";
import {
  RefreshCw,
  Search,
  X,
  ChevronLeft,
  ChevronRight,
  AlertTriangle,
  Inbox,
  Users,
} from "lucide-react";
import { listAdminUsers } from "@/lib/admin/users.functions";
import { useActiveBranch } from "@/lib/active-branch";

type UsersSearch = {
  q?: string;
  role?: string;
  page?: number;
};

const PAGE_SIZE = 50;

const ROLE_LABEL: Record<string, string> = {
  admin: "مسؤول",
  super_admin: "مسؤول أعلى",
  reception: "استقبال",
  pharmacy: "صيدلية",
  doctor: "طبيب",
  patient: "مريض",
  center_admin: "مسؤول مركز",
  branch_manager: "مدير فرع",
  reports_officer: "موظف تقارير",
  billing_officer: "موظف فوترة",
  insurance_officer: "موظف تأمين",
  support_agent: "دعم",
  content_manager: "إدارة محتوى",
  auditor: "مدقّق",
};

export const Route = createFileRoute("/_authenticated/admin/users")({
  head: () => ({
    meta: [
      { title: "المستخدمون | لوحة الإدارة" },
      {
        name: "description",
        content: "إدارة حسابات المستخدمين والأدوار مع البحث والحفر إلى تفاصيل كل مستخدم.",
      },
      { name: "robots", content: "noindex" },
    ],
  }),
  validateSearch: (raw: Record<string, unknown>): UsersSearch => ({
    q: typeof raw.q === "string" ? raw.q : undefined,
    role: typeof raw.role === "string" ? raw.role : undefined,
    page: typeof raw.page === "number" ? raw.page : Number(raw.page) || undefined,
  }),
  errorComponent: ({ error, reset }) => (
    <div className="container-app py-16 text-center">
      <AlertTriangle className="mx-auto h-10 w-10 text-destructive" aria-hidden="true" />
      <h2 className="mt-4 text-lg font-semibold">تعذّر تحميل المستخدمين</h2>
      <p className="mt-2 text-sm text-muted-foreground">{error.message}</p>
      <button
        type="button"
        onClick={reset}
        className="mt-4 inline-flex items-center gap-2 rounded-md border px-3 py-1.5 text-sm hover:bg-muted"
      >
        <RefreshCw className="h-4 w-4" /> إعادة المحاولة
      </button>
    </div>
  ),
  component: AdminUsersRoute,
});

function AdminUsersRoute() {
  const search = Route.useSearch();
  const navigate = Route.useNavigate();
  const activeBranch = useActiveBranch();
  const listFn = useServerFn(listAdminUsers);
  const [qInput, setQInput] = useState(search.q ?? "");
  const page = search.page ?? 1;
  const offset = (page - 1) * PAGE_SIZE;

  const query = useQuery({
    queryKey: ["admin-users", search, activeBranch.branchId],
    queryFn: () =>
      listFn({
        data: {
          q: search.q,
          role: search.role as never,
          branch_id: activeBranch.branchId,
          limit: PAGE_SIZE,
          offset,
        },
      }),
  });

  const rows = query.data?.rows ?? [];
  const total = query.data?.total ?? 0;
  const totalPages = Math.max(1, Math.ceil(total / PAGE_SIZE));

  const submitSearch = (e: React.FormEvent) => {
    e.preventDefault();
    navigate({ search: { ...search, q: qInput.trim() || undefined, page: 1 } });
  };

  const clearFilters = () => {
    setQInput("");
    navigate({ search: {} });
  };

  const hasFilters = Boolean(search.q || search.role);

  const roleOptions = useMemo(() => Object.entries(ROLE_LABEL), []);

  return (
    <div className="container-app py-6 space-y-4">
      <header className="flex items-center justify-between gap-4 flex-wrap">
        <div className="flex items-center gap-3">
          <Users className="h-6 w-6 text-primary" aria-hidden="true" />
          <div>
            <h1 className="text-xl font-semibold">المستخدمون</h1>
            <p className="text-sm text-muted-foreground">
              {total > 0 ? `${total} مستخدم` : "قائمة الحسابات والأدوار"}
            </p>
          </div>
        </div>
        <button
          type="button"
          onClick={() => query.refetch()}
          disabled={query.isFetching}
          className="inline-flex items-center gap-2 rounded-md border px-3 py-1.5 text-sm hover:bg-muted disabled:opacity-50"
        >
          <RefreshCw className={`h-4 w-4 ${query.isFetching ? "animate-spin" : ""}`} />
          تحديث
        </button>
      </header>

      <form
        onSubmit={submitSearch}
        className="flex gap-2 items-center flex-wrap rounded-lg border bg-card p-3"
        role="search"
      >
        <div className="relative flex-1 min-w-[220px]">
          <Search className="absolute right-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" aria-hidden="true" />
          <input
            type="search"
            value={qInput}
            onChange={(e) => setQInput(e.target.value)}
            placeholder="بحث بالاسم أو رقم الجوال…"
            className="w-full rounded-md border bg-background pr-9 pl-3 py-2 text-sm"
            aria-label="بحث المستخدمين"
          />
        </div>
        <select
          value={search.role ?? ""}
          onChange={(e) =>
            navigate({ search: { ...search, role: e.target.value || undefined, page: 1 } })
          }
          className="rounded-md border bg-background px-3 py-2 text-sm"
          aria-label="فلترة حسب الدور"
        >
          <option value="">كل الأدوار</option>
          {roleOptions.map(([key, label]) => (
            <option key={key} value={key}>
              {label}
            </option>
          ))}
        </select>
        <button
          type="submit"
          className="rounded-md bg-primary px-4 py-2 text-sm text-primary-foreground hover:bg-primary/90"
        >
          بحث
        </button>
        {hasFilters && (
          <button
            type="button"
            onClick={clearFilters}
            className="inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground"
          >
            <X className="h-4 w-4" /> مسح
          </button>
        )}
      </form>

      <div className="rounded-lg border bg-card overflow-hidden">
        {query.isLoading ? (
          <UsersSkeleton />
        ) : query.isError ? (
          <div className="p-8 text-center text-sm text-destructive">
            <AlertTriangle className="mx-auto h-8 w-8 mb-2" />
            {(query.error as Error)?.message ?? "تعذّر التحميل"}
          </div>
        ) : rows.length === 0 ? (
          <div className="p-12 text-center text-muted-foreground">
            <Inbox className="mx-auto h-10 w-10 mb-3" aria-hidden="true" />
            <p className="text-sm">
              {hasFilters ? "لا نتائج مطابقة للفلاتر" : "لا يوجد مستخدمون بعد"}
            </p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="bg-muted/50 text-right">
                <tr>
                  <th className="p-3 font-medium">الاسم</th>
                  <th className="p-3 font-medium">الجوال</th>
                  <th className="p-3 font-medium">الأدوار</th>
                  <th className="p-3 font-medium">اللغة</th>
                  <th className="p-3 font-medium">تاريخ التسجيل</th>
                  <th className="p-3 font-medium sr-only">إجراءات</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((u: Record<string, unknown> & { id: string; roles: string[] }) => (
                  <tr key={u.id} className="border-t hover:bg-muted/30">
                    <td className="p-3 font-medium">{(u.full_name as string) || "—"}</td>
                    <td className="p-3 font-mono text-xs">
                      {(u.verified_phone as string) || (u.phone as string) || "—"}
                    </td>
                    <td className="p-3">
                      <div className="flex flex-wrap gap-1">
                        {u.roles.length > 0 ? (
                          u.roles.map((r) => (
                            <span
                              key={r}
                              className="inline-flex items-center rounded-full bg-secondary px-2 py-0.5 text-xs"
                            >
                              {ROLE_LABEL[r] ?? r}
                            </span>
                          ))
                        ) : (
                          <span className="text-xs text-muted-foreground">—</span>
                        )}
                      </div>
                    </td>
                    <td className="p-3 text-xs uppercase">
                      {(u.preferred_language as string) || "—"}
                    </td>
                    <td className="p-3 text-xs text-muted-foreground">
                      {u.created_at
                        ? new Date(u.created_at as string).toLocaleDateString("ar-SA")
                        : "—"}
                    </td>
                    <td className="p-3 text-left">
                      <Link
                        to="/admin/users/$id"
                        params={{ id: u.id }}
                        className="text-primary hover:underline text-sm"
                      >
                        عرض
                      </Link>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {totalPages > 1 && (
        <div className="flex items-center justify-between text-sm">
          <span className="text-muted-foreground">
            صفحة {page} من {totalPages}
          </span>
          <div className="flex gap-2">
            <button
              type="button"
              onClick={() => navigate({ search: { ...search, page: Math.max(1, page - 1) } })}
              disabled={page <= 1}
              className="inline-flex items-center gap-1 rounded-md border px-3 py-1.5 disabled:opacity-50"
            >
              <ChevronRight className="h-4 w-4" /> السابق
            </button>
            <button
              type="button"
              onClick={() =>
                navigate({ search: { ...search, page: Math.min(totalPages, page + 1) } })
              }
              disabled={page >= totalPages}
              className="inline-flex items-center gap-1 rounded-md border px-3 py-1.5 disabled:opacity-50"
            >
              التالي <ChevronLeft className="h-4 w-4" />
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

function UsersSkeleton() {
  return (
    <div className="p-4 space-y-3" aria-busy="true" aria-label="جاري التحميل">
      {Array.from({ length: 8 }).map((_, i) => (
        <div key={i} className="h-10 rounded-md bg-muted/50 animate-pulse" />
      ))}
    </div>
  );
}
