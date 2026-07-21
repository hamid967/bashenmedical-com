/**
 * Public API — POST /api/public/invoices/lookup
 *
 * After the caller has completed the shared phone-OTP flow via
 * /api/public/reservations/otp/send + verify, they pass their session_token
 * plus an invoice_number here to fetch the invoice and a short-lived signed
 * URL for the PDF. Ownership is enforced by matching the invoice's patient
 * phone (primary or secondary) against the verified session phone.
 *
 * We deliberately return a generic 404 when the invoice does not exist OR
 * the phone does not match, so this endpoint cannot be used to enumerate
 * invoice numbers.
 */
import { createFileRoute } from "@tanstack/react-router";
import { z } from "zod";
import { checkRateLimit, getClientIp } from "@/lib/rate-limit.server";
import { jsonResponse } from "@/lib/reservations-otp.server";
import { resolveGuestSession } from "@/lib/reservations-session.server";

const schema = z.object({
  session_token: z.string().min(32).max(128),
  invoice_number: z.string().trim().min(3).max(64),
});

const NOT_FOUND = {
  ok: false as const,
  message: "لم نجد فاتورة بهذا الرقم مرتبطة بجوالك.",
};

export const Route = createFileRoute("/api/public/invoices/lookup")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        let body: unknown;
        try {
          body = await request.json();
        } catch {
          return jsonResponse(400, { ok: false, message: "طلب غير صالح." });
        }
        const parsed = schema.safeParse(body);
        if (!parsed.success) {
          return jsonResponse(400, { ok: false, message: "بيانات غير صالحة." });
        }

        const ip = getClientIp(request);
        const rl = checkRateLimit(`inv-lookup:${ip}`, [
          { windowMs: 60_000, max: 15 },
          { windowMs: 3_600_000, max: 60 },
        ]);
        if (!rl.ok) {
          return new Response(
            JSON.stringify({
              ok: false,
              message: `طلبات كثيرة. حاول بعد ${rl.retryAfter} ثانية.`,
            }),
            {
              status: 429,
              headers: {
                "Content-Type": "application/json; charset=utf-8",
                "Retry-After": String(rl.retryAfter),
              },
            },
          );
        }

        const sess = await resolveGuestSession(parsed.data.session_token);
        if (!sess) {
          return jsonResponse(401, {
            ok: false,
            message: "انتهت الجلسة. أعد التحقق برقم الجوال.",
          });
        }

        try {
          const { supabaseAdmin } = await import(
            "@/integrations/supabase/client.server"
          );

          const invoiceNumber = parsed.data.invoice_number.trim();
          const { data: rows, error } = await supabaseAdmin
            .from("invoices")
            .select(
              `
                id,
                invoice_number,
                total,
                currency,
                status,
                issued_at,
                paid_at,
                pdf_path,
                notes,
                patient:patients ( phone, secondary_phone, full_name_ar, full_name_en )
              `,
            )
            .eq("invoice_number", invoiceNumber)
            .limit(1);

          if (error) {
            return jsonResponse(500, {
              ok: false,
              message: "تعذّر جلب الفاتورة.",
            });
          }
          const row = rows?.[0] as
            | {
                id: string;
                invoice_number: string | null;
                total: number;
                currency: string;
                status: string;
                issued_at: string;
                paid_at: string | null;
                pdf_path: string | null;
                notes: string | null;
                patient: {
                  phone: string | null;
                  secondary_phone: string | null;
                  full_name_ar: string | null;
                  full_name_en: string | null;
                } | null;
              }
            | undefined;

          if (!row || !row.patient) return jsonResponse(404, NOT_FOUND);

          const phones = [row.patient.phone, row.patient.secondary_phone].filter(
            Boolean,
          ) as string[];
          if (!phones.includes(sess.phone)) {
            return jsonResponse(404, NOT_FOUND);
          }

          // Signed URL for the PDF, if attached
          let pdf_url: string | null = null;
          let pdf_expires_in: number | null = null;
          if (row.pdf_path) {
            const { data: signed, error: signErr } = await supabaseAdmin
              .storage.from("invoice-pdfs")
              .createSignedUrl(row.pdf_path, 300, {
                download: `invoice-${row.invoice_number ?? row.id.slice(0, 8)}.pdf`,
              });
            if (!signErr && signed?.signedUrl) {
              pdf_url = signed.signedUrl;
              pdf_expires_in = 300;
            }
          }

          return jsonResponse(200, {
            ok: true,
            invoice: {
              id: row.id,
              invoice_number: row.invoice_number,
              total: Number(row.total),
              currency: row.currency,
              status: row.status,
              issued_at: row.issued_at,
              paid_at: row.paid_at,
              notes: row.notes,
              patient_name:
                row.patient.full_name_ar || row.patient.full_name_en || null,
              pdf_url,
              pdf_expires_in,
            },
          });
        } catch {
          return jsonResponse(500, { ok: false, message: "خطأ غير متوقع." });
        }
      },
    },
  },
});
