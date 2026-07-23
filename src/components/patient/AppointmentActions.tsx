/**
 * Phase 5 — appointment action toolbar.
 *
 * Renders per-card actions: confirm attendance, reschedule, cancel, digital
 * check-in, directions, add-to-calendar, download confirmation, request
 * follow-up. Each action is state-gated (window, current status) and calls a
 * server function that already enforces `assertPatientAccess` + ownership.
 */
import { useMemo, useState } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { toast } from "sonner";
import {
  Calendar as CalendarIcon,
  CheckCircle2,
  Download,
  MapPin,
  QrCode,
  RefreshCw,
  RotateCcw,
  XCircle,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  cancelMyAppointment,
  confirmMyAttendance,
  performSelfCheckIn,
  requestFollowUp,
  reschedulePatientAppointment,
} from "@/lib/portal/appointments.functions";

export interface AppointmentActionsRow {
  id: string;
  reference_number?: string | null;
  appointment_date: string;
  appointment_time?: string | null;
  status: string;
  reason?: string | null;
  doctor?: { name_ar?: string | null; name_en?: string | null } | null;
  branch?: {
    name_ar?: string | null;
    name_en?: string | null;
    address_ar?: string | null;
    lat?: number | null;
    lng?: number | null;
  } | null;
}

/* -------------------- helpers -------------------- */

const MINUTE = 60_000;

function appointmentDateTime(apt: AppointmentActionsRow): Date | null {
  if (!apt.appointment_date) return null;
  const time = apt.appointment_time?.slice(0, 5) ?? "00:00";
  const iso = `${apt.appointment_date}T${time}:00`;
  const d = new Date(iso);
  return Number.isNaN(d.getTime()) ? null : d;
}

/**
 * Digital check-in window: 60 min before → 30 min after start.
 * Mirrors server-side enforcement in performSelfCheckIn.
 */
function inCheckInWindow(apt: AppointmentActionsRow): boolean {
  const start = appointmentDateTime(apt);
  if (!start) return false;
  const now = Date.now();
  return now >= start.getTime() - 60 * MINUTE && now <= start.getTime() + 30 * MINUTE;
}

function isTerminal(apt: AppointmentActionsRow): boolean {
  return ["cancelled", "completed", "no_show"].includes(apt.status);
}

function directionsHref(apt: AppointmentActionsRow): string | null {
  const b = apt.branch;
  if (b?.lat != null && b?.lng != null) {
    return `https://www.google.com/maps/dir/?api=1&destination=${b.lat},${b.lng}`;
  }
  const query = b?.address_ar ?? b?.name_ar ?? b?.name_en;
  return query ? `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(query)}` : null;
}

function buildIcs(apt: AppointmentActionsRow): string {
  const start = appointmentDateTime(apt);
  if (!start) return "";
  const end = new Date(start.getTime() + 30 * MINUTE);
  const fmt = (d: Date) =>
    d.toISOString().replace(/[-:]/g, "").replace(/\.\d{3}/, "");
  const title = `موعد مع ${apt.doctor?.name_ar ?? "الطبيب"}`;
  const location = apt.branch?.name_ar ?? apt.branch?.name_en ?? "";
  const description = apt.reason ?? "";
  const uid = `${apt.id}@bashenmedical.com`;
  return [
    "BEGIN:VCALENDAR",
    "VERSION:2.0",
    "PRODID:-//Bashen Medical//Patient Portal//AR",
    "BEGIN:VEVENT",
    `UID:${uid}`,
    `DTSTAMP:${fmt(new Date())}`,
    `DTSTART:${fmt(start)}`,
    `DTEND:${fmt(end)}`,
    `SUMMARY:${title}`,
    `LOCATION:${location}`,
    `DESCRIPTION:${description}`,
    "END:VEVENT",
    "END:VCALENDAR",
  ].join("\r\n");
}

function downloadIcs(apt: AppointmentActionsRow) {
  const ics = buildIcs(apt);
  if (!ics) {
    toast.error("تعذر إنشاء ملف التقويم.");
    return;
  }
  const blob = new Blob([ics], { type: "text/calendar;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = `appointment-${apt.reference_number ?? apt.id.slice(0, 8)}.ics`;
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
}

/* -------------------- component -------------------- */

export function AppointmentActions({ apt }: { apt: AppointmentActionsRow }) {
  const queryClient = useQueryClient();
  const invalidate = () =>
    queryClient.invalidateQueries({ queryKey: ["patient", "appointments"] });

  const confirmFn = useServerFn(confirmMyAttendance);
  const cancelFn = useServerFn(cancelMyAppointment);
  const rescheduleFn = useServerFn(reschedulePatientAppointment);
  const checkInFn = useServerFn(performSelfCheckIn);
  const followUpFn = useServerFn(requestFollowUp);

  const confirm = useMutation({
    mutationFn: () => confirmFn({ data: { id: apt.id } }),
    onSuccess: () => {
      toast.success("تم تأكيد الحضور.");
      invalidate();
    },
    onError: (e: unknown) => toast.error((e as Error).message || "تعذر التأكيد."),
  });

  const cancel = useMutation({
    mutationFn: () => cancelFn({ data: { id: apt.id } }),
    onSuccess: () => {
      toast.success("تم إلغاء الموعد.");
      invalidate();
    },
    onError: (e: unknown) => toast.error((e as Error).message || "تعذر الإلغاء."),
  });

  const checkIn = useMutation({
    mutationFn: () => checkInFn({ data: { id: apt.id } }),
    onSuccess: (res: unknown) => {
      const r = res as { queueNumber?: number | null };
      toast.success(
        r?.queueNumber != null
          ? `تم تسجيل الوصول. رقمك في الطابور: ${r.queueNumber}`
          : "تم تسجيل الوصول.",
      );
      invalidate();
    },
    onError: (e: unknown) =>
      toast.error((e as Error).message || "تعذر تسجيل الوصول الآن."),
  });

  const [rescheduleOpen, setRescheduleOpen] = useState(false);
  const [rDate, setRDate] = useState(apt.appointment_date);
  const [rTime, setRTime] = useState((apt.appointment_time ?? "09:00").slice(0, 5));

  const reschedule = useMutation({
    mutationFn: () =>
      rescheduleFn({ data: { id: apt.id, date: rDate, time: rTime } }),
    onSuccess: () => {
      toast.success("تم تعديل الموعد.");
      setRescheduleOpen(false);
      invalidate();
    },
    onError: (e: unknown) =>
      toast.error((e as Error).message || "تعذر تعديل الموعد."),
  });

  const [followUpOpen, setFollowUpOpen] = useState(false);
  const [fDate, setFDate] = useState(() => {
    const d = new Date();
    d.setDate(d.getDate() + 7);
    return d.toISOString().slice(0, 10);
  });
  const [fTime, setFTime] = useState("09:00");
  const [fReason, setFReason] = useState("");

  const followUp = useMutation({
    mutationFn: () =>
      followUpFn({
        data: {
          fromAppointmentId: apt.id,
          preferredDate: fDate,
          preferredTime: fTime,
          reason: fReason || null,
        },
      }),
    onSuccess: () => {
      toast.success("تم إرسال طلب المتابعة.");
      setFollowUpOpen(false);
      invalidate();
    },
    onError: (e: unknown) =>
      toast.error((e as Error).message || "تعذر إرسال الطلب."),
  });

  const directions = directionsHref(apt);
  const terminal = isTerminal(apt);
  const canCheckIn = useMemo(() => inCheckInWindow(apt) && !terminal, [apt, terminal]);
  const canConfirm = apt.status === "new" && !terminal;
  const canReschedule = !terminal;
  const canCancel = !terminal;
  const verifyHref = apt.reference_number
    ? `/verify?ref=${encodeURIComponent(apt.reference_number)}`
    : null;

  return (
    <div className="flex flex-wrap items-center gap-2">
      {canConfirm && (
        <Button
          size="sm"
          variant="default"
          onClick={() => confirm.mutate()}
          disabled={confirm.isPending}
        >
          <CheckCircle2 className="me-1 h-3 w-3" aria-hidden />
          تأكيد الحضور
        </Button>
      )}

      {canCheckIn && (
        <Button
          size="sm"
          variant="secondary"
          onClick={() => checkIn.mutate()}
          disabled={checkIn.isPending}
        >
          <QrCode className="me-1 h-3 w-3" aria-hidden />
          تسجيل الوصول
        </Button>
      )}

      {canReschedule && (
        <Dialog open={rescheduleOpen} onOpenChange={setRescheduleOpen}>
          <DialogTrigger asChild>
            <Button size="sm" variant="outline">
              <RefreshCw className="me-1 h-3 w-3" aria-hidden />
              إعادة جدولة
            </Button>
          </DialogTrigger>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>إعادة جدولة الموعد</DialogTitle>
              <DialogDescription>اختر التاريخ والوقت الجديدين.</DialogDescription>
            </DialogHeader>
            <div className="grid gap-3">
              <div className="grid gap-1">
                <Label htmlFor={`r-date-${apt.id}`}>التاريخ</Label>
                <Input
                  id={`r-date-${apt.id}`}
                  type="date"
                  value={rDate}
                  min={new Date().toISOString().slice(0, 10)}
                  onChange={(e) => setRDate(e.target.value)}
                />
              </div>
              <div className="grid gap-1">
                <Label htmlFor={`r-time-${apt.id}`}>الوقت</Label>
                <Input
                  id={`r-time-${apt.id}`}
                  type="time"
                  value={rTime}
                  onChange={(e) => setRTime(e.target.value)}
                />
              </div>
            </div>
            <DialogFooter>
              <Button
                onClick={() => reschedule.mutate()}
                disabled={reschedule.isPending || !rDate || !rTime}
              >
                حفظ التعديل
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      )}

      {canCancel && (
        <AlertDialog>
          <AlertDialogTrigger asChild>
            <Button size="sm" variant="outline">
              <XCircle className="me-1 h-3 w-3" aria-hidden />
              إلغاء
            </Button>
          </AlertDialogTrigger>
          <AlertDialogContent>
            <AlertDialogHeader>
              <AlertDialogTitle>تأكيد إلغاء الموعد</AlertDialogTitle>
              <AlertDialogDescription>
                هل تريد إلغاء هذا الموعد؟ يمكنك حجز موعد جديد لاحقًا.
              </AlertDialogDescription>
            </AlertDialogHeader>
            <AlertDialogFooter>
              <AlertDialogCancel>تراجع</AlertDialogCancel>
              <AlertDialogAction onClick={() => cancel.mutate()}>
                نعم، ألغِ الموعد
              </AlertDialogAction>
            </AlertDialogFooter>
          </AlertDialogContent>
        </AlertDialog>
      )}

      {directions && (
        <Button size="sm" variant="outline" asChild>
          <a href={directions} target="_blank" rel="noopener noreferrer">
            <MapPin className="me-1 h-3 w-3" aria-hidden />
            اتجاهات
          </a>
        </Button>
      )}

      <Button size="sm" variant="ghost" onClick={() => downloadIcs(apt)}>
        <CalendarIcon className="me-1 h-3 w-3" aria-hidden />
        إضافة للتقويم
      </Button>

      {verifyHref && (
        <Button size="sm" variant="ghost" asChild>
          <a href={verifyHref} target="_blank" rel="noopener noreferrer">
            <Download className="me-1 h-3 w-3" aria-hidden />
            تأكيد الحجز
          </a>
        </Button>
      )}

      {terminal && apt.status !== "cancelled" && (
        <Dialog open={followUpOpen} onOpenChange={setFollowUpOpen}>
          <DialogTrigger asChild>
            <Button size="sm" variant="outline">
              <RotateCcw className="me-1 h-3 w-3" aria-hidden />
              طلب متابعة
            </Button>
          </DialogTrigger>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>طلب موعد متابعة</DialogTitle>
              <DialogDescription>
                اختر تاريخًا ووقتًا مفضلًا لموعد المتابعة مع نفس الطبيب.
              </DialogDescription>
            </DialogHeader>
            <div className="grid gap-3">
              <div className="grid gap-1">
                <Label htmlFor={`f-date-${apt.id}`}>التاريخ</Label>
                <Input
                  id={`f-date-${apt.id}`}
                  type="date"
                  value={fDate}
                  min={new Date().toISOString().slice(0, 10)}
                  onChange={(e) => setFDate(e.target.value)}
                />
              </div>
              <div className="grid gap-1">
                <Label htmlFor={`f-time-${apt.id}`}>الوقت المفضل</Label>
                <Input
                  id={`f-time-${apt.id}`}
                  type="time"
                  value={fTime}
                  onChange={(e) => setFTime(e.target.value)}
                />
              </div>
              <div className="grid gap-1">
                <Label htmlFor={`f-reason-${apt.id}`}>سبب المتابعة (اختياري)</Label>
                <Textarea
                  id={`f-reason-${apt.id}`}
                  rows={3}
                  maxLength={500}
                  value={fReason}
                  onChange={(e) => setFReason(e.target.value)}
                />
              </div>
            </div>
            <DialogFooter>
              <Button
                onClick={() => followUp.mutate()}
                disabled={followUp.isPending || !fDate}
              >
                إرسال الطلب
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      )}
    </div>
  );
}
