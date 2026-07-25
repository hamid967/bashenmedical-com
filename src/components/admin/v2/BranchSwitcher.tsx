import { Building2, Check, ChevronDown, Globe } from "lucide-react";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { useActiveBranch } from "@/lib/active-branch";

/**
 * Global branch switcher for the admin command bar.
 *
 * Renders a compact dropdown listing all public branches plus an
 * "All branches" option. The selected branch is persisted globally
 * via `useActiveBranch` so any page can filter its data accordingly.
 */
export function BranchSwitcher() {
  const { branchId, setBranchId, branches, isLoading, activeBranch } = useActiveBranch();

  const label = activeBranch ? activeBranch.name_ar : "كل الفروع";

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
          aria-label="تبديل الفرع"
          title={`الفرع الحالي: ${label}`}
        >
          {activeBranch ? (
            <Building2 className="h-4 w-4 shrink-0 opacity-80" />
          ) : (
            <Globe className="h-4 w-4 shrink-0 opacity-80" />
          )}
          <span className="hidden sm:inline truncate">{label}</span>
          <ChevronDown className="h-3.5 w-3.5 shrink-0 opacity-60" />
        </button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-64">
        <DropdownMenuLabel>اختر الفرع</DropdownMenuLabel>
        <DropdownMenuSeparator />
        <DropdownMenuItem onSelect={() => setBranchId(null)} className="gap-2">
          <Globe className="h-4 w-4 opacity-80" />
          <span className="flex-1">كل الفروع</span>
          {!branchId && <Check className="h-4 w-4 opacity-80" />}
        </DropdownMenuItem>
        <DropdownMenuSeparator />
        {isLoading && (
          <DropdownMenuItem disabled className="text-xs opacity-70">
            جارٍ التحميل…
          </DropdownMenuItem>
        )}
        {!isLoading && branches.length === 0 && (
          <DropdownMenuItem disabled className="text-xs opacity-70">
            لا توجد فروع
          </DropdownMenuItem>
        )}
        {branches.map((b) => {
          const active = b.id === branchId;
          return (
            <DropdownMenuItem key={b.id} onSelect={() => setBranchId(b.id)} className="gap-2">
              <Building2 className="h-4 w-4 opacity-80" />
              <div className="flex-1 min-w-0">
                <div className="truncate text-sm">{b.name_ar}</div>
                {b.city_ar && <div className="truncate text-[11px] opacity-60">{b.city_ar}</div>}
              </div>
              {active && <Check className="h-4 w-4 opacity-80" />}
            </DropdownMenuItem>
          );
        })}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
