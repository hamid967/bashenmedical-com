/**
 * Active-subject switcher for the /patient top bar.
 *
 * Renders a dropdown listing the guardian ("myself") plus any verified
 * dependents, and switches the portal's active subject via
 * `useActiveSubject()`. Unverified dependents are shown as disabled hints
 * that link to /patient/family for verification.
 */
import * as React from "react";
import { Link } from "@tanstack/react-router";
import { ChevronDown, Check, UserRound, Users, BadgeCheck } from "lucide-react";
import {
  DropdownMenu,
  DropdownMenuTrigger,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuLabel,
} from "@/components/ui/dropdown-menu";
import { Badge } from "@/components/ui/badge";
import { useActiveSubject } from "@/lib/patient/active-subject";
import { cn } from "@/lib/utils";

export function ActiveSubjectSwitcher({ lang = "ar" }: { lang?: "ar" | "en" }) {
  const { subject, dependents, isLoading, setSubject } = useActiveSubject();
  const isDependent = subject.kind === "dependent";

  return (
    <DropdownMenu>
      <DropdownMenuTrigger
        className={cn(
          "inline-flex h-9 items-center gap-2 rounded-full border px-3 text-xs font-medium transition-colors hover:bg-accent",
          isDependent && "border-primary/40 bg-primary/5 text-primary",
        )}
        aria-label={lang === "ar" ? "الحساب النشط" : "Active profile"}
      >
        {isDependent ? (
          <Users className="h-3.5 w-3.5" aria-hidden />
        ) : (
          <UserRound className="h-3.5 w-3.5" aria-hidden />
        )}
        <span className="max-w-[9rem] truncate">{subject.name}</span>
        {isDependent && (
          <Badge variant="secondary" className="h-4 px-1 text-[10px] font-semibold">
            {lang === "ar" ? "بالنيابة" : "On behalf"}
          </Badge>
        )}
        <ChevronDown className="h-3.5 w-3.5 opacity-60" aria-hidden />
      </DropdownMenuTrigger>

      <DropdownMenuContent align="end" className="w-64">
        <DropdownMenuLabel>
          {lang === "ar" ? "التبديل بين الحسابات" : "Switch active profile"}
        </DropdownMenuLabel>
        <DropdownMenuSeparator />

        <DropdownMenuItem onSelect={() => setSubject({ kind: "self" })}>
          <UserRound className="me-2 h-4 w-4" aria-hidden />
          <span className="flex-1 truncate">
            {lang === "ar" ? "حسابي" : "My account"}
          </span>
          {subject.kind === "self" && <Check className="h-4 w-4 text-primary" aria-hidden />}
        </DropdownMenuItem>

        {dependents.length > 0 && (
          <>
            <DropdownMenuSeparator />
            <DropdownMenuLabel className="text-[11px] font-normal text-muted-foreground">
              {lang === "ar" ? "أفراد الأسرة المخوّلون" : "Authorized dependents"}
            </DropdownMenuLabel>
            {dependents.map((dep) => {
              const active = subject.kind === "dependent" && subject.id === dep.id;
              const s = dep.access_scopes;
              const scopes = [
                s.booking && (lang === "ar" ? "حجز" : "Booking"),
                s.reports && (lang === "ar" ? "تقارير" : "Reports"),
                s.prescriptions && (lang === "ar" ? "وصفات" : "Rx"),
                s.billing && (lang === "ar" ? "فواتير" : "Billing"),
              ].filter(Boolean) as string[];
              return (
                <DropdownMenuItem
                  key={dep.id}
                  onSelect={() => setSubject({ kind: "dependent", id: dep.id })}
                  className="flex-col items-start gap-1"
                >
                  <div className="flex w-full items-center gap-2">
                    <BadgeCheck className="h-4 w-4 text-emerald-600" aria-hidden />
                    <span className="flex-1 truncate">{dep.full_name}</span>
                    {active && <Check className="h-4 w-4 text-primary" aria-hidden />}
                  </div>
                  <div className="flex flex-wrap gap-1 ps-6">
                    {scopes.map((label) => (
                      <Badge key={label} variant="secondary" className="h-4 px-1 text-[10px]">
                        {label}
                      </Badge>
                    ))}
                  </div>
                </DropdownMenuItem>
              );
            })}
          </>
        )}

        <DropdownMenuSeparator />
        <DropdownMenuItem asChild>
          <Link to="/patient/family" className="text-xs text-muted-foreground">
            {isLoading
              ? lang === "ar"
                ? "جارٍ التحميل…"
                : "Loading…"
              : dependents.length === 0
                ? lang === "ar"
                  ? "لا يوجد أفراد مخوّلون — أضف/وثّق من هنا"
                  : "No authorized dependents — add or verify"
                : lang === "ar"
                  ? "إدارة أفراد الأسرة والصلاحيات"
                  : "Manage family and permissions"}
            {isLoading
              ? lang === "ar"
                ? "جارٍ التحميل…"
                : "Loading…"
              : lang === "ar"
                ? "إدارة أفراد الأسرة"
                : "Manage family"}
          </Link>
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

/**
 * Contextual banner shown under the top bar when the guardian is currently
 * acting on behalf of a dependent, so the acting scope is unambiguous.
 */
export function ActiveSubjectBanner({ lang = "ar" }: { lang?: "ar" | "en" }) {
  const { subject, setSubject } = useActiveSubject();
  if (subject.kind !== "dependent") return null;
  return (
    <div
      role="status"
      className="mb-4 flex flex-wrap items-center justify-between gap-2 rounded-lg border border-primary/30 bg-primary/5 px-3 py-2 text-xs text-primary"
    >
      <span className="flex items-center gap-2">
        <Users className="h-3.5 w-3.5" aria-hidden />
        {lang === "ar"
          ? `أنت تدير الآن حساب: ${subject.name}`
          : `You are now managing: ${subject.name}`}
      </span>
      <button
        type="button"
        onClick={() => setSubject({ kind: "self" })}
        className="rounded-md border border-primary/30 px-2 py-1 text-[11px] font-medium hover:bg-primary/10"
      >
        {lang === "ar" ? "العودة إلى حسابي" : "Back to my account"}
      </button>
    </div>
  );
}
