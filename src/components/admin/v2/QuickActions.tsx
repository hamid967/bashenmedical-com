import { useNavigate } from "@tanstack/react-router";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Plus, CalendarCheck, UserPlus, Stethoscope, MessageSquare, ClipboardList } from "lucide-react";

export function QuickActions() {
  const navigate = useNavigate();
  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <button
          className="inline-flex items-center gap-1.5 rounded-lg h-9 px-3 text-sm font-semibold text-white transition hover:opacity-90"
          style={{ background: "var(--ac-accent)" }}
          aria-label="إجراءات سريعة"
        >
          <Plus className="h-4 w-4" />
          <span className="hidden sm:inline">إجراء سريع</span>
        </button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-56">
        <DropdownMenuLabel>الإجراءات السريعة</DropdownMenuLabel>
        <DropdownMenuSeparator />
        <DropdownMenuItem onSelect={() => navigate({ to: "/appointments-queue" })}>
          <CalendarCheck className="h-4 w-4 me-2" /> موعد جديد
        </DropdownMenuItem>
        <DropdownMenuItem onSelect={() => navigate({ to: "/patients-management" })}>
          <UserPlus className="h-4 w-4 me-2" /> مريض جديد
        </DropdownMenuItem>
        <DropdownMenuItem onSelect={() => navigate({ to: "/doctors-management" })}>
          <Stethoscope className="h-4 w-4 me-2" /> إضافة طبيب
        </DropdownMenuItem>
        <DropdownMenuItem onSelect={() => navigate({ to: "/admin/service-inquiries" })}>
          <MessageSquare className="h-4 w-4 me-2" /> استفسار واتساب
        </DropdownMenuItem>
        <DropdownMenuSeparator />
        <DropdownMenuItem onSelect={() => navigate({ to: "/admin/audit-logs" })}>
          <ClipboardList className="h-4 w-4 me-2" /> سجل التدقيق
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
