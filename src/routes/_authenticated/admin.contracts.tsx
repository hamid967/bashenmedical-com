/**
 * Contracts Registry — توثيق العقود
 *
 * لوحة توثيق موحّدة داخل /admin تعرض أربع طبقات من "العقود":
 *  1) عقود API الداخلية  — كل createServerFn في src/lib/**\/*.functions.ts
 *  2) عقود REST العامة   — كل مسار تحت src/routes/api/public/**
 *  3) عقود قانونية       — قوالب النصوص القانونية القابلة للتنزيل
 *  4) عقود البيانات      — الجداول والأعمدة وسياسات RLS من قاعدة البيانات
 *
 * الوصول محصور على أدوار admin/super_admin.
 */
import { createFileRoute, useSearch } from "@tanstack/react-router";
import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { z } from "zod";
import {
  FileCode2,
  Globe,
  Scale,
  Database,
  Search,
  Download,
  ShieldCheck,
  ShieldAlert,
} from "lucide-react";

import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui-v3";
import { Input } from "@/components/ui-v3";
import { Badge } from "@/components/ui-v3";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui-v3";
import { Button } from "@/components/ui-v3";
import { ScrollArea } from "@/components/ui/scroll-area";
import { listDataContracts, type DataContract } from "@/lib/admin/contracts.functions";

const TABS = ["internal", "public", "legal", "data"] as const;
type ContractTab = (typeof TABS)[number];

export const Route = createFileRoute("/_authenticated/admin/contracts")({
  validateSearch: z.object({ tab: z.enum(TABS).default("internal") }),
  head: () => ({
    meta: [
      { title: "توثيق العقود — لوحة الإدارة" },
      {
        name: "description",
        content:
          "مرجع موحّد لعقود الـServer Functions وواجهات REST العامة والقوالب القانونية وعقود البيانات (RLS).",
      },
      { name: "robots", content: "noindex,nofollow" },
    ],
  }),
  component: ContractsPage,
});

/* ------------------------------------------------------------------ */
/* Source-scanning helpers (client-side, admin-only bundle)           */
/* ------------------------------------------------------------------ */

type InternalContract = {
  file: string;
  name: string;
  method: "GET" | "POST";
  authenticated: boolean;
  validator: string | null;
  snippet: string;
};

type PublicRoute = {
  file: string;
  path: string;
  methods: string[];
  snippet: string;
};

const INTERNAL_SOURCES = import.meta.glob("/src/lib/**/*.functions.ts", {
  eager: true,
  query: "?raw",
  import: "default",
}) as Record<string, string>;

const PUBLIC_SOURCES = import.meta.glob("/src/routes/api/public/**/*.ts", {
  eager: true,
  query: "?raw",
  import: "default",
}) as Record<string, string>;

function extractInternal(): InternalContract[] {
  const out: InternalContract[] = [];
  const rx =
    /export\s+const\s+([A-Za-z0-9_]+)\s*=\s*createServerFn\(\s*\{\s*method:\s*["'](GET|POST)["']\s*\}\s*\)([\s\S]*?)\.handler\s*\(/g;

  for (const [path, source] of Object.entries(INTERNAL_SOURCES)) {
    let m: RegExpExecArray | null;
    while ((m = rx.exec(source)) !== null) {
      const [, name, method, chain] = m;
      const authenticated = /\.middleware\(\s*\[[^\]]*requireSupabaseAuth/.test(chain);
      const validatorMatch =
        chain.match(/\.(?:validator|inputValidator)\s*\(([\s\S]*?)\)\s*(?=\.|$)/);
      const validator = validatorMatch
        ? validatorMatch[1].trim().slice(0, 260)
        : null;
      const startIdx = m.index;
      const snippet = source.slice(startIdx, startIdx + 320).replace(/\s+/g, " ");
      out.push({ file: path, name, method: method as "GET" | "POST", authenticated, validator, snippet });
    }
  }
  return out.sort((a, b) => a.name.localeCompare(b.name));
}

function extractPublic(): PublicRoute[] {
  const out: PublicRoute[] = [];
  for (const [path, source] of Object.entries(PUBLIC_SOURCES)) {
    const routeMatch = source.match(/createFileRoute\(\s*["']([^"']+)["']\s*\)/);
    if (!routeMatch) continue;
    const routePath = routeMatch[1];
    const methods = Array.from(
      source.matchAll(/\b(GET|POST|PUT|PATCH|DELETE|OPTIONS)\s*:\s*(?:async|\()/g),
    ).map((m) => m[1]);
    const uniq = Array.from(new Set(methods));
    const snippet = source
      .slice(0, 320)
      .replace(/\s+/g, " ")
      .trim();
    out.push({ file: path, path: routePath, methods: uniq, snippet });
  }
  return out.sort((a, b) => a.path.localeCompare(b.path));
}

/* ------------------------------------------------------------------ */
/* Legal templates                                                    */
/* ------------------------------------------------------------------ */

const LEGAL_TEMPLATES: Array<{
  id: string;
  title: string;
  scope: string;
  body: string;
}> = [
  {
    id: "patient-consent",
    title: "نموذج موافقة المريض على المعالجة",
    scope: "بيانات المريض · HIPAA/PDPL",
    body:
      "أوافق أنا الموقّع أدناه على تلقّي الخدمة الطبية في مجمّع باعشن الطبي وعلى معالجة بياناتي الشخصية والصحية وفقاً لسياسة الخصوصية المعتمدة. تشمل الموافقة الوصول للسجل الإلكتروني ومشاركة النتائج مع الأطباء المعالجين ومقدّمي التأمين المصرّح لهم فقط. يحق لي سحب هذه الموافقة كتابياً في أي وقت.",
  },
  {
    id: "corporate-agreement",
    title: "اتفاقية خدمات مع جهة اعتبارية",
    scope: "شركات · مؤسسات",
    body:
      "اتفقت الأطراف على تقديم خدمات طبية شاملة (فحص دوري، تلقيح، رعاية طارئة) لموظفي الطرف الثاني وفق التعرفة الملحقة، على أن يلتزم الطرف الأول بجودة الخدمة ومواعيد الاستجابة، ويلتزم الطرف الثاني بالسداد خلال 30 يوماً من تاريخ الفاتورة. تسري الاتفاقية لمدة 12 شهراً وتتجدد تلقائياً ما لم يُشعِر أحد الطرفين الآخر خطياً قبل 30 يوماً.",
  },
  {
    id: "dpa",
    title: "ملحق معالجة البيانات (DPA)",
    scope: "موردون · تكامل تقني",
    body:
      "يلتزم المعالج (المورّد) بمعالجة البيانات الشخصية بالنيابة عن المتحكّم (المجمّع) فقط للأغراض الموصوفة، وبتطبيق ضوابط أمنية مناسبة (تشفير في النقل والراحة، تحكم بالوصول، سجلات تدقيق)، وبإخطار المتحكم خلال 24 ساعة من علمه بأي حادث تسريب بيانات. يُحظر نقل البيانات خارج المملكة دون موافقة كتابية مسبقة.",
  },
  {
    id: "insurance-eligibility",
    title: "إقرار أهلية التأمين",
    scope: "قسم الفوترة · شركات التأمين",
    body:
      "يقرّ المريض/حامل الوثيقة بأن المعلومات التأمينية المقدَّمة صحيحة وحديثة، ويتحمّل شخصياً أي تكاليف يرفض التأمين تغطيتها لاحقاً بسبب انتهاء الأهلية أو تجاوز الحدود أو استثناءات الوثيقة. يُصرَّح للمجمّع بالتواصل مع شركة التأمين للتحقق من الأهلية والحصول على الموافقات المسبقة.",
  },
];

function downloadText(filename: string, contents: string) {
  const blob = new Blob([contents], { type: "text/plain;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}

/* ------------------------------------------------------------------ */
/* Page                                                               */
/* ------------------------------------------------------------------ */

function ContractsPage() {
  const { tab } = useSearch({ from: "/_authenticated/admin/contracts" });
  const navigate = Route.useNavigate();
  const setTab = (next: ContractTab) =>
    navigate({ search: { tab: next }, replace: true });

  return (
    <div className="space-y-6 p-4 md:p-6">
      <header className="space-y-1">
        <h1 className="text-2xl font-bold tracking-tight">توثيق العقود</h1>
        <p className="text-sm text-muted-foreground">
          مرجع موحّد لعقود الـAPI الداخلية، ومسارات REST العامة، والقوالب
          القانونية، وعقود البيانات (RLS).
        </p>
      </header>

      <Tabs value={tab} onValueChange={(v) => setTab(v as ContractTab)}>
        <TabsList className="grid w-full grid-cols-2 md:grid-cols-4">
          <TabsTrigger value="internal" className="gap-2">
            <FileCode2 className="h-4 w-4" aria-hidden />
            <span>عقود API الداخلية</span>
          </TabsTrigger>
          <TabsTrigger value="public" className="gap-2">
            <Globe className="h-4 w-4" aria-hidden />
            <span>REST العامة</span>
          </TabsTrigger>
          <TabsTrigger value="legal" className="gap-2">
            <Scale className="h-4 w-4" aria-hidden />
            <span>عقود قانونية</span>
          </TabsTrigger>
          <TabsTrigger value="data" className="gap-2">
            <Database className="h-4 w-4" aria-hidden />
            <span>عقود البيانات</span>
          </TabsTrigger>
        </TabsList>

        <TabsContent value="internal" className="mt-4">
          {tab === "internal" && <InternalTab />}
        </TabsContent>
        <TabsContent value="public" className="mt-4">
          {tab === "public" && <PublicTab />}
        </TabsContent>
        <TabsContent value="legal" className="mt-4">
          {tab === "legal" && <LegalTab />}
        </TabsContent>
        <TabsContent value="data" className="mt-4">
          {tab === "data" && <DataTab />}
        </TabsContent>
      </Tabs>
    </div>
  );
}

/* ---------------- Internal ---------------- */

function InternalTab() {
  const items = useMemo(() => extractInternal(), []);
  const [q, setQ] = useState("");
  const filtered = useMemo(() => {
    const needle = q.trim().toLowerCase();
    if (!needle) return items;
    return items.filter(
      (it) =>
        it.name.toLowerCase().includes(needle) ||
        it.file.toLowerCase().includes(needle),
    );
  }, [items, q]);

  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between gap-4">
        <div>
          <CardTitle>عقود Server Functions</CardTitle>
          <p className="mt-1 text-xs text-muted-foreground">
            {items.length} دالة موزّعة على {new Set(items.map((i) => i.file)).size} ملف
          </p>
        </div>
        <div className="relative w-64">
          <Search className="absolute start-2 top-2.5 h-4 w-4 text-muted-foreground" aria-hidden />
          <Input
            className="ps-8"
            placeholder="ابحث بالاسم أو المسار…"
            value={q}
            onChange={(e) => setQ(e.target.value)}
          />
        </div>
      </CardHeader>
      <CardContent>
        <ScrollArea className="h-[65vh] pr-2">
          <ul className="divide-y divide-border">
            {filtered.map((it) => (
              <li key={`${it.file}:${it.name}`} className="py-3">
                <div className="flex flex-wrap items-center gap-2">
                  <code className="font-mono text-sm font-semibold">{it.name}</code>
                  <Badge variant={it.method === "POST" ? "default" : "secondary"}>
                    {it.method}
                  </Badge>
                  {it.authenticated ? (
                    <Badge variant="outline" className="gap-1">
                      <ShieldCheck className="h-3 w-3" aria-hidden />
                      محمي
                    </Badge>
                  ) : (
                    <Badge variant="destructive" className="gap-1">
                      <ShieldAlert className="h-3 w-3" aria-hidden />
                      عام
                    </Badge>
                  )}
                </div>
                <div className="mt-1 text-xs text-muted-foreground">
                  <code>{it.file.replace(/^\/src\//, "src/")}</code>
                </div>
                {it.validator && (
                  <div className="mt-2 rounded-md bg-muted/50 p-2 font-mono text-xs">
                    <span className="text-muted-foreground">input:</span>{" "}
                    <span className="break-all">{it.validator}</span>
                  </div>
                )}
              </li>
            ))}
            {filtered.length === 0 && (
              <li className="py-8 text-center text-sm text-muted-foreground">
                لا نتائج.
              </li>
            )}
          </ul>
        </ScrollArea>
      </CardContent>
    </Card>
  );
}

/* ---------------- Public REST ---------------- */

function PublicTab() {
  const items = useMemo(() => extractPublic(), []);
  const [q, setQ] = useState("");
  const filtered = useMemo(() => {
    const needle = q.trim().toLowerCase();
    if (!needle) return items;
    return items.filter((it) => it.path.toLowerCase().includes(needle));
  }, [items, q]);

  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between gap-4">
        <div>
          <CardTitle>مسارات REST تحت /api/public/*</CardTitle>
          <p className="mt-1 text-xs text-muted-foreground">
            {items.length} مسار — تتخطى المصادقة على النشر: يجب أن يتحقّق كل
            handler يدوياً من التوقيع/الحد المسموح.
          </p>
        </div>
        <div className="relative w-64">
          <Search className="absolute start-2 top-2.5 h-4 w-4 text-muted-foreground" aria-hidden />
          <Input
            className="ps-8"
            placeholder="ابحث بالمسار…"
            value={q}
            onChange={(e) => setQ(e.target.value)}
          />
        </div>
      </CardHeader>
      <CardContent>
        <ScrollArea className="h-[65vh] pr-2">
          <ul className="divide-y divide-border">
            {filtered.map((it) => (
              <li key={it.file} className="py-3">
                <div className="flex flex-wrap items-center gap-2">
                  <code className="font-mono text-sm font-semibold">{it.path}</code>
                  {it.methods.map((m) => (
                    <Badge key={m} variant="secondary">
                      {m}
                    </Badge>
                  ))}
                </div>
                <div className="mt-1 text-xs text-muted-foreground">
                  <code>{it.file.replace(/^\/src\//, "src/")}</code>
                </div>
              </li>
            ))}
            {filtered.length === 0 && (
              <li className="py-8 text-center text-sm text-muted-foreground">
                لا نتائج.
              </li>
            )}
          </ul>
        </ScrollArea>
      </CardContent>
    </Card>
  );
}

/* ---------------- Legal ---------------- */

function LegalTab() {
  return (
    <div className="grid gap-4 md:grid-cols-2">
      {LEGAL_TEMPLATES.map((tpl) => (
        <Card key={tpl.id}>
          <CardHeader>
            <div className="flex items-start justify-between gap-2">
              <div>
                <CardTitle className="text-base">{tpl.title}</CardTitle>
                <p className="mt-1 text-xs text-muted-foreground">{tpl.scope}</p>
              </div>
              <Button
                size="sm"
                variant="outline"
                onClick={() =>
                  downloadText(`${tpl.id}.txt`, `${tpl.title}\n\n${tpl.body}`)
                }
              >
                <Download className="me-1 h-4 w-4" aria-hidden />
                تنزيل
              </Button>
            </div>
          </CardHeader>
          <CardContent>
            <p className="text-sm leading-relaxed text-muted-foreground">{tpl.body}</p>
          </CardContent>
        </Card>
      ))}
    </div>
  );
}

/* ---------------- Data contracts ---------------- */

function DataTab() {
  const fetchContracts = useServerFn(listDataContracts);
  const query = useQuery({
    queryKey: ["admin", "data-contracts"],
    queryFn: () => fetchContracts(),
    staleTime: 5 * 60 * 1000,
  });

  const [q, setQ] = useState("");
  const filtered = useMemo(() => {
    const list = query.data?.contracts ?? [];
    const needle = q.trim().toLowerCase();
    if (!needle) return list;
    return list.filter((c) => c.table.toLowerCase().includes(needle));
  }, [query.data, q]);

  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between gap-4">
        <div>
          <CardTitle>عقود البيانات — Public schema</CardTitle>
          <p className="mt-1 text-xs text-muted-foreground">
            {query.data
              ? `${query.data.contracts.length} جدول`
              : query.isLoading
                ? "…"
                : "غير متاح"}
          </p>
        </div>
        <div className="relative w-64">
          <Search className="absolute start-2 top-2.5 h-4 w-4 text-muted-foreground" aria-hidden />
          <Input
            className="ps-8"
            placeholder="ابحث بالجدول…"
            value={q}
            onChange={(e) => setQ(e.target.value)}
          />
        </div>
      </CardHeader>
      <CardContent>
        {query.isLoading && (
          <p className="py-8 text-center text-sm text-muted-foreground">
            جارِ التحميل…
          </p>
        )}
        {query.error && (
          <p className="py-8 text-center text-sm text-destructive">
            {(query.error as Error).message}
          </p>
        )}
        <ScrollArea className="h-[65vh] pr-2">
          <ul className="space-y-3">
            {filtered.map((c) => (
              <DataContractCard key={c.table} contract={c} />
            ))}
          </ul>
        </ScrollArea>
      </CardContent>
    </Card>
  );
}

function DataContractCard({ contract }: { contract: DataContract }) {
  const [open, setOpen] = useState(false);
  return (
    <li className="rounded-lg border border-border bg-card/50 p-3">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className="flex w-full items-center justify-between gap-2 text-start"
      >
        <span className="flex items-center gap-2">
          <code className="font-mono text-sm font-semibold">{contract.table}</code>
          {contract.rls_enabled ? (
            <Badge variant="outline" className="gap-1">
              <ShieldCheck className="h-3 w-3" aria-hidden />
              RLS
            </Badge>
          ) : (
            <Badge variant="destructive" className="gap-1">
              <ShieldAlert className="h-3 w-3" aria-hidden />
              RLS معطّل
            </Badge>
          )}
          <span className="text-xs text-muted-foreground">
            {contract.columns.length} عمود · {contract.policies.length} سياسة
          </span>
        </span>
        <span className="text-xs text-muted-foreground">
          {open ? "طيّ" : "توسيع"}
        </span>
      </button>
      {open && (
        <div className="mt-3 grid gap-3 md:grid-cols-2">
          <div>
            <h4 className="mb-1 text-xs font-semibold uppercase text-muted-foreground">
              الأعمدة
            </h4>
            <ul className="space-y-1 font-mono text-xs">
              {contract.columns.map((col) => (
                <li key={col.name} className="flex flex-wrap gap-x-2">
                  <span className="font-semibold">{col.name}</span>
                  <span className="text-muted-foreground">{col.type}</span>
                  {!col.nullable && <span className="text-destructive">NOT NULL</span>}
                </li>
              ))}
            </ul>
          </div>
          <div>
            <h4 className="mb-1 text-xs font-semibold uppercase text-muted-foreground">
              سياسات RLS
            </h4>
            {contract.policies.length === 0 ? (
              <p className="text-xs text-muted-foreground">لا توجد سياسات.</p>
            ) : (
              <ul className="space-y-2 text-xs">
                {contract.policies.map((p) => (
                  <li key={p.name} className="rounded bg-muted/50 p-2">
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="font-semibold">{p.name}</span>
                      <Badge variant="secondary">{p.cmd}</Badge>
                      {p.roles.map((r) => (
                        <Badge key={r} variant="outline">
                          {r}
                        </Badge>
                      ))}
                    </div>
                    {p.qual && (
                      <div className="mt-1 font-mono text-[11px] break-all">
                        <span className="text-muted-foreground">USING:</span> {p.qual}
                      </div>
                    )}
                    {p.with_check && (
                      <div className="mt-1 font-mono text-[11px] break-all">
                        <span className="text-muted-foreground">CHECK:</span> {p.with_check}
                      </div>
                    )}
                  </li>
                ))}
              </ul>
            )}
          </div>
        </div>
      )}
    </li>
  );
}
