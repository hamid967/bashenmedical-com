import { createFileRoute } from "@tanstack/react-router";
import { useState } from "react";
import { Mail, Phone, Plus, Search, Trash2, Check } from "lucide-react";
import {
  PortalPageHeader,
  PortalSection,
  PortalCard,
  PortalCardHeader,
  PortalCardBody,
  PortalCardFooter,
  PortalButton,
  PortalInput,
  PortalBadge,
  PortalEmptyState,
  PortalSkeleton,
  PortalStatCard,
} from "@/components/portal/ui";

const PAGE_URL = "https://bashenmedical.com/design/portal-primitives";
const PAGE_TITLE = "Portal Primitives — دليل تفاعلي · باعشن";
const PAGE_DESC =
  "معرض تفاعلي لطبقة portal primitives: PortalButton وPortalInput وباقي المكوّنات المشتركة مع أمثلة مباشرة لكل حالة (عادي/تحميل/معطّل/خطأ).";

export const Route = createFileRoute("/design/portal-primitives")({
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
  component: PortalPrimitivesDocsPage,
});

function Playground({
  title,
  description,
  children,
  code,
}: {
  title: string;
  description?: string;
  children: React.ReactNode;
  code: string;
}) {
  const [showCode, setShowCode] = useState(false);
  return (
    <PortalCard>
      <PortalCardHeader
        title={title}
        description={description}
        action={
          <PortalButton
            size="sm"
            variant={showCode ? "secondary" : "ghost"}
            onClick={() => setShowCode((s) => !s)}
          >
            {showCode ? "إخفاء الكود" : "عرض الكود"}
          </PortalButton>
        }
      />
      <PortalCardBody>
        <div
          className="rounded-[var(--ds-radius-md)] p-5"
          style={{
            background: "var(--ds-brand-50)",
            border: "1px dashed var(--ds-border)",
          }}
        >
          {children}
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
            <code>{code}</code>
          </pre>
        )}
      </PortalCardBody>
    </PortalCard>
  );
}

function PortalPrimitivesDocsPage() {
  const [email, setEmail] = useState("");
  const [phone, setPhone] = useState("");
  const [savingDemo, setSavingDemo] = useState(false);

  const runSaveDemo = () => {
    setSavingDemo(true);
    window.setTimeout(() => setSavingDemo(false), 1400);
  };

  return (
    <div className="portal-root min-h-screen" style={{ background: "var(--ds-brand-50)" }}>
      <div className="container-app py-10 md:py-14 space-y-8">
        <PortalPageHeader
          eyebrow="Design System"
          title="Portal Primitives — دليل تفاعلي"
          description="جميع الأمثلة أدناه مبنية من مكوّنات portal الرسمية وتقرأ حصرًا من توكنات var(--ds-*). استخدمها كمرجع حيّ عند بناء أي صفحة داخل /portal/*."
          breadcrumbs={[
            { label: "الرئيسية", to: "/" },
            { label: "التصميم" },
            { label: "Portal Primitives" },
          ]}
          actions={
            <PortalButton
              variant="secondary"
              leadingIcon={<Search size={16} />}
              onClick={() => window.open("/docs/design-system/portal-primitives.md", "_blank")}
            >
              التوثيق النصي
            </PortalButton>
          }
        />

        <PortalSection
          title="نظرة سريعة"
          description="أهم أرقام الطبقة الحالية من primitives — للاسترشاد فقط."
        >
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <PortalStatCard tone="primary" label="مكوّنات مشتركة" value={10} />
            <PortalStatCard tone="success" label="توكنات --ds-*" value="30+" />
            <PortalStatCard tone="warning" label="ملفات portal مغطّاة" value="24" />
          </div>
        </PortalSection>

        {/* PortalButton */}
        <PortalSection
          title="PortalButton"
          description="الزر القياسي داخل portal — 5 متغيّرات × 3 مقاسات + أيقونات وحالة تحميل ومعطّل."
        >
          <div className="grid gap-4">
            <Playground
              title="المتغيّرات"
              description="primary / secondary / outline / ghost / danger"
              code={`<PortalButton variant="primary">حفظ</PortalButton>
<PortalButton variant="secondary">ثانوي</PortalButton>
<PortalButton variant="outline">Outline</PortalButton>
<PortalButton variant="ghost">Ghost</PortalButton>
<PortalButton variant="danger">حذف</PortalButton>`}
            >
              <div className="flex flex-wrap gap-3">
                <PortalButton variant="primary">حفظ</PortalButton>
                <PortalButton variant="secondary">ثانوي</PortalButton>
                <PortalButton variant="outline">Outline</PortalButton>
                <PortalButton variant="ghost">Ghost</PortalButton>
                <PortalButton variant="danger">حذف</PortalButton>
              </div>
            </Playground>

            <Playground
              title="المقاسات"
              description="sm / md / lg"
              code={`<PortalButton size="sm">صغير</PortalButton>
<PortalButton size="md">متوسّط</PortalButton>
<PortalButton size="lg">كبير</PortalButton>`}
            >
              <div className="flex flex-wrap items-center gap-3">
                <PortalButton size="sm">صغير</PortalButton>
                <PortalButton size="md">متوسّط</PortalButton>
                <PortalButton size="lg">كبير</PortalButton>
              </div>
            </Playground>

            <Playground
              title="مع أيقونات"
              description="leadingIcon / trailingIcon"
              code={`<PortalButton leadingIcon={<Plus size={16} />}>إضافة</PortalButton>
<PortalButton variant="secondary" trailingIcon={<Check size={16} />}>تم</PortalButton>
<PortalButton variant="danger" leadingIcon={<Trash2 size={16} />}>حذف</PortalButton>`}
            >
              <div className="flex flex-wrap gap-3">
                <PortalButton leadingIcon={<Plus size={16} />}>إضافة</PortalButton>
                <PortalButton variant="secondary" trailingIcon={<Check size={16} />}>
                  تم
                </PortalButton>
                <PortalButton variant="danger" leadingIcon={<Trash2 size={16} />}>
                  حذف
                </PortalButton>
              </div>
            </Playground>

            <Playground
              title="التحميل والمعطّل"
              description="loading يمنع التفاعل ويعرض spinner. disabled يخفض الشفافية."
              code={`<PortalButton loading>جارٍ الحفظ…</PortalButton>
<PortalButton variant="secondary" loading>تحديث</PortalButton>
<PortalButton disabled>معطّل</PortalButton>
<PortalButton variant="danger" disabled>حذف معطّل</PortalButton>

// تجربة حية
<PortalButton onClick={run} loading={saving}>ابدأ العملية</PortalButton>`}
            >
              <div className="flex flex-wrap items-center gap-3">
                <PortalButton loading>جارٍ الحفظ…</PortalButton>
                <PortalButton variant="secondary" loading>
                  تحديث
                </PortalButton>
                <PortalButton disabled>معطّل</PortalButton>
                <PortalButton variant="danger" disabled>
                  حذف معطّل
                </PortalButton>
                <PortalButton onClick={runSaveDemo} loading={savingDemo}>
                  ابدأ العملية
                </PortalButton>
              </div>
            </Playground>

            <Playground
              title="عرض كامل"
              description="fullWidth لملء العرض داخل الحاوية."
              code={`<PortalButton fullWidth variant="primary">متابعة</PortalButton>`}
            >
              <PortalButton fullWidth variant="primary">
                متابعة
              </PortalButton>
            </Playground>
          </div>
        </PortalSection>

        {/* PortalInput */}
        <PortalSection
          title="PortalInput"
          description="مدخل نص موحّد: label + hint + error + leading/trailing icon."
        >
          <div className="grid gap-4">
            <Playground
              title="الحالة العادية مع تلميح"
              code={`<PortalInput
  label="البريد الإلكتروني"
  type="email"
  leadingIcon={<Mail size={16} />}
  hint="سنرسل تأكيد الموعد على هذا العنوان."
  value={email}
  onChange={(e) => setEmail(e.target.value)}
/>`}
            >
              <PortalInput
                label="البريد الإلكتروني"
                type="email"
                placeholder="you@example.com"
                leadingIcon={<Mail size={16} />}
                hint="سنرسل تأكيد الموعد على هذا العنوان."
                value={email}
                onChange={(e) => setEmail(e.target.value)}
              />
            </Playground>

            <Playground
              title="حالة الخطأ"
              description="error يظهر أسفل الحقل ويلوّن الحدّ باللون التحذيري."
              code={`<PortalInput
  label="رقم الجوال"
  type="tel"
  leadingIcon={<Phone size={16} />}
  error="الرجاء إدخال رقم صحيح يبدأ بـ 05."
  value={phone}
  onChange={(e) => setPhone(e.target.value)}
/>`}
            >
              <PortalInput
                label="رقم الجوال"
                type="tel"
                placeholder="05xxxxxxxx"
                leadingIcon={<Phone size={16} />}
                error="الرجاء إدخال رقم صحيح يبدأ بـ 05."
                value={phone}
                onChange={(e) => setPhone(e.target.value)}
              />
            </Playground>

            <Playground
              title="معطّل"
              code={`<PortalInput label="اسم المستخدم" value="baeshen" disabled />`}
            >
              <PortalInput label="اسم المستخدم" value="baeshen" disabled readOnly />
            </Playground>

            <Playground
              title="نموذج كامل"
              description="مثال يجمع PortalInput + PortalButton داخل PortalCard."
              code={`<PortalCard>
  <PortalCardBody>
    <form className="grid gap-4">
      <PortalInput label="البريد" leadingIcon={<Mail size={16} />} />
      <PortalInput label="الجوال" leadingIcon={<Phone size={16} />} />
      <div className="flex gap-2 justify-end">
        <PortalButton variant="ghost">إلغاء</PortalButton>
        <PortalButton variant="primary">حفظ</PortalButton>
      </div>
    </form>
  </PortalCardBody>
</PortalCard>`}
            >
              <PortalCard>
                <PortalCardBody>
                  <form
                    className="grid gap-4"
                    onSubmit={(e) => {
                      e.preventDefault();
                      runSaveDemo();
                    }}
                  >
                    <PortalInput label="البريد" leadingIcon={<Mail size={16} />} />
                    <PortalInput label="الجوال" leadingIcon={<Phone size={16} />} />
                    <div className="flex gap-2 justify-end">
                      <PortalButton variant="ghost" type="button">
                        إلغاء
                      </PortalButton>
                      <PortalButton variant="primary" type="submit" loading={savingDemo}>
                        حفظ
                      </PortalButton>
                    </div>
                  </form>
                </PortalCardBody>
              </PortalCard>
            </Playground>
          </div>
        </PortalSection>

        {/* Badges + Empty + Skeleton */}
        <PortalSection title="مكوّنات مساعدة">
          <div className="grid gap-4">
            <Playground
              title="PortalBadge"
              code={`<PortalBadge tone="success">مؤكّد</PortalBadge>
<PortalBadge tone="warning">بانتظار الدفع</PortalBadge>
<PortalBadge tone="error">مُلغى</PortalBadge>
<PortalBadge tone="muted">مسوّدة</PortalBadge>`}
            >
              <div className="flex flex-wrap gap-2">
                <PortalBadge tone="success">مؤكّد</PortalBadge>
                <PortalBadge tone="warning">بانتظار الدفع</PortalBadge>
                <PortalBadge tone="error">مُلغى</PortalBadge>
                <PortalBadge tone="muted">مسوّدة</PortalBadge>
              </div>
            </Playground>

            <Playground
              title="PortalCard — أنماط"
              code={`<PortalCard variant="default" />
<PortalCard variant="elevated" />
<PortalCard variant="outline" />`}
            >
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
            </Playground>

            <Playground
              title="حالات التحميل"
              code={`<PortalSkeleton className="h-4 w-40" rounded="rounded-full" />
<PortalSkeleton className="h-8 w-64" />`}
            >
              <div className="space-y-2">
                <PortalSkeleton className="h-4 w-40" rounded="rounded-full" />
                <PortalSkeleton className="h-8 w-64" />
                <PortalSkeleton className="h-4 w-full" rounded="rounded-full" />
                <PortalSkeleton className="h-4 w-2/3" rounded="rounded-full" />
              </div>
            </Playground>

            <Playground
              title="PortalEmptyState"
              code={`<PortalEmptyState
  title="لا توجد نتائج"
  description="جرّب تعديل الفلاتر أو البحث بكلمة مختلفة."
  action={<PortalButton>إعادة التعيين</PortalButton>}
/>`}
            >
              <PortalEmptyState
                title="لا توجد نتائج"
                description="جرّب تعديل الفلاتر أو البحث بكلمة مختلفة."
                action={<PortalButton>إعادة التعيين</PortalButton>}
              />
            </Playground>

            <Playground
              title="PortalCard مع Header/Body/Footer"
              code={`<PortalCard>
  <PortalCardHeader title="عنوان" description="وصف قصير" />
  <PortalCardBody>محتوى…</PortalCardBody>
  <PortalCardFooter>
    <PortalButton variant="ghost">إلغاء</PortalButton>
    <PortalButton>تأكيد</PortalButton>
  </PortalCardFooter>
</PortalCard>`}
            >
              <PortalCard>
                <PortalCardHeader
                  title="تفاصيل الموعد"
                  description="الأربعاء 22 يوليو · 10:30 ص"
                  action={<PortalBadge tone="success">مؤكّد</PortalBadge>}
                />
                <PortalCardBody>
                  د. سارة العتيبي — طب الأسرة · فرع صبيا الرئيسي.
                </PortalCardBody>
                <PortalCardFooter>
                  <PortalButton variant="ghost">إلغاء</PortalButton>
                  <PortalButton>تأكيد</PortalButton>
                </PortalCardFooter>
              </PortalCard>
            </Playground>
          </div>
        </PortalSection>

        <PortalCard variant="outline">
          <PortalCardBody>
            <div className="text-sm" style={{ color: "var(--ds-ink-600)" }}>
              للمرجع الكامل والقواعد الذهبية (منع Tailwind الخام، خريطة التوكنات،
              anti-patterns) راجع <code>docs/design-system/portal-primitives.md</code>.
              يتم فرض القواعد تلقائيًا عبر <code>bun run lint:portal-tokens</code>{" "}
              و<code>portal_visual_regression.py</code>.
            </div>
          </PortalCardBody>
        </PortalCard>
      </div>
    </div>
  );
}
