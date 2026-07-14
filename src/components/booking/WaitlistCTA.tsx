/**
 * WaitlistCTA — inline card on the booking wizard's time step.
 */
import { useState } from "react";
import { toast } from "sonner";
import { Bell, ChevronRight, Loader2 } from "lucide-react";
import { Link } from "@tanstack/react-router";
import { useTranslation } from "react-i18next";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";

export function WaitlistCTA({
  lang: _lang, doctorId, specialtyId, branchId, defaultName, defaultPhone, emphasized,
}: {
  lang: "ar" | "en";
  doctorId: string | null;
  specialtyId: string | null;
  branchId: string | null;
  defaultName?: string;
  defaultPhone?: string;
  emphasized?: boolean;
}) {
  const { t } = useTranslation("booking");
  const [open, setOpen] = useState(!!emphasized);
  const [name, setName] = useState(defaultName ?? "");
  const [phone, setPhone] = useState(defaultPhone ?? "");
  const [notes, setNotes] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [result, setResult] = useState<{ reference: string; duplicate?: boolean } | null>(null);
  const [error, setError] = useState<string | null>(null);

  const today = new Date();
  const from = today.toISOString().slice(0, 10);
  const to = new Date(today.getTime() + 30 * 86400_000).toISOString().slice(0, 10);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (!doctorId) return;
    setError(null); setSubmitting(true);
    try {
      const res = await fetch("/api/public/book/waitlist", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          patient_name: name.trim(),
          patient_phone: phone.trim(),
          doctor_id: doctorId,
          specialty_id: specialtyId,
          branch_id: branchId,
          preferred_from: from,
          preferred_to: to,
          notes: notes.trim() || null,
        }),
      });
      const json = await res.json();
      if (!res.ok || !json.ok) {
        setError(json.message ?? t("waitlist.failed"));
      } else {
        setResult({ reference: json.reference, duplicate: json.duplicate });
        toast.success(t("waitlist.added"));
      }
    } catch {
      setError(t("waitlist.network"));
    } finally {
      setSubmitting(false);
    }
  }

  if (!doctorId) return null;

  if (result) {
    const phone4 = (phone.match(/\d/g) ?? []).slice(-4).join("");
    return (
      <div className={`rounded-xl border p-4 md:p-5 ${emphasized ? "border-primary bg-primary/5" : "border-border bg-card"}`}>
        <div className="flex items-center gap-2 text-emerald-700 font-semibold">
          <Bell className="h-4 w-4" />
          {t("waitlist.on")}
        </div>
        <p className="mt-2 text-sm">{t("waitlist.onDesc")}</p>
        <div className="mt-2 text-lg font-mono font-bold tracking-wider">{result.reference}</div>
        <Link
          to="/waitlist"
          search={{ ref: result.reference, phone4 } as never}
          className="mt-3 inline-flex items-center gap-1 text-sm text-primary hover:underline"
        >
          {t("waitlist.viewStatus")}
          <ChevronRight className="h-4 w-4" />
        </Link>
      </div>
    );
  }

  return (
    <div className={`rounded-xl border p-4 md:p-5 ${emphasized ? "border-primary bg-primary/5" : "border-dashed border-border bg-muted/30"}`}>
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        className="w-full flex items-center justify-between gap-2 text-start"
        aria-expanded={open}
      >
        <span className="flex items-center gap-2 font-semibold text-sm">
          <Bell className="h-4 w-4 text-primary" />
          {emphasized ? t("waitlist.noSlotsWeek") : t("waitlist.noTimeJoin")}
        </span>
        <ChevronRight className={`h-4 w-4 transition ${open ? "rotate-90" : ""}`} />
      </button>

      {open && (
        <form onSubmit={submit} className="mt-4 space-y-3">
          <div className="grid gap-3 sm:grid-cols-2">
            <div>
              <Label htmlFor="wl-name">{t("waitlist.name")}</Label>
              <Input id="wl-name" required minLength={2} value={name}
                onChange={(e) => setName(e.target.value)} className="mt-1" />
            </div>
            <div>
              <Label htmlFor="wl-phone">{t("waitlist.phone")}</Label>
              <Input id="wl-phone" required inputMode="tel" value={phone}
                onChange={(e) => setPhone(e.target.value)} className="mt-1" />
            </div>
          </div>
          <div>
            <Label htmlFor="wl-notes">{t("waitlist.notes")}</Label>
            <Textarea id="wl-notes" rows={2} value={notes} maxLength={500}
              onChange={(e) => setNotes(e.target.value)} className="mt-1" />
          </div>
          <p className="text-xs text-muted-foreground">
            {t("waitlist.range", { from, to })}
          </p>
          {error && <p className="text-sm text-destructive">{error}</p>}
          <Button type="submit" disabled={submitting} className="gap-2">
            {submitting && <Loader2 className="h-4 w-4 animate-spin" />}
            {t("waitlist.join")}
          </Button>
        </form>
      )}
    </div>
  );
}
