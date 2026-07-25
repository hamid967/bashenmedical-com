import { Building, Check, ChevronDown, Layers } from "lucide-react";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { useActiveTenant } from "@/lib/active-tenant";
import { logTenantSwitch } from "@/lib/admin/tenant-audit.functions";

/**
 * Fires an audit event for every explicit tenant switch. Failures are
 * swallowed so a flaky audit write can never block the UI change.
 */
function auditSwitch(fromId: string | null, toId: string | null, toName: string | null) {
  if (fromId === toId) return;
  void logTenantSwitch({
    data: {
      fromOrganizationId: fromId,
      toOrganizationId: toId,
      toOrganizationName: toName,
      source: "tenant_switcher",
    },
  }).catch((e) => {
    console.warn("[TenantSwitcher] audit log failed", (e as Error)?.message);
  });
}

/**
 * Global tenant/organization switcher for the admin command bar.
 * Persists the active org via `useActiveTenant`; pages filtering by
 * `organization_id` (e.g. AI Insights) subscribe to that state.
 * Hidden when the user only belongs to a single organization.
 */
export function TenantSwitcher() {
  const { tenantId, setTenantId, organizations, isLoading, activeOrganization } = useActiveTenant();

  // Do not render when there's nothing to switch between.
  if (!isLoading && organizations.length <= 1) return null;

  const label = activeOrganization ? activeOrganization.name : "كل المؤسسات";

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <button
          type="button"
          className="inline-flex items-center gap-1.5 h-9 px-2.5 rounded-lg border text-sm font-medium transition hover:opacity-90 max-w-[10rem] sm:max-w-[14rem]"
          style={{
            borderColor: "var(--ac-line-strong)",
            background: "var(--ac-subtle)",
            color: "var(--ac-ink)",
          }}
          aria-label="تبديل المؤسسة"
          title={`المؤسسة الحالية: ${label}`}
        >
          {activeOrganization ? (
            <Building className="h-4 w-4 shrink-0 opacity-80" />
          ) : (
            <Layers className="h-4 w-4 shrink-0 opacity-80" />
          )}
          <span className="hidden sm:inline truncate">{label}</span>
          <ChevronDown className="h-3.5 w-3.5 shrink-0 opacity-60" />
        </button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-64">
        <DropdownMenuLabel>اختر المؤسسة</DropdownMenuLabel>
        <DropdownMenuSeparator />
        <DropdownMenuItem
          onSelect={() => {
            auditSwitch(tenantId, null, null);
            setTenantId(null);
          }}
          className="gap-2"
        >
          <Layers className="h-4 w-4 opacity-80" />
          <span className="flex-1">كل المؤسسات</span>
          {!tenantId && <Check className="h-4 w-4 opacity-80" />}
        </DropdownMenuItem>
        <DropdownMenuSeparator />
        {isLoading && (
          <DropdownMenuItem disabled className="text-xs opacity-70">
            جارٍ التحميل…
          </DropdownMenuItem>
        )}
        {!isLoading && organizations.length === 0 && (
          <DropdownMenuItem disabled className="text-xs opacity-70">
            لا توجد مؤسسات
          </DropdownMenuItem>
        )}
        {organizations.map((o) => {
          const active = o.id === tenantId;
          return (
            <DropdownMenuItem
              key={o.id}
              onSelect={() => {
                auditSwitch(tenantId, o.id, o.name);
                setTenantId(o.id);
              }}
              className="gap-2"
            >
              <Building className="h-4 w-4 opacity-80" />
              <div className="flex-1 min-w-0">
                <div className="truncate text-sm">{o.name}</div>
                {o.slug && <div className="truncate text-[11px] opacity-60">{o.slug}</div>}
              </div>
              {active && <Check className="h-4 w-4 opacity-80" />}
            </DropdownMenuItem>
          );
        })}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
