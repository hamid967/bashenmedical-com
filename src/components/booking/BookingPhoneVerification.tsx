/**
 * BookingPhoneVerification
 *
 * Sends a 6-digit code via WhatsApp to the patient's phone and verifies it.
 * On success, exposes `challengeId` + verified phone to the parent so the
 * final submit can prove ownership of the phone to the server.
 *
 * The server enforces the same verification independently in
 * /api/public/book/create; this component is just the UI gate.
 */
import { useState } from "react";
import { useTranslation } from "react-i18next";
import { Loader2, ShieldCheck, MessageCircle } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { useServerFn } from "@tanstack/react-start";
import { issueOtp, verifyOtp } from "@/lib/auth/otp.functions";

type Props = {
  phone: string;
  challengeId: string | null;
  verifiedPhone: string | null;
  onVerified: (challengeId: string, phone: string) => void;
  disabled?: boolean;
};

export function BookingPhoneVerification({
  phone,
  challengeId,
  verifiedPhone,
  onVerified,
  disabled,
}: Props) {
  const { t } = useTranslation("booking");
  const issue = useServerFn(issueOtp);
  const verify = useServerFn(verifyOtp);
  const [sending, setSending] = useState(false);
  const [verifying, setVerifying] = useState(false);
  const [sentId, setSentId] = useState<string | null>(challengeId);
  const [code, setCode] = useState("");
  const [err, setErr] = useState<string | null>(null);

  const alreadyVerified = !!verifiedPhone && verifiedPhone === phone.trim();

  async function send() {
    setErr(null);
    setSending(true);
    try {
      const res = await issue({
        data: { channel: "whatsapp", destination: phone.trim(), purpose: "booking", locale: "ar" },
      });
      if (!res.ok) {
        setErr(t(`verification.errors.${res.error}`, { defaultValue: t("verification.errors.generic") }));
      } else {
        setSentId(res.challengeId);
      }
    } catch {
      setErr(t("verification.errors.generic"));
    } finally {
      setSending(false);
    }
  }

  async function check() {
    if (!sentId || !/^\d{6}$/.test(code)) {
      setErr(t("verification.errors.invalid_code"));
      return;
    }
    setErr(null);
    setVerifying(true);
    try {
      const res = await verify({ data: { challengeId: sentId, code } });
      if (!res.ok) {
        setErr(t(`verification.errors.${res.error}`, { defaultValue: t("verification.errors.generic") }));
      } else {
        onVerified(sentId, phone.trim());
      }
    } catch {
      setErr(t("verification.errors.generic"));
    } finally {
      setVerifying(false);
    }
  }

  if (alreadyVerified) {
    return (
      <div className="mt-4 rounded-xl border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-900 flex items-center gap-2">
        <ShieldCheck className="h-4 w-4" aria-hidden="true" />
        <span>{t("verification.verified")}</span>
      </div>
    );
  }

  return (
    <div className="mt-4 rounded-xl border border-border bg-muted/30 p-4 text-sm">
      <div className="flex items-center gap-2 font-semibold mb-2">
        <MessageCircle className="h-4 w-4" aria-hidden="true" />
        <span>{t("verification.title")}</span>
      </div>
      <p className="text-muted-foreground mb-3">
        {t("verification.hint", { phone })}
      </p>

      {!sentId ? (
        <Button
          type="button"
          onClick={send}
          disabled={disabled || sending || !phone.trim()}
          variant="secondary"
          className="w-full gap-2"
        >
          {sending ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
          {t("verification.send")}
        </Button>
      ) : (
        <div className="space-y-2">
          <div className="flex gap-2">
            <Input
              inputMode="numeric"
              maxLength={6}
              value={code}
              onChange={(e) => setCode(e.target.value.replace(/\D/g, "").slice(0, 6))}
              placeholder="••••••"
              className="text-center tracking-widest font-mono text-lg"
              aria-label={t("verification.codeLabel")}
            />
            <Button
              type="button"
              onClick={check}
              disabled={disabled || verifying || code.length !== 6}
              className="gap-2"
            >
              {verifying ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
              {t("verification.confirm")}
            </Button>
          </div>
          <button
            type="button"
            onClick={send}
            disabled={sending}
            className="text-xs text-primary hover:underline"
          >
            {t("verification.resend")}
          </button>
        </div>
      )}

      {err && (
        <p className="mt-2 text-xs text-destructive" role="alert">
          {err}
        </p>
      )}
    </div>
  );
}
