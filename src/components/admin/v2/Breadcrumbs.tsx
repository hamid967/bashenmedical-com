import { Link, useRouterState } from "@tanstack/react-router";
import { ChevronLeft, Home } from "lucide-react";

const LABELS: Record<string, string> = {
  admin: "الإدارة",
  inbox: "الصندوق الموحد",
  "audit-logs": "سجل التدقيق",
  "audit-log": "سجل التدقيق",
  "web-vitals": "Web Vitals",
  "notification-logs": "الإشعارات",
  "nphies-logs": "NPHIES",
  "service-inquiries": "طلبات واتساب",
  "service-catalog": "كتالوج الخدمات",
  "visual-analytics": "تحليلات بصرية",
  "reservations-usage": "استخدام الحجوزات",
  "no-show-risk": "توقّع الغياب",
  "no-show-stats": "إحصاءات الغياب",
  "no-show-detail": "المواعيد عالية المخاطرة",
  "role-permissions-matrix": "مصفوفة الصلاحيات",
  classic: "النسخة الكلاسيكية",
  super: "Super",
  monitoring: "المراقبة",
  permissions: "الصلاحيات",
  "jazan-visual": "الهوية البصرية",
  "design-tokens": "الرموز التصميمية",
  patients: "المرضى",
  "patients-management": "المرضى",
  "doctors-management": "الأطباء",
  "appointments-queue": "طابور المواعيد",
  calendar: "التقويم",
  "orders-unified": "الطلبات الموحدة",
  "complaints-admin": "الشكاوى",
  "hr-management": "الموارد البشرية",
  "inventory-management": "المخزون",
  "pharmacy-management": "الصيدلية",
  "corporate-admin": "الشركات",
  reports: "التقارير",
  rbac: "الأدوار",
  "clinic-settings": "الإعدادات",
  nurses: "التمريض",
  "availability-management": "التوفر",
  "doctors-schedule": "جداول الأطباء",
};

export function Breadcrumbs() {
  const pathname = useRouterState({ select: (s) => s.location.pathname });
  const parts = pathname.split("/").filter(Boolean);
  if (parts.length === 0) return null;

  return (
    <nav
      aria-label="مسار التنقل"
      className="hidden md:flex items-center gap-1.5 text-sm min-w-0"
      style={{ color: "var(--ac-ink-3)" }}
    >
      <Link
        to="/admin"
        className="flex items-center gap-1 hover:opacity-70 shrink-0"
        aria-label="الرئيسية"
      >
        <Home className="h-3.5 w-3.5" />
      </Link>
      {parts.map((seg, i) => {
        const to = "/" + parts.slice(0, i + 1).join("/");
        const isLast = i === parts.length - 1;
        const label = LABELS[seg] ?? decodeURIComponent(seg);
        return (
          <span key={to} className="flex items-center gap-1.5 min-w-0">
            <ChevronLeft className="h-3.5 w-3.5 opacity-40 shrink-0" />
            {isLast ? (
              <span className="font-semibold truncate" style={{ color: "var(--ac-ink)" }}>
                {label}
              </span>
            ) : (
              <Link to={to} className="hover:opacity-70 truncate">
                {label}
              </Link>
            )}
          </span>
        );
      })}
    </nav>
  );
}
