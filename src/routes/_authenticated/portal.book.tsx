import { createFileRoute, Link, useRouter } from "@tanstack/react-router";
import { queryOptions, useSuspenseQuery, useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useEffect, useMemo, useState } from "react";
import { toast } from "sonner";
import { z } from "zod";
import { getBookingOptions } from "@/lib/portal/booking.functions";
import { listAvailableSlots, bookSlot } from "@/lib/slots.functions";
import { getMyProfile } from "@/lib/portal/portal.functions";
import { getDependent } from "@/lib/portal/dependents.functions";
import { supabase } from "@/integrations/supabase/client";
import { Calendar } from "@/components/ui/calendar";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  CalendarCheck,
  MapPin,
  Stethoscope,
  UserRound,
  Clock,
  CheckCircle2,
  AlertTriangle,
  Loader2,
  ArrowLeft,
  RefreshCw,
} from "lucide-react";
import { ar as arLocale } from "date-fns/locale";
import { format } from "date-fns";

const optionsQuery = queryOptions({
  queryKey: ["portal", "booking", "options"],
  queryFn: () => getBookingOptions(),
  staleTime: 5 * 60_000,
});
const profileQuery = queryOptions({
  queryKey: ["portal", "my-profile"],
  queryFn: () => getMyProfile(),
  staleTime: 60_000,
});

const SearchSchema = z.object({
  forDependent: z.string().uuid().optional(),
});

export const Route = createFileRoute("/_authenticated/portal/book")({
  validateSearch: (s) => SearchSchema.parse(s),
  loader: async ({ context }) => {
    await Promise.all([
      context.queryClient.ensureQueryData(optionsQuery),
      context.queryClient.ensureQueryData(profileQuery),
    ]);
  },
  head: () => ({
    meta: [
      { title: "حجز موعد | بوابة المريض" },
      { name: "description", content: "احجز موعدك مع أطباء مجمع باعشن الطبي بسهولة." },
      { name: "robots", content: "noindex" },
    ],
  }),
  component: BookPage,
  errorComponent: BookError,
  notFoundComponent: () => null,
});

function BookError({ error, reset }: { error: Error; reset: () => void }) {
  const router = useRouter();
  return (
    <div className="glass-card max-w-md mx-auto p-8 text-center">
      <div className="mx-auto h-14 w-14 rounded-2xl grid place-items-center bg-red-50 text-red-500 mb-4">
        <AlertTriangle className="h-7 w-7" />
      </div>
      <h3 className="text-lg font-bold">تعذّر تحميل صفحة الحجز</h3>
      <p className="text-sm text-[color:var(--portal-ink-2)] mt-2 break-words">
        {error.message || "خطأ غير متوقع."}
      </p>
      <button
        onClick={() => {
          router.invalidate();
          reset();
        }}
        className="mt-5 inline-flex items-center gap-2 rounded-full px-4 h-10 text-sm font-semibold text-white"
        style={{ background: "var(--portal-gradient)" }}
      >
        <RefreshCw className="h-4 w-4" />
        إعادة المحاولة
      </button>
    </div>
  );
}

function toYMD(d: Date) {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

function BookPage() {
  const { data: options } = useSuspenseQuery(optionsQuery);
  const { data: profile } = useSuspenseQuery(profileQuery);
  const qc = useQueryClient();

  const [branchId, setBranchId] = useState<string>(profile?.default_branch_id ?? "");
  const [specialtyId, setSpecialtyId] = useState<string>("");
  const [doctorId, setDoctorId] = useState<string>("");
  const [date, setDate] = useState<Date | undefined>(undefined);
  const [slot, setSlot] = useState<string>("");
  const [slotId, setSlotId] = useState<string>("");
  const [reason, setReason] = useState("");
  const [patientName, setPatientName] = useState(profile?.full_name ?? "");
  const [patientPhone, setPatientPhone] = useState(profile?.phone ?? "");
  const [confirmed, setConfirmed] = useState<null | {
    id: string;
    date: string;
    time: string;
  }>(null);

  const doctors = useMemo(() => {
    return options.doctors.filter((d) => {
      if (branchId && d.branch_id && d.branch_id !== branchId) return false;
      if (specialtyId && d.specialty_id !== specialtyId) return false;
      return true;
    });
  }, [options.doctors, branchId, specialtyId]);

  // Reset doctor if filter changes and current doctor no longer matches
  useEffect(() => {
    if (doctorId && !doctors.some((d) => d.id === doctorId)) {
      setDoctorId("");
      setDate(undefined);
      setSlot("");
      setSlotId("");
    }
  }, [doctors, doctorId]);

  const dateStr = date ? toYMD(date) : "";

  // Slots are driven by availability_slots (single source of truth for M2)
  const slotsQ = useQuery({
    queryKey: ["portal", "booking", "avail-slots", doctorId, dateStr, branchId],
    queryFn: () =>
      listAvailableSlots({
        data: {
          doctorId,
          fromDate: dateStr,
          branchId: branchId || undefined,
        },
      }),
    enabled: Boolean(doctorId && dateStr),
    staleTime: 15_000,
  });

  const slotsView = useMemo(() => {
    const rows = slotsQ.data?.slots ?? [];
    return rows.map((r) => ({
      id: r.id,
      time: (r.start_time as unknown as string).slice(0, 5),
      available: r.status === "available",
    }));
  }, [slotsQ.data]);

  // Realtime — refresh when any slot for this doctor/day flips state
  useEffect(() => {
    if (!doctorId || !dateStr) return;
    const channel = supabase
      .channel(`avail-${doctorId}-${dateStr}`)
      .on(
        "postgres_changes",
        {
          event: "*",
          schema: "public",
          table: "availability_slots",
          filter: `doctor_id=eq.${doctorId}`,
        },
        (payload) => {
          const row: any = payload.new ?? payload.old;
          if (row?.slot_date === dateStr) {
            qc.invalidateQueries({
              queryKey: ["portal", "booking", "avail-slots", doctorId, dateStr, branchId],
            });
          }
        },
      )
      .subscribe();
    return () => {
      supabase.removeChannel(channel);
    };
  }, [doctorId, dateStr, branchId, qc]);

  const bookMut = useMutation({
    mutationFn: (payload: {
      slotId: string;
      patientName: string;
      patientPhone: string;
      reason?: string;
    }) =>
      bookSlot({
        data: {
          slotId: payload.slotId,
          patientName: payload.patientName,
          patientPhone: payload.patientPhone,
          reason: payload.reason,
          patientId: profile?.id ?? undefined,
        },
      }),
    onSuccess: (res) => {
      toast.success("تم تأكيد الحجز بنجاح");
      setConfirmed({ id: res.appointmentId, date: dateStr, time: slot });
      qc.invalidateQueries({ queryKey: ["portal", "dashboard-summary"] });
      qc.invalidateQueries({
        queryKey: ["portal", "booking", "avail-slots", doctorId, dateStr, branchId],
      });
    },
    onError: (err: any) => toast.error(err?.message ?? "تعذّر حفظ الحجز"),
  });

  const selectedDoctor = options.doctors.find((d) => d.id === doctorId);
  const selectedBranch = options.branches.find((b) => b.id === branchId);
  const selectedSpecialty = options.specialties.find((s) => s.id === specialtyId);

  function handleConfirm() {
    if (!doctorId || !dateStr || !slot || !slotId) return;
    if (!patientName.trim() || !patientPhone.trim()) {
      toast.error("الرجاء إدخال الاسم ورقم الهاتف");
      return;
    }
    bookMut.mutate({
      slotId,
      patientName: patientName.trim(),
      patientPhone: patientPhone.trim(),
      reason: reason.trim() || undefined,
    });
  }

  if (confirmed) {
    return (
      <div className="max-w-2xl mx-auto">
        <div className="glass-card p-8 text-center">
          <div className="mx-auto h-16 w-16 rounded-2xl grid place-items-center bg-emerald-50 text-emerald-600 mb-4">
            <CheckCircle2 className="h-9 w-9" />
          </div>
          <h2 className="text-2xl font-bold">تم تأكيد حجزك</h2>
          <p className="mt-2 text-[color:var(--portal-ink-2)]">
            سنرسل لك تذكيرًا قبل الموعد. يمكنك متابعة تفاصيل الحجز من الأسفل.
          </p>
          <div className="mt-6 grid gap-3 text-right">
            <SummaryRow icon={<UserRound className="h-4 w-4" />} label="الطبيب" value={selectedDoctor?.name_ar ?? "—"} />
            <SummaryRow icon={<MapPin className="h-4 w-4" />} label="الفرع" value={selectedBranch?.name_ar ?? "—"} />
            <SummaryRow
              icon={<CalendarCheck className="h-4 w-4" />}
              label="التاريخ"
              value={format(new Date(confirmed.date), "EEEE d MMMM yyyy", { locale: arLocale })}
            />
            <SummaryRow icon={<Clock className="h-4 w-4" />} label="الوقت" value={confirmed.time} />
          </div>
          <div className="mt-6 flex justify-center gap-3 flex-wrap">
            <button
              onClick={() => {
                setConfirmed(null);
                setSlot("");
                setSlotId("");
                setDate(undefined);
              }}
              className="inline-flex items-center gap-2 rounded-full px-5 h-10 text-sm font-semibold text-white"
              style={{ background: "var(--portal-gradient)" }}
            >
              حجز موعد آخر
            </button>
            <Link
              to="/portal"
              className="inline-flex items-center gap-2 rounded-full px-5 h-10 text-sm font-semibold border border-[color:var(--portal-border)] bg-white"
            >
              العودة إلى اللوحة
            </Link>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-6 pb-24 md:pb-6">
      <header className="flex items-center justify-between gap-3 flex-wrap">
        <div>
          <h1 className="text-2xl md:text-3xl font-bold">حجز موعد جديد</h1>
          <p className="text-sm text-[color:var(--portal-ink-2)] mt-1">
            اختر الفرع، التخصص، الطبيب، ثم التاريخ والوقت المناسب لك.
          </p>
        </div>
        <Link
          to="/portal"
          className="inline-flex items-center gap-2 text-sm text-[color:var(--portal-ink-2)] hover:text-[color:var(--portal-primary)]"
        >
          <ArrowLeft className="h-4 w-4" />
          العودة
        </Link>
      </header>

      {/* Filters */}
      <section className="glass-card p-4 md:p-6">
        <div className="grid gap-4 md:grid-cols-2">
          <div>
            <Label className="text-xs mb-1 block">الفرع</Label>
            <Select value={branchId || undefined} onValueChange={(v) => setBranchId(v)}>
              <SelectTrigger className="bg-white">
                <SelectValue placeholder="اختر الفرع" />
              </SelectTrigger>
              <SelectContent className="pointer-events-auto">
                {options.branches.map((b) => (
                  <SelectItem key={b.id} value={b.id}>
                    {b.name_ar} {b.city_ar ? `— ${b.city_ar}` : ""}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div>
            <Label className="text-xs mb-1 block">التخصص</Label>
            <Select value={specialtyId || undefined} onValueChange={(v) => setSpecialtyId(v)}>
              <SelectTrigger className="bg-white">
                <SelectValue placeholder="اختر التخصص" />
              </SelectTrigger>
              <SelectContent className="pointer-events-auto">
                {options.specialties.map((s) => (
                  <SelectItem key={s.id} value={s.id}>
                    {s.name_ar}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        </div>
      </section>

      {/* Doctors */}
      <section className="glass-card p-4 md:p-6">
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-lg font-bold flex items-center gap-2">
            <Stethoscope className="h-5 w-5 text-[color:var(--portal-primary)]" />
            اختر الطبيب
          </h2>
          <span className="text-xs text-[color:var(--portal-ink-2)]">
            {doctors.length} طبيب متاح
          </span>
        </div>
        {doctors.length === 0 ? (
          <p className="text-sm text-[color:var(--portal-ink-2)] py-6 text-center">
            لا يوجد أطباء مطابقون لهذا التصفية. جرّب تعديل الفرع أو التخصص.
          </p>
        ) : (
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
            {doctors.map((d) => {
              const active = d.id === doctorId;
              const initials = (d.name_ar ?? d.name_en ?? "?")
                .split(" ")
                .slice(0, 2)
                .map((s) => s[0])
                .join("");
              return (
                <button
                  key={d.id}
                  onClick={() => {
                    setDoctorId(d.id);
                    setSlot("");
                  }}
                  className={`text-right rounded-2xl border p-4 transition-all ${
                    active
                      ? "border-[color:var(--portal-primary)] bg-[color:var(--portal-primary)]/5 shadow-md"
                      : "border-[color:var(--portal-border)] bg-white hover:border-[color:var(--portal-primary)]/40"
                  }`}
                >
                  <div className="flex items-center gap-3">
                    <div className="h-12 w-12 rounded-full grid place-items-center text-white font-bold shrink-0" style={{ background: "var(--portal-gradient)" }}>
                      {d.photo_url ? (
                        <img src={d.photo_url} alt="" className="h-12 w-12 rounded-full object-cover" />
                      ) : (
                        <span>{initials}</span>
                      )}
                    </div>
                    <div className="min-w-0">
                      <div className="font-semibold truncate">{d.name_ar}</div>
                      {d.title_ar && (
                        <div className="text-xs text-[color:var(--portal-ink-2)] truncate">
                          {d.title_ar}
                        </div>
                      )}
                    </div>
                  </div>
                </button>
              );
            })}
          </div>
        )}
      </section>

      {/* Calendar + Slots */}
      {doctorId && (
        <section className="glass-card p-4 md:p-6">
          <div className="grid gap-6 lg:grid-cols-2">
            <div>
              <h2 className="text-lg font-bold flex items-center gap-2 mb-3">
                <CalendarCheck className="h-5 w-5 text-[color:var(--portal-primary)]" />
                اختر التاريخ
              </h2>
              <div className="rounded-2xl border border-[color:var(--portal-border)] bg-white p-2 inline-block pointer-events-auto">
                <Calendar
                  mode="single"
                  selected={date}
                  onSelect={(d) => {
                    setDate(d);
                    setSlot("");
                    setSlotId("");
                  }}
                  locale={arLocale}
                  dir="rtl"
                  disabled={(d) => {
                    const today = new Date();
                    today.setHours(0, 0, 0, 0);
                    const max = new Date();
                    max.setDate(max.getDate() + 60);
                    return d < today || d > max;
                  }}
                  className="pointer-events-auto"
                />
              </div>
            </div>

            <div>
              <h2 className="text-lg font-bold flex items-center gap-2 mb-3">
                <Clock className="h-5 w-5 text-[color:var(--portal-primary)]" />
                الأوقات المتاحة
                {slotsQ.isFetching && (
                  <Loader2 className="h-4 w-4 animate-spin text-[color:var(--portal-ink-2)]" />
                )}
              </h2>
              {!date ? (
                <p className="text-sm text-[color:var(--portal-ink-2)] py-6 text-center">
                  اختر تاريخًا لعرض الأوقات المتاحة.
                </p>
              ) : slotsQ.isLoading ? (
                <div className="grid grid-cols-3 sm:grid-cols-4 gap-2">
                  {Array.from({ length: 12 }).map((_, i) => (
                    <div key={i} className="h-10 rounded-xl bg-slate-100 animate-pulse" />
                  ))}
                </div>
              ) : slotsView.length > 0 ? (
                <>
                  <div className="grid grid-cols-3 sm:grid-cols-4 gap-2">
                    {slotsView.map((s) => {
                      const active = slotId === s.id;
                      return (
                        <button
                          key={s.id}
                          disabled={!s.available}
                          onClick={() => {
                            setSlotId(s.id);
                            setSlot(s.time);
                          }}
                          className={`h-10 rounded-xl text-sm font-semibold border transition-all ${
                            active
                              ? "text-white border-transparent shadow-md"
                              : s.available
                              ? "bg-white border-[color:var(--portal-border)] hover:border-[color:var(--portal-primary)] text-[color:var(--portal-ink)]"
                              : "bg-slate-50 border-transparent text-slate-400 line-through cursor-not-allowed"
                          }`}
                          style={active ? { background: "var(--portal-gradient)" } : undefined}
                        >
                          {s.time}
                        </button>
                      );
                    })}
                  </div>
                  <p className="text-xs text-[color:var(--portal-ink-2)] mt-3 flex items-center gap-2">
                    <span className="inline-block h-2 w-2 rounded-full bg-emerald-500" />
                    تُحدَّث الأوقات لحظيًا عند حجز مواعيد جديدة.
                  </p>
                </>
              ) : (
                <p className="text-sm text-[color:var(--portal-ink-2)] py-6 text-center">
                  لا توجد مواعيد متاحة في هذا اليوم. جرّب يومًا آخر.
                </p>
              )}
            </div>
          </div>
        </section>
      )}

      {/* Patient info + confirm */}
      {doctorId && date && slot && (
        <section className="glass-card p-4 md:p-6">
          <h2 className="text-lg font-bold mb-4">بيانات المريض وتأكيد الحجز</h2>
          <div className="grid gap-4 md:grid-cols-2">
            <div>
              <Label className="text-xs mb-1 block">الاسم الكامل</Label>
              <Input value={patientName} onChange={(e) => setPatientName(e.target.value)} className="bg-white" />
            </div>
            <div>
              <Label className="text-xs mb-1 block">رقم الجوال</Label>
              <Input
                value={patientPhone}
                onChange={(e) => setPatientPhone(e.target.value)}
                inputMode="tel"
                className="bg-white"
              />
            </div>
            <div className="md:col-span-2">
              <Label className="text-xs mb-1 block">سبب الزيارة (اختياري)</Label>
              <Textarea
                value={reason}
                onChange={(e) => setReason(e.target.value)}
                rows={3}
                className="bg-white"
                placeholder="مثال: متابعة، فحص دوري، شكوى محددة..."
              />
            </div>
          </div>

          <div className="mt-5 rounded-2xl bg-[color:var(--portal-primary)]/5 border border-[color:var(--portal-primary)]/15 p-4 grid gap-2 sm:grid-cols-2">
            <SummaryRow icon={<UserRound className="h-4 w-4" />} label="الطبيب" value={selectedDoctor?.name_ar ?? "—"} />
            {selectedBranch && (
              <SummaryRow icon={<MapPin className="h-4 w-4" />} label="الفرع" value={selectedBranch.name_ar} />
            )}
            {selectedSpecialty && (
              <SummaryRow icon={<Stethoscope className="h-4 w-4" />} label="التخصص" value={selectedSpecialty.name_ar} />
            )}
            <SummaryRow
              icon={<CalendarCheck className="h-4 w-4" />}
              label="التاريخ"
              value={format(date, "EEEE d MMMM yyyy", { locale: arLocale })}
            />
            <SummaryRow icon={<Clock className="h-4 w-4" />} label="الوقت" value={slot} />
          </div>

          <div className="mt-5 flex items-center justify-between flex-wrap gap-3">
            <Badge variant="outline" className="text-xs">
              الحجز مبدئي — يخضع لتأكيد الاستقبال
            </Badge>
            <Button
              size="lg"
              onClick={handleConfirm}
              disabled={bookMut.isPending}
              className="rounded-full text-white font-semibold px-6"
              style={{ background: "var(--portal-gradient)" }}
            >
              {bookMut.isPending ? (
                <>
                  <Loader2 className="h-4 w-4 ml-2 animate-spin" /> جارٍ الحفظ...
                </>
              ) : (
                "تأكيد الحجز"
              )}
            </Button>
          </div>
        </section>
      )}
    </div>
  );
}

function SummaryRow({
  icon,
  label,
  value,
}: {
  icon: React.ReactNode;
  label: string;
  value: string;
}) {
  return (
    <div className="flex items-center gap-3 text-sm">
      <span className="h-8 w-8 rounded-lg grid place-items-center bg-white text-[color:var(--portal-primary)] border border-[color:var(--portal-border)] shrink-0">
        {icon}
      </span>
      <div className="min-w-0">
        <div className="text-[11px] text-[color:var(--portal-ink-2)]">{label}</div>
        <div className="font-semibold truncate">{value}</div>
      </div>
    </div>
  );
}
