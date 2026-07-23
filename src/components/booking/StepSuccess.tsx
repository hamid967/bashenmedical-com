import { useEffect, useMemo, useRef, useState } from "react";
import { Link } from "@tanstack/react-router";
import { toast } from "sonner";
import QRCode from "qrcode";
import {
  AlertCircle,
  Bell,
  Calendar as CalIcon,
  CalendarPlus,
  CheckCircle2,
  ClipboardList,
  Clock,
  Download,
  MessageCircle,
  QrCode,
} from "lucide-react";
import { useTranslation } from "react-i18next";
import { Button } from "@/components/ui/button";
import { SITE } from "@/lib/site";
import { downloadBookingConfirmationPdf } from "@/lib/booking-pdf";
import { downloadIcs, googleCalendarUrl, type ShareBooking } from "@/lib/booking-share";
import { formatArDate, type State } from "./types";
import { EmailOtpLinker } from "./EmailOtpLinker";
import { NotificationStatusChips } from "./NotificationStatusChips";

export function StepSuccess({
  lang,
  state,
  branches,
  specialties,
  doctors,
  reference,
  phone,
  email,
  onNewBooking,
}: {
  lang: "ar" | "en";
  state: State;
  branches: any[];
  specialties: any[];
  doctors: any[];
  reference: string | null;
  phone: string;
  email?: string | null;
  onNewBooking: () => void;
}) {
  const { t } = useTranslation("booking");
  const branch = branches.find((b) => b.id === state.branchId);
  const spec = specialties.find((s) => s.id === state.specialtyId);
  const doc = doctors.find((d: any) => d.id === state.doctorId);
  const timeReadable = useMemo(() => {
    if (!state.time) return "—";
    const m = /^(\d{1,2}):(\d{2})/.exec(state.time);
    if (!m) return state.time;
    const h = Number(m[1]);
    const min = m[2];
    const h12 = ((h + 11) % 12) + 1;
    const suffix = h < 12 ? t("success.amSuffix") : t("success.pmSuffix");
    return `${h12}:${min} ${suffix} (${String(h).padStart(2, "0")}:${min})`;
  }, [state.time, t]);

  const CAL_PREF_KEY = "bm.calReminderPrefs.v1";
  const [cal24h, setCal24h] = useState<boolean>(state.patient.reminder24h !== false);
  const [cal2h, setCal2h] = useState<boolean>(state.patient.reminder2h !== false);
  useEffect(() => {
    if (typeof window === "undefined") return;
    try {
      const raw = window.localStorage.getItem(CAL_PREF_KEY);
      if (!raw) return;
      const p = JSON.parse(raw) as { r24?: boolean; r2?: boolean };
      if (typeof p.r24 === "boolean") setCal24h(p.r24);
      if (typeof p.r2 === "boolean") setCal2h(p.r2);
    } catch {
      /* ignore */
    }
  }, []);
  useEffect(() => {
    if (typeof window === "undefined") return;
    try {
      window.localStorage.setItem(CAL_PREF_KEY, JSON.stringify({ r24: cal24h, r2: cal2h }));
    } catch {
      /* ignore */
    }
  }, [cal24h, cal2h]);

  const rows = [
    {
      label: t("review.branch"),
      value: branch ? (lang === "ar" ? branch.name_ar : branch.name_en) : "—",
    },
    {
      label: t("review.specialty"),
      value: spec ? (lang === "ar" ? spec.name_ar : spec.name_en) : "—",
    },
    { label: t("review.doctor"), value: doc ? (lang === "ar" ? doc.name_ar : doc.name_en) : "—" },
    { label: t("review.date"), value: formatArDate(state.date, lang) },
    { label: t("review.time"), value: timeReadable },
    { label: t("review.name"), value: state.patient.name },
    { label: t("review.phone"), value: phone },
  ];

  async function copyRef() {
    if (!reference) return;
    try {
      await navigator.clipboard.writeText(reference);
      toast.success(t("success.copyRef"));
    } catch {
      toast.error(t("success.copyFailed"));
    }
  }

  const detailsText = useMemo(() => {
    const SEP = "────────────────────────────";
    const header = t("success.detailsHeader");
    const footer = t("success.detailsFooter");
    const stamp = new Date().toLocaleString(lang === "ar" ? "ar-SA-u-ca-gregory" : "en-US", {
      year: "numeric",
      month: "long",
      day: "numeric",
      hour: "2-digit",
      minute: "2-digit",
    });

    const labelWidth = Math.max(...rows.map((r) => r.label.length));
    const pad = (s: string) => s + " ".repeat(Math.max(0, labelWidth - s.length));

    const lines: string[] = [];
    lines.push(header);
    lines.push(SEP);
    if (reference) {
      lines.push(`${t("success.reference")}: ${reference}`);
      lines.push(SEP);
    }
    for (const r of rows) lines.push(`${pad(r.label)} : ${r.value}`);
    lines.push(SEP);
    lines.push(`${t("success.detailsCopyStamp")}: ${stamp}`);
    lines.push(footer);
    return lines.join("\n");
  }, [rows, reference, lang, t]);

  async function copyAll() {
    try {
      await navigator.clipboard.writeText(detailsText);
      toast.success(t("success.copyAllDone"));
    } catch {
      toast.error(t("success.copyFailed"));
    }
  }

  async function copyRow(value: string) {
    if (!value || value === "—") return;
    try {
      await navigator.clipboard.writeText(value);
      toast.success(t("success.copied"));
    } catch {
      toast.error(t("success.copyFailed"));
    }
  }

  const phone4 = (phone.match(/\d/g) ?? []).slice(-4).join("");

  const trackUrl = useMemo(() => {
    if (typeof window === "undefined" || !reference) return "";
    const base = window.location.origin;
    const p = new URLSearchParams({ ref: reference });
    if (phone4) p.set("phone4", phone4);
    return `${base}/track?${p.toString()}`;
  }, [reference, phone4]);

  const qrCanvasRef = useRef<HTMLCanvasElement | null>(null);
  const [qrDataUrl, setQrDataUrl] = useState<string | null>(null);
  useEffect(() => {
    if (!trackUrl || !qrCanvasRef.current) return;
    QRCode.toCanvas(qrCanvasRef.current, trackUrl, {
      width: 176,
      margin: 1,
      errorCorrectionLevel: "M",
    }).catch(() => {
      /* noop */
    });
    QRCode.toDataURL(trackUrl, { width: 512, margin: 1 })
      .then(setQrDataUrl)
      .catch(() => setQrDataUrl(null));
  }, [trackUrl]);

  function downloadQr() {
    if (!qrDataUrl || !reference) return;
    const a = document.createElement("a");
    a.href = qrDataUrl;
    a.download = `booking-${reference}-qr.png`;
    document.body.appendChild(a);
    a.click();
    a.remove();
  }

  function downloadPdf() {
    if (!reference) return;
    downloadBookingConfirmationPdf({
      reference,
      patient_name: state.patient.name,
      patient_phone: phone,
      appointment_date: state.date ?? "",
      appointment_time: state.time ?? "",
      centerName: branch ? (lang === "ar" ? branch.name_ar : branch.name_en) : undefined,
      specialty: spec ? (lang === "ar" ? spec.name_ar : spec.name_en) : undefined,
      doctor_name: doc ? (lang === "ar" ? doc.name_ar : doc.name_en) : undefined,
      status: t("success.pendingReview"),
    });
  }

  const waMessage = useMemo(() => {
    const parts: string[] = [t("success.waHeader"), ""];
    if (reference) parts.push(`${t("success.waRefLabel")}: ${reference}`);
    for (const r of rows) parts.push(`${r.label}: ${r.value}`);
    if (trackUrl) parts.push("", `${t("success.waTrackLabel")}: ${trackUrl}`);
    return parts.join("\n");
  }, [rows, reference, t, trackUrl]);
  const waHref = `https://wa.me/${SITE.whatsapp}?text=${encodeURIComponent(waMessage)}`;

  return (
    <div className="max-w-xl mx-auto text-center">
      <div className="mx-auto h-20 w-20 rounded-full bg-emerald-100 dark:bg-emerald-900/30 grid place-items-center mb-4">
        <CheckCircle2 className="h-12 w-12 text-emerald-600 dark:text-emerald-400" />
      </div>
      <h2 className="text-2xl md:text-3xl font-bold">{t("success.title")}</h2>
      <p className="mt-2 text-sm text-muted-foreground">{t("success.subtitle")}</p>

      <div className="mt-4 inline-flex items-center gap-2 rounded-full border border-amber-300/60 bg-amber-50 dark:bg-amber-900/20 dark:border-amber-700/60 px-4 py-1.5 text-xs font-semibold text-amber-800 dark:text-amber-200">
        <Clock className="h-3.5 w-3.5" />
        <span>{t("success.statusLabel")}:</span>
        <span className="font-bold">{t("success.pendingReview")}</span>
      </div>
      <p className="mt-2 text-xs text-muted-foreground">{t("success.statusHint")}</p>

      {reference && (() => {
        // Two reference formats can reach this screen:
        //   • BMC-YYYYMMDD-XXXX — new atomic RPC output, the format we hand
        //     out for every new booking.
        //   • BAA-XXXX          — legacy fallback derived from the row UUID
        //     for pre-BMC rows (or a very old replay). Still valid for lookup
        //     via /booking-confirmation, but we mark it so reception knows
        //     it's not the current sequence.
        const isBmc = /^BMC-\d{8}-\d{4}$/.test(reference);
        // Split BMC into visual segments for legibility: BMC · 20260723 · 0001.
        const bmcParts = isBmc ? reference.split("-") : null;
        return (
          <div
            className={`mt-6 rounded-2xl border-2 px-6 py-6 shadow-lg ${
              isBmc
                ? "border-primary/50 bg-gradient-to-br from-primary/10 via-primary/5 to-transparent"
                : "border-dashed border-primary/40 bg-primary/5"
            }`}
            role="region"
            aria-label={t("success.reference")}
          >
            <div className="text-xs font-semibold uppercase tracking-widest text-primary/80 mb-3">
              {t("success.reference")}
            </div>
            {isBmc && bmcParts ? (
              <div className="flex flex-col items-center gap-3">
                <div
                  data-testid="booking-reference"
                  data-ref-format="bmc"
                  className="flex items-baseline justify-center gap-1.5 font-mono font-black tracking-tight text-primary select-all"
                  aria-label={reference}
                >
                  <span className="text-2xl md:text-3xl opacity-70">{bmcParts[0]}</span>
                  <span className="text-2xl md:text-3xl opacity-50">-</span>
                  <span className="text-3xl md:text-5xl">{bmcParts[1]}</span>
                  <span className="text-2xl md:text-3xl opacity-50">-</span>
                  <span className="text-3xl md:text-5xl">{bmcParts[2]}</span>
                </div>
                <div className="flex items-center gap-2">
                  <span className="inline-flex items-center gap-1 rounded-full border border-emerald-300/60 bg-emerald-50 dark:bg-emerald-900/20 dark:border-emerald-700/60 px-2.5 py-0.5 text-[11px] font-semibold text-emerald-800 dark:text-emerald-200">
                    <CheckCircle2 className="h-3 w-3" />
                    {t("success.referenceFormatNew")}
                  </span>
                  <Button variant="default" size="sm" onClick={copyRef} className="h-7 gap-1">
                    <ClipboardList className="h-4 w-4" />
                    {t("success.copy")}
                  </Button>
                </div>
              </div>
            ) : (
              <>
                <div className="flex items-center justify-center gap-3">
                  <span
                    data-testid="booking-reference"
                    data-ref-format="legacy"
                    className="text-2xl md:text-3xl font-mono font-bold tracking-wider text-primary select-all"
                  >
                    {reference}
                  </span>
                  <Button variant="outline" size="sm" onClick={copyRef} className="gap-1">
                    <ClipboardList className="h-4 w-4" />
                    {t("success.copy")}
                  </Button>
                </div>
                <div className="mt-2 flex items-center justify-center">
                  <span
                    className="inline-flex items-center gap-1 rounded-full border border-amber-300/60 bg-amber-50 dark:bg-amber-900/20 dark:border-amber-700/60 px-2 py-0.5 text-[10px] font-medium text-amber-800 dark:text-amber-200"
                    title={t("success.referenceFormatLegacyHint")}
                  >
                    {t("success.referenceFormatLegacy")}
                  </span>
                </div>
              </>
            )}
          </div>
        );
      })()}


      {reference && trackUrl && (
        <div
          data-testid="booking-qr"
          className="mt-6 rounded-xl border border-border bg-card p-4 flex flex-col sm:flex-row items-center gap-4"
        >
          <div className="shrink-0 rounded-lg bg-white p-2 border border-border">
            <canvas ref={qrCanvasRef} width={176} height={176} aria-label={t("success.qrLabel")} />
          </div>
          <div className="flex-1 min-w-0 text-start">
            <div className="text-sm font-semibold flex items-center gap-2 justify-center sm:justify-start">
              <QrCode className="h-4 w-4 text-primary" />
              {t("success.qrScan")}
            </div>
            <p className="mt-1 text-xs text-muted-foreground break-all">{trackUrl}</p>
            <div className="mt-3 flex flex-wrap gap-2 justify-center sm:justify-start">
              <Button
                variant="outline"
                size="sm"
                onClick={downloadQr}
                disabled={!qrDataUrl}
                className="gap-1"
              >
                <Download className="h-4 w-4" />
                {t("success.downloadQr")}
              </Button>
              <Button
                data-testid="booking-pdf-btn"
                variant="outline"
                size="sm"
                onClick={downloadPdf}
                className="gap-1"
              >
                <Download className="h-4 w-4" />
                {t("success.downloadPdf")}
              </Button>
            </div>
          </div>
        </div>
      )}

      {reference && state.date && state.time && (
        <div className="mt-6 rounded-xl border border-border bg-card p-4 text-start">
          <div className="text-sm font-semibold flex items-center gap-2 mb-1">
            <CalendarPlus className="h-4 w-4 text-primary" />
            {t("success.addToCalendar")}
          </div>
          <p className="text-xs text-muted-foreground mb-3">{t("success.calendarHint")}</p>
          <div className="mb-3 flex flex-wrap gap-2">
            <label className="inline-flex items-center gap-2 rounded-md border border-border bg-background px-3 py-1.5 text-xs cursor-pointer hover:bg-muted">
              <input
                type="checkbox"
                checked={cal24h}
                onChange={(e) => setCal24h(e.target.checked)}
                className="h-4 w-4 accent-primary"
              />
              <span>{t("success.reminder24hLabel")}</span>
            </label>
            <label className="inline-flex items-center gap-2 rounded-md border border-border bg-background px-3 py-1.5 text-xs cursor-pointer hover:bg-muted">
              <input
                type="checkbox"
                checked={cal2h}
                onChange={(e) => setCal2h(e.target.checked)}
                className="h-4 w-4 accent-primary"
              />
              <span>{t("success.reminder2hLabel")}</span>
            </label>
          </div>
          {(() => {
            const share: ShareBooking = {
              ref: reference,
              patient_name: state.patient.name,
              patient_phone: phone,
              appointment_date: state.date,
              appointment_time: state.time,
              doctor: doc ? (lang === "ar" ? doc.name_ar : doc.name_en) : null,
              specialty: spec ? (lang === "ar" ? spec.name_ar : spec.name_en) : null,
              reminder_24h: cal24h,
              reminder_2h: cal2h,
            };
            const eventTitle = `${SITE.nameAr}${share.doctor ? t("success.eventTitleSuffix", { doctor: share.doctor }) : t("success.eventTitleGeneric")}`;
            const previewRows: Array<{ label: string; value: string }> = [
              { label: t("success.eventTitle"), value: eventTitle },
              { label: t("review.date"), value: formatArDate(state.date, lang) },
              { label: t("review.time"), value: `${timeReadable} — ${t("success.riyadhShort")}` },
              { label: t("success.timezone"), value: t("success.timezoneValue") },
              { label: t("success.duration"), value: t("success.durationValue") },
            ];
            if (share.specialty)
              previewRows.push({ label: t("review.specialty"), value: share.specialty });
            if (share.doctor) previewRows.push({ label: t("review.doctor"), value: share.doctor });
            previewRows.push({
              label: t("success.location"),
              value: lang === "ar" ? SITE.addressAr : (SITE.addressEn ?? SITE.addressAr),
            });
            previewRows.push({ label: t("success.reference"), value: reference });
            const remindersText = [
              cal24h ? t("success.reminder24hLabel") : null,
              cal2h ? t("success.reminder2hLabel") : null,
            ]
              .filter(Boolean)
              .join(t("success.remindersJoin"));
            previewRows.push({
              label: t("success.remindersLabel"),
              value: remindersText || t("success.remindersNone"),
            });
            return (
              <>
                <div className="mb-3 rounded-lg border border-dashed border-primary/40 bg-primary/5 p-3">
                  <div className="mb-2 flex items-center justify-between gap-2">
                    <div className="text-xs font-semibold text-primary">
                      {t("success.eventPreview")}
                    </div>
                    <Button
                      variant="outline"
                      size="sm"
                      className="h-7 gap-1 text-xs"
                      onClick={async () => {
                        const shareText = [
                          eventTitle,
                          "────────────────",
                          ...previewRows
                            .filter((r) => r.label !== t("success.eventTitle"))
                            .map((r) => `${r.label}: ${r.value}`),
                          "",
                          t("success.shareContact", { phone: SITE.phoneDisplay }),
                        ].join("\n");
                        try {
                          await navigator.clipboard.writeText(shareText);
                          toast.success(t("success.copyShareDone"));
                        } catch {
                          toast.error(t("success.copyFailed"));
                        }
                      }}
                    >
                      <ClipboardList className="h-3.5 w-3.5" />
                      {t("success.copyToShare")}
                    </Button>
                  </div>
                  <dl className="grid grid-cols-[auto,1fr] gap-x-3 gap-y-1 text-xs">
                    {previewRows.map((r) => (
                      <div key={r.label} className="contents">
                        <dt className="text-muted-foreground whitespace-nowrap">{r.label}</dt>
                        <dd className="font-medium break-words">{r.value}</dd>
                      </div>
                    ))}
                  </dl>
                </div>
                <div className="flex flex-wrap gap-2">
                  <a
                    href={googleCalendarUrl(share)}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="inline-flex items-center gap-2 rounded-md bg-primary text-primary-foreground px-4 py-2 text-sm font-semibold hover:opacity-90"
                  >
                    <CalendarPlus className="h-4 w-4" />
                    {t("success.addGoogle")}
                  </a>
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => downloadIcs(share)}
                    className="gap-2"
                  >
                    <Download className="h-4 w-4" />
                    {t("success.downloadIcs")}
                  </Button>
                </div>
              </>
            );
          })()}
          <p className="mt-2 text-[11px] text-muted-foreground">{t("success.icsHint")}</p>
        </div>
      )}

      {reference &&
        state.date &&
        state.time &&
        (cal24h || cal2h) &&
        (() => {
          const [y, mo, d] = state.date.split("-").map(Number);
          const [h, mi] = state.time.split(":").map(Number);
          const apptUTC = new Date(Date.UTC(y, mo - 1, d, h - 3, mi));
          const fmt = (dt: Date) =>
            dt.toLocaleString(lang === "ar" ? "ar-SA-u-ca-gregory" : "en-US", {
              weekday: "long",
              year: "numeric",
              month: "long",
              day: "numeric",
              hour: "2-digit",
              minute: "2-digit",
              hour12: true,
              timeZone: "Asia/Riyadh",
            });
          const items: Array<{ offsetMin: number; label: string; channels: string }> = [];
          if (cal24h)
            items.push({
              offsetMin: 1440,
              label: t("success.reminder24hLabel"),
              channels: t("success.reminder24hChannels"),
            });
          if (cal2h)
            items.push({
              offsetMin: 120,
              label: t("success.reminder2hLabel"),
              channels: t("success.reminder2hChannels"),
            });
          return (
            <div className="mt-6 rounded-xl border border-border bg-card p-4 text-start">
              <div className="text-sm font-semibold flex items-center gap-2 mb-1">
                <Bell className="h-4 w-4 text-primary" />
                {t("success.reminderPreview")}
              </div>
              <p className="text-xs text-muted-foreground mb-3">
                {t("success.reminderPreviewHint")}
              </p>
              <ul className="divide-y divide-border rounded-lg border border-border overflow-hidden">
                {items.map((it) => {
                  const when = new Date(apptUTC.getTime() - it.offsetMin * 60000);
                  const past = when.getTime() < Date.now();
                  return (
                    <li
                      key={it.offsetMin}
                      className="p-3 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-1"
                    >
                      <div className="flex items-center gap-2">
                        <span
                          className={`h-2 w-2 rounded-full ${past ? "bg-muted-foreground/40" : "bg-emerald-500"}`}
                        />
                        <div>
                          <div className="text-sm font-semibold">{it.label}</div>
                          <div className="text-[11px] text-muted-foreground">{it.channels}</div>
                        </div>
                      </div>
                      <div className="text-xs tabular-nums text-muted-foreground sm:text-end">
                        {fmt(when)}
                        {past && (
                          <span className="ms-2 rounded bg-muted px-1.5 py-0.5 text-[10px] text-muted-foreground">
                            {t("success.past")}
                          </span>
                        )}
                      </div>
                    </li>
                  );
                })}
              </ul>
              <p className="mt-2 text-[11px] text-muted-foreground">
                {t("success.reminderPreviewFoot")}
              </p>
            </div>
          );
        })()}

      <div className="mt-6 flex items-center justify-between gap-2">
        <div className="text-sm font-semibold">{t("success.details")}</div>
        <Button variant="ghost" size="sm" onClick={copyAll} className="gap-1 text-primary">
          <ClipboardList className="h-4 w-4" />
          {t("success.copyAll")}
        </Button>
      </div>
      <dl className="rounded-xl border border-border divide-y divide-border overflow-hidden text-start">
        {rows.map((r) => (
          <div
            key={r.label}
            className="grid grid-cols-[1fr,2fr,auto] items-center p-3 text-sm gap-2"
          >
            <dt className="text-muted-foreground">{r.label}</dt>
            <dd className="font-medium break-words">{r.value}</dd>
            <button
              type="button"
              onClick={() => copyRow(String(r.value ?? ""))}
              aria-label={t("success.copyLabel", { label: r.label })}
              className="p-1.5 rounded hover:bg-muted text-muted-foreground hover:text-foreground transition"
            >
              <ClipboardList className="h-3.5 w-3.5" />
            </button>
          </div>
        ))}
      </dl>

      <div className="mt-6 grid gap-3 sm:grid-cols-2">
        <Link
          to="/track"
          search={{ ref: reference ?? undefined, phone4: phone4 || undefined } as never}
          className="inline-flex items-center justify-center gap-2 rounded-lg bg-primary text-primary-foreground px-4 py-3 text-sm font-bold hover:opacity-90"
        >
          <ClipboardList className="h-4 w-4" />
          {t("success.trackInMyBookings")}
        </Link>
        <Link
          to="/booking-confirmation"
          search={{ ref: reference ?? undefined, phone } as never}
          className="inline-flex items-center justify-center gap-2 rounded-lg border border-border bg-card px-4 py-3 text-sm font-bold hover:bg-muted"
        >
          <CheckCircle2 className="h-4 w-4" />
          {t("success.viewFull")}
        </Link>
      </div>

      {reference && (
        <div className="mt-6 rounded-xl border border-border bg-card p-4 text-start">
          <h3 className="text-sm font-bold mb-1">{t("success.manage")}</h3>
          <p className="text-xs text-muted-foreground mb-3">{t("success.manageHint")}</p>
          <div className="flex flex-wrap gap-2">
            <Link
              to="/lookup"
              search={{ ref: reference, phone, action: "reschedule" } as never}
              className="inline-flex items-center gap-2 rounded-md border border-primary/40 bg-primary/5 px-4 py-2 text-sm font-semibold text-primary hover:bg-primary/10"
            >
              <CalendarPlus className="h-4 w-4" />
              {t("success.reschedule")}
            </Link>
            <Link
              to="/lookup"
              search={{ ref: reference, phone, action: "cancel" } as never}
              className="inline-flex items-center gap-2 rounded-md border border-destructive/40 bg-destructive/5 px-4 py-2 text-sm font-semibold text-destructive hover:bg-destructive/10"
            >
              <AlertCircle className="h-4 w-4" />
              {t("success.cancel")}
            </Link>
          </div>
        </div>
      )}
      <div className="mt-3">
        <a
          href={waHref}
          target="_blank"
          rel="noopener noreferrer"
          className="inline-flex w-full items-center justify-center gap-2 rounded-lg bg-[#25D366] px-4 py-3 text-sm font-bold text-white hover:bg-[#1ebe5b] transition"
        >
          <MessageCircle className="h-4 w-4" />
          {t("success.waContact")}
        </a>
      </div>
      <div className="mt-3">
        <Button variant="outline" onClick={onNewBooking} className="gap-2 h-auto py-2 w-full">
          <CalIcon className="h-4 w-4" />
          {t("success.newBooking")}
        </Button>
      </div>

      {reference && <NotificationStatusChips reference={reference} phone={phone} />}

      {reference && <EmailOtpLinker email={email ?? state.patient.email ?? null} lang={lang} />}
    </div>
  );
}
