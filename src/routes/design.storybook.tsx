import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import {
  Bell,
  Calendar,
  Check,
  Mail,
  Phone,
  Plus,
  Search,
  ShieldCheck,
  Trash2,
} from "lucide-react";
import {
  PortalPageHeader,
  PortalCard,
  PortalCardHeader,
  PortalCardBody,
  PortalCardFooter,
  PortalButton,
  PortalInput,
  PortalBadge,
  PortalStatCard,
  PortalEmptyState,
  PortalSkeleton,
  PortalCardSkeleton,
  PortalDataList,
} from "@/components/portal/ui";

const PAGE_URL = "https://bashenmedical.com/design/storybook";
const PAGE_TITLE = "Portal Storybook — تصفح مكوّنات portal · باعشن";
const PAGE_DESC =
  "قصص تفاعلية لكل مكوّن داخل portal primitives مع فحص فوري لتوافق var(--ds-*) في كل عرض.";

export const Route = createFileRoute("/design/storybook")({
  head: () => ({
    meta: [
      { title: PAGE_TITLE },
      { name: "description", content: PAGE_DESC },
      { name: "robots", content: "noindex, nofollow" },
      { property: "og:title", content: PAGE_TITLE },
      { property: "og:description", content: PAGE_DESC },
      { property: "og:type", content: "website" },
      { property: "og:url", content: PAGE_URL },
      { name: "twitter:card", content: "summary" },
    ],
    links: [{ rel: "canonical", href: PAGE_URL }],
  }),
  component: StorybookPage,
});

// ─────────────────────────────────────────────────────────────────────────
// Stories registry
// ─────────────────────────────────────────────────────────────────────────

type Story = {
  id: string;
  name: string;
  render: () => ReactNode;
  code: string;
};

type StoryGroup = {
  id: string;
  name: string;
  summary: string;
  stories: Story[];
};

const groups: StoryGroup[] = [
  {
    id: "button",
    name: "PortalButton",
    summary: "الزر الرسمي داخل portal — 5 متغيّرات × 3 مقاسات + حالات.",
    stories: [
      {
        id: "variants",
        name: "المتغيّرات",
        render: () => (
          <div className="flex flex-wrap gap-3">
            <PortalButton variant="primary">Primary</PortalButton>
            <PortalButton variant="secondary">Secondary</PortalButton>
            <PortalButton variant="outline">Outline</PortalButton>
            <PortalButton variant="ghost">Ghost</PortalButton>
            <PortalButton variant="danger">Danger</PortalButton>
          </div>
        ),
        code: `<PortalButton variant="primary">Primary</PortalButton>
<PortalButton variant="secondary">Secondary</PortalButton>
<PortalButton variant="outline">Outline</PortalButton>
<PortalButton variant="ghost">Ghost</PortalButton>
<PortalButton variant="danger">Danger</PortalButton>`,
      },
      {
        id: "sizes",
        name: "المقاسات",
        render: () => (
          <div className="flex flex-wrap items-center gap-3">
            <PortalButton size="sm">صغير</PortalButton>
            <PortalButton size="md">متوسّط</PortalButton>
            <PortalButton size="lg">كبير</PortalButton>
          </div>
        ),
        code: `<PortalButton size="sm">…</PortalButton>
<PortalButton size="md">…</PortalButton>
<PortalButton size="lg">…</PortalButton>`,
      },
      {
        id: "icons",
        name: "أيقونات",
        render: () => (
          <div className="flex flex-wrap gap-3">
            <PortalButton leadingIcon={<Plus size={16} />}>إضافة</PortalButton>
            <PortalButton variant="secondary" trailingIcon={<Check size={16} />}>
              تم
            </PortalButton>
            <PortalButton variant="danger" leadingIcon={<Trash2 size={16} />}>
              حذف
            </PortalButton>
          </div>
        ),
        code: `<PortalButton leadingIcon={<Plus size={16} />}>إضافة</PortalButton>
<PortalButton variant="secondary" trailingIcon={<Check size={16} />}>تم</PortalButton>
<PortalButton variant="danger" leadingIcon={<Trash2 size={16} />}>حذف</PortalButton>`,
      },
      {
        id: "states",
        name: "حالات",
        render: () => (
          <div className="flex flex-wrap items-center gap-3">
            <PortalButton loading>جارٍ الحفظ…</PortalButton>
            <PortalButton variant="secondary" loading>
              تحديث
            </PortalButton>
            <PortalButton disabled>معطّل</PortalButton>
            <PortalButton variant="danger" disabled>
              حذف معطّل
            </PortalButton>
          </div>
        ),
        code: `<PortalButton loading>…</PortalButton>
<PortalButton disabled>…</PortalButton>`,
      },
      {
        id: "fullwidth",
        name: "عرض كامل",
        render: () => (
          <PortalButton fullWidth variant="primary">
            متابعة
          </PortalButton>
        ),
        code: `<PortalButton fullWidth variant="primary">متابعة</PortalButton>`,
      },
    ],
  },
  {
    id: "input",
    name: "PortalInput",
    summary: "مدخل نص موحّد: label + hint + error + icons.",
    stories: [
      {
        id: "basic",
        name: "أساسي",
        render: () => (
          <div className="max-w-md">
            <PortalInput
              label="البريد الإلكتروني"
              type="email"
              placeholder="you@example.com"
              leadingIcon={<Mail size={16} />}
              hint="سنرسل التأكيد على هذا العنوان."
            />
          </div>
        ),
        code: `<PortalInput
  label="البريد الإلكتروني"
  type="email"
  leadingIcon={<Mail size={16} />}
  hint="سنرسل التأكيد على هذا العنوان."
/>`,
      },
      {
        id: "error",
        name: "خطأ",
        render: () => (
          <div className="max-w-md">
            <PortalInput
              label="رقم الجوال"
              type="tel"
              placeholder="05xxxxxxxx"
              leadingIcon={<Phone size={16} />}
              error="الرجاء إدخال رقم صحيح يبدأ بـ 05."
            />
          </div>
        ),
        code: `<PortalInput label="رقم الجوال" error="…" />`,
      },
      {
        id: "disabled",
        name: "معطّل",
        render: () => (
          <div className="max-w-md">
            <PortalInput label="اسم المستخدم" value="baeshen" disabled readOnly />
          </div>
        ),
        code: `<PortalInput label="اسم المستخدم" value="baeshen" disabled />`,
      },
    ],
  },
  {
    id: "card",
    name: "PortalCard",
    summary: "السطح الأساسي — default / elevated / outline + Header/Body/Footer.",
    stories: [
      {
        id: "variants",
        name: "المتغيّرات",
        render: () => (
          <div className="grid md:grid-cols-3 gap-3">
            <PortalCard variant="default">
              <PortalCardBody>default</PortalCardBody>
            </PortalCard>
            <PortalCard variant="elevated">
              <PortalCardBody>elevated</PortalCardBody>
            </PortalCard>
            <PortalCard variant="outline">
              <PortalCardBody>outline</PortalCardBody>
            </PortalCard>
          </div>
        ),
        code: `<PortalCard variant="default" />
<PortalCard variant="elevated" />
<PortalCard variant="outline" />`,
      },
      {
        id: "composed",
        name: "بأقسام كاملة",
        render: () => (
          <PortalCard>
            <PortalCardHeader
              title="تفاصيل الموعد"
              description="الأربعاء 22 يوليو · 10:30 ص"
              action={<PortalBadge tone="success">مؤكّد</PortalBadge>}
            />
            <PortalCardBody>د. سارة العتيبي — طب الأسرة · فرع صبيا الرئيسي.</PortalCardBody>
            <PortalCardFooter>
              <PortalButton variant="ghost">إلغاء</PortalButton>
              <PortalButton>تأكيد</PortalButton>
            </PortalCardFooter>
          </PortalCard>
        ),
        code: `<PortalCard>
  <PortalCardHeader title="…" description="…" action={<PortalBadge/>} />
  <PortalCardBody>…</PortalCardBody>
  <PortalCardFooter>
    <PortalButton variant="ghost">إلغاء</PortalButton>
    <PortalButton>تأكيد</PortalButton>
  </PortalCardFooter>
</PortalCard>`,
      },
    ],
  },
  {
    id: "badge",
    name: "PortalBadge",
    summary: "شارة حالة بألوان دلالية.",
    stories: [
      {
        id: "tones",
        name: "الأنغام",
        render: () => (
          <div className="flex flex-wrap gap-2">
            <PortalBadge tone="default">افتراضي</PortalBadge>
            <PortalBadge tone="success">مؤكّد</PortalBadge>
            <PortalBadge tone="warning">بانتظار الدفع</PortalBadge>
            <PortalBadge tone="error">مُلغى</PortalBadge>
            <PortalBadge tone="muted">مسوّدة</PortalBadge>
          </div>
        ),
        code: `<PortalBadge tone="success">مؤكّد</PortalBadge>
<PortalBadge tone="warning">…</PortalBadge>
<PortalBadge tone="error">…</PortalBadge>
<PortalBadge tone="muted">…</PortalBadge>`,
      },
    ],
  },
  {
    id: "stat",
    name: "PortalStatCard",
    summary: "بطاقة KPI مع أيقونة واتجاه.",
    stories: [
      {
        id: "grid",
        name: "شبكة KPIs",
        render: () => (
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <PortalStatCard
              tone="primary"
              label="القادمة"
              value={3}
              icon={<Calendar size={20} />}
              trend={{ value: "12%", direction: "up" }}
            />
            <PortalStatCard tone="success" label="المكتملة" value={12} />
            <PortalStatCard
              tone="warning"
              label="قيد الانتظار"
              value={1}
              icon={<Bell size={20} />}
              trend={{ value: "3%", direction: "down" }}
            />
          </div>
        ),
        code: `<PortalStatCard tone="primary" label="القادمة" value={3} icon={<Calendar/>} />
<PortalStatCard tone="success" label="المكتملة" value={12} />`,
      },
    ],
  },
  {
    id: "datalist",
    name: "PortalDataList",
    summary: "قائمة تعريفات (dt/dd).",
    stories: [
      {
        id: "basic",
        name: "أساسي",
        render: () => (
          <PortalCard>
            <PortalCardBody>
              <PortalDataList
                items={[
                  { label: "المريض", value: "أحمد الغامدي" },
                  { label: "التاريخ", value: "22 يوليو 2026" },
                  { label: "الفرع", value: "صبيا الرئيسي" },
                  { label: "الحالة", value: <PortalBadge tone="success">مؤكّد</PortalBadge> },
                ]}
              />
            </PortalCardBody>
          </PortalCard>
        ),
        code: `<PortalDataList items={[{ label: "المريض", value: "…" }, …]} />`,
      },
    ],
  },
  {
    id: "empty",
    name: "PortalEmptyState",
    summary: "حالة الفراغ الموحّدة.",
    stories: [
      {
        id: "basic",
        name: "أساسي",
        render: () => (
          <PortalEmptyState
            title="لا توجد نتائج"
            description="جرّب تعديل الفلاتر أو البحث بكلمة مختلفة."
            icon={<Search size={22} />}
            action={<PortalButton>إعادة التعيين</PortalButton>}
          />
        ),
        code: `<PortalEmptyState
  title="لا توجد نتائج"
  description="…"
  action={<PortalButton>إعادة التعيين</PortalButton>}
/>`,
      },
    ],
  },
  {
    id: "skeleton",
    name: "PortalSkeleton",
    summary: "حالات التحميل.",
    stories: [
      {
        id: "lines",
        name: "أسطر",
        render: () => (
          <div className="space-y-2 max-w-md">
            <PortalSkeleton className="h-4 w-40" rounded="rounded-full" />
            <PortalSkeleton className="h-8 w-64" />
            <PortalSkeleton className="h-4 w-full" rounded="rounded-full" />
            <PortalSkeleton className="h-4 w-2/3" rounded="rounded-full" />
          </div>
        ),
        code: `<PortalSkeleton className="h-4 w-40" rounded="rounded-full" />`,
      },
      {
        id: "card",
        name: "بطاقة",
        render: () => (
          <div className="grid md:grid-cols-2 gap-3">
            <PortalCardSkeleton />
            <PortalCardSkeleton />
          </div>
        ),
        code: `<PortalCardSkeleton />`,
      },
    ],
  },
  {
    id: "compositions",
    name: "تركيبات",
    summary: "أمثلة كاملة تجمع أكثر من مكوّن.",
    stories: [
      {
        id: "form",
        name: "نموذج + بطاقة",
        render: () => <FormComposition />,
        code: `<PortalCard>
  <PortalCardBody>
    <form className="grid gap-4">
      <PortalInput label="البريد" leadingIcon={<Mail/>} />
      <PortalInput label="الجوال" leadingIcon={<Phone/>} />
      <PortalButton variant="primary" type="submit">حفظ</PortalButton>
    </form>
  </PortalCardBody>
</PortalCard>`,
      },
    ],
  },
];

function FormComposition() {
  const [saving, setSaving] = useState(false);
  return (
    <PortalCard>
      <PortalCardBody>
        <form
          className="grid gap-4 max-w-md"
          onSubmit={(e) => {
            e.preventDefault();
            setSaving(true);
            window.setTimeout(() => setSaving(false), 1200);
          }}
        >
          <PortalInput label="البريد" type="email" leadingIcon={<Mail size={16} />} />
          <PortalInput label="الجوال" type="tel" leadingIcon={<Phone size={16} />} />
          <div className="flex gap-2 justify-end">
            <PortalButton variant="ghost" type="button">
              إلغاء
            </PortalButton>
            <PortalButton variant="primary" type="submit" loading={saving}>
              حفظ
            </PortalButton>
          </div>
        </form>
      </PortalCardBody>
    </PortalCard>
  );
}

// ─────────────────────────────────────────────────────────────────────────
// Token audit — inspects rendered subtree for --ds-* compliance
// ─────────────────────────────────────────────────────────────────────────

type AuditFinding = {
  kind: "inline-color" | "raw-class" | "raw-attr-color";
  detail: string;
  tag: string;
  snippet: string;
};

const RAW_COLOR_RE =
  /#(?:[0-9a-fA-F]{3,4}|[0-9a-fA-F]{6}|[0-9a-fA-F]{8})\b|rgba?\(|hsla?\(/;

// Tailwind color utilities we treat as forbidden inside portal previews.
const FORBIDDEN_CLASS_RE =
  /\b(?:bg|text|border|ring|from|to|via|fill|stroke|shadow|divide|placeholder|caret|accent|decoration|outline)-(?:white|black|slate|gray|zinc|neutral|stone|red|orange|amber|yellow|lime|green|emerald|teal|cyan|sky|blue|indigo|violet|purple|fuchsia|pink|rose)(?:-\d{2,3})?(?:\/\d{1,3})?\b/;

function auditSubtree(root: HTMLElement | null): AuditFinding[] {
  if (!root) return [];
  const findings: AuditFinding[] = [];
  const walker = document.createTreeWalker(root, NodeFilter.SHOW_ELEMENT);
  let node = walker.currentNode as HTMLElement | null;
  const seen = new Set<string>();
  const push = (f: AuditFinding) => {
    const key = `${f.kind}|${f.tag}|${f.detail}`;
    if (seen.has(key)) return;
    seen.add(key);
    findings.push(f);
  };
  while (node) {
    const el = node as HTMLElement;
    const tag = el.tagName.toLowerCase();
    const style = el.getAttribute("style") || "";
    if (style && RAW_COLOR_RE.test(style)) {
      const m = style.match(RAW_COLOR_RE);
      push({
        kind: "inline-color",
        detail: m?.[0] ?? "raw color",
        tag,
        snippet: style.slice(0, 140),
      });
    }
    const cls = el.getAttribute("class") || "";
    if (cls) {
      const m = cls.match(FORBIDDEN_CLASS_RE);
      if (m) {
        push({ kind: "raw-class", detail: m[0], tag, snippet: cls.slice(0, 140) });
      }
    }
    for (const attr of ["fill", "stroke", "color"]) {
      const v = el.getAttribute(attr);
      if (v && RAW_COLOR_RE.test(v)) {
        push({
          kind: "raw-attr-color",
          detail: `${attr}="${v}"`,
          tag,
          snippet: v.slice(0, 60),
        });
      }
    }
    node = walker.nextNode() as HTMLElement | null;
  }
  return findings;
}

// ─────────────────────────────────────────────────────────────────────────
// Page
// ─────────────────────────────────────────────────────────────────────────

const VIEWPORTS = {
  mobile: 380,
  tablet: 720,
  desktop: 1120,
} as const;
type ViewportKey = keyof typeof VIEWPORTS;

const BACKGROUNDS = {
  surface: "var(--ds-brand-50)",
  white: "#ffffff",
  ink: "var(--ds-ink-900)",
} as const;
type BgKey = keyof typeof BACKGROUNDS;

function StorybookPage() {
  const [groupId, setGroupId] = useState(groups[0].id);
  const [storyId, setStoryId] = useState(groups[0].stories[0].id);
  const [viewport, setViewport] = useState<ViewportKey>("desktop");
  const [bg, setBg] = useState<BgKey>("surface");
  const [showCode, setShowCode] = useState(false);
  const [findings, setFindings] = useState<AuditFinding[]>([]);
  const stageRef = useRef<HTMLDivElement | null>(null);

  const group = groups.find((g) => g.id === groupId) ?? groups[0];
  const story = group.stories.find((s) => s.id === storyId) ?? group.stories[0];

  const rendered = useMemo(() => story.render(), [story]);

  useEffect(() => {
    const id = window.setTimeout(() => {
      setFindings(auditSubtree(stageRef.current));
    }, 60);
    return () => window.clearTimeout(id);
  }, [story, viewport, bg]);

  const selectGroup = (gid: string) => {
    const g = groups.find((x) => x.id === gid);
    if (!g) return;
    setGroupId(gid);
    setStoryId(g.stories[0].id);
  };

  return (
    <div
      className="portal-root min-h-screen"
      style={{ background: "var(--ds-brand-50)" }}
    >
      <div className="container-app py-8 md:py-12 space-y-6">
        <PortalPageHeader
          eyebrow="Design System"
          title="Portal Storybook"
          description="تصفح كل مكوّنات portal primitives، بدّل الحجم والخلفية، وافحص توافق var(--ds-*) لحظيًا."
          breadcrumbs={[
            { label: "الرئيسية", to: "/" },
            { label: "التصميم" },
            { label: "Storybook" },
          ]}
          actions={
            <PortalButton
              variant="secondary"
              leadingIcon={<ShieldCheck size={16} />}
              onClick={() => setFindings(auditSubtree(stageRef.current))}
            >
              إعادة الفحص
            </PortalButton>
          }
        />

        <div className="grid grid-cols-1 lg:grid-cols-[240px_minmax(0,1fr)] gap-5">
          {/* Sidebar */}
          <PortalCard>
            <PortalCardBody className="p-3">
              <nav aria-label="Storybook navigation" className="space-y-3">
                {groups.map((g) => (
                  <div key={g.id}>
                    <button
                      type="button"
                      onClick={() => selectGroup(g.id)}
                      className="w-full text-start rounded-[var(--ds-radius-md)] px-3 py-2 text-sm font-semibold transition-colors"
                      style={{
                        background:
                          g.id === groupId ? "var(--ds-brand-50)" : "transparent",
                        color:
                          g.id === groupId
                            ? "var(--ds-brand-700)"
                            : "var(--ds-ink-900)",
                        border:
                          g.id === groupId
                            ? "1px solid color-mix(in oklab, var(--ds-brand-500) 25%, transparent)"
                            : "1px solid transparent",
                      }}
                    >
                      {g.name}
                    </button>
                    {g.id === groupId && (
                      <ul className="mt-1 ms-2 space-y-0.5">
                        {g.stories.map((s) => (
                          <li key={s.id}>
                            <button
                              type="button"
                              onClick={() => setStoryId(s.id)}
                              className="w-full text-start rounded-[var(--ds-radius-sm)] px-3 py-1.5 text-[12.5px] transition-colors"
                              style={{
                                background:
                                  s.id === storyId
                                    ? "color-mix(in oklab, var(--ds-brand-500) 12%, transparent)"
                                    : "transparent",
                                color:
                                  s.id === storyId
                                    ? "var(--ds-brand-700)"
                                    : "var(--ds-ink-600)",
                              }}
                            >
                              {s.name}
                            </button>
                          </li>
                        ))}
                      </ul>
                    )}
                  </div>
                ))}
              </nav>
            </PortalCardBody>
          </PortalCard>

          {/* Main */}
          <div className="space-y-4 min-w-0">
            {/* Toolbar */}
            <PortalCard>
              <PortalCardBody>
                <div className="flex flex-wrap items-center gap-3 justify-between">
                  <div className="min-w-0">
                    <div
                      className="text-[11px] font-semibold uppercase tracking-wider"
                      style={{ color: "var(--ds-ink-400)" }}
                    >
                      {group.name}
                    </div>
                    <div
                      className="text-base font-semibold"
                      style={{ color: "var(--ds-ink-900)" }}
                    >
                      {story.name}
                    </div>
                    <div className="text-[12.5px]" style={{ color: "var(--ds-ink-600)" }}>
                      {group.summary}
                    </div>
                  </div>
                  <div className="flex flex-wrap items-center gap-2">
                    <SegmentedControl
                      label="viewport"
                      value={viewport}
                      onChange={(v) => setViewport(v as ViewportKey)}
                      options={[
                        { value: "mobile", label: "موبايل" },
                        { value: "tablet", label: "تابلت" },
                        { value: "desktop", label: "ديسكتوب" },
                      ]}
                    />
                    <SegmentedControl
                      label="background"
                      value={bg}
                      onChange={(v) => setBg(v as BgKey)}
                      options={[
                        { value: "surface", label: "سطح" },
                        { value: "white", label: "أبيض" },
                        { value: "ink", label: "داكن" },
                      ]}
                    />
                    <PortalButton
                      size="sm"
                      variant={showCode ? "secondary" : "ghost"}
                      onClick={() => setShowCode((s) => !s)}
                    >
                      {showCode ? "إخفاء الكود" : "عرض الكود"}
                    </PortalButton>
                  </div>
                </div>
              </PortalCardBody>
            </PortalCard>

            {/* Stage */}
            <PortalCard>
              <PortalCardBody>
                <div
                  className="rounded-[var(--ds-radius-md)] overflow-auto"
                  style={{
                    background: BACKGROUNDS[bg],
                    border: "1px dashed var(--ds-border)",
                    padding: 20,
                  }}
                >
                  <div
                    ref={stageRef}
                    style={{
                      width: "100%",
                      maxWidth: VIEWPORTS[viewport],
                      margin: "0 auto",
                    }}
                  >
                    {rendered}
                  </div>
                </div>
                {showCode && (
                  <pre
                    dir="ltr"
                    className="mt-3 overflow-x-auto text-[12.5px] leading-relaxed rounded-[var(--ds-radius-md)] p-4"
                    style={{
                      background: "var(--ds-ink-900)",
                      color: "#e5f2ef",
                      fontFamily:
                        "ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace",
                    }}
                  >
                    <code>{story.code}</code>
                  </pre>
                )}
              </PortalCardBody>
            </PortalCard>

            {/* Audit */}
            <PortalCard>
              <PortalCardHeader
                title="فحص توافق var(--ds-*)"
                description="يمسح subtree المعروض بحثًا عن ألوان خام أو أصناف Tailwind ممنوعة."
                action={
                  <PortalBadge tone={findings.length === 0 ? "success" : "error"}>
                    {findings.length === 0
                      ? "متوافق"
                      : `${findings.length} انتهاك`}
                  </PortalBadge>
                }
              />
              <PortalCardBody>
                {findings.length === 0 ? (
                  <div
                    className="text-sm"
                    style={{ color: "var(--ds-ink-600)" }}
                  >
                    لا توجد ألوان خام أو أصناف ممنوعة داخل هذه القصة — الطبقة نظيفة ✅
                  </div>
                ) : (
                  <ul className="space-y-2">
                    {findings.map((f, i) => (
                      <li
                        key={i}
                        className="flex items-start gap-3 rounded-[var(--ds-radius-sm)] p-3"
                        style={{
                          background: "var(--ds-error-50)",
                          border:
                            "1px solid color-mix(in oklab, var(--ds-error-500) 25%, transparent)",
                        }}
                      >
                        <PortalBadge tone="error">{f.kind}</PortalBadge>
                        <div className="min-w-0 flex-1">
                          <div
                            className="text-sm font-semibold"
                            style={{ color: "var(--ds-ink-900)" }}
                          >
                            &lt;{f.tag}&gt; — {f.detail}
                          </div>
                          <code
                            dir="ltr"
                            className="block mt-1 text-[12px] truncate"
                            style={{ color: "var(--ds-ink-600)" }}
                          >
                            {f.snippet}
                          </code>
                        </div>
                      </li>
                    ))}
                  </ul>
                )}
              </PortalCardBody>
              <PortalCardFooter>
                <span
                  className="text-[12px] me-auto"
                  style={{ color: "var(--ds-ink-400)" }}
                >
                  الفحص يعمل على DOM المعروض فقط — للمراجعة الشاملة استخدم
                  {" "}<code>bun run lint:portal-tokens</code>.
                </span>
                <PortalButton
                  size="sm"
                  variant="ghost"
                  onClick={() => setFindings(auditSubtree(stageRef.current))}
                >
                  إعادة الفحص
                </PortalButton>
              </PortalCardFooter>
            </PortalCard>
          </div>
        </div>
      </div>
    </div>
  );
}

function SegmentedControl<T extends string>({
  value,
  onChange,
  options,
  label,
}: {
  value: T;
  onChange: (next: T) => void;
  options: { value: T; label: string }[];
  label: string;
}) {
  return (
    <div
      role="radiogroup"
      aria-label={label}
      className="inline-flex items-center rounded-[var(--ds-radius-md)] p-0.5"
      style={{
        background: "var(--ds-brand-50)",
        border: "1px solid var(--ds-border)",
      }}
    >
      {options.map((opt) => {
        const active = opt.value === value;
        return (
          <button
            key={opt.value}
            type="button"
            role="radio"
            aria-checked={active}
            onClick={() => onChange(opt.value)}
            className="h-8 px-3 text-[12.5px] font-semibold rounded-[var(--ds-radius-sm)] transition-colors"
            style={{
              background: active ? "#ffffff" : "transparent",
              color: active ? "var(--ds-brand-700)" : "var(--ds-ink-600)",
              boxShadow: active ? "var(--ds-shadow-sm)" : "none",
            }}
          >
            {opt.label}
          </button>
        );
      })}
    </div>
  );
}
