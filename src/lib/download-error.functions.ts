/**
 * Server function: log a signed-URL download failure from the /my tabs
 * (lab reports / radiology / invoices) to the server logs so we can debug
 * download issues without asking users to reproduce.
 *
 * Called from src/routes/_authenticated/my.tsx DownloadFileButton. Errors
 * surface via `stack_modern--server-function-logs` (search: "download-error").
 *
 * Not user-critical — the client fires-and-forgets, so a failure to log must
 * never block the retry UI.
 */
import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

const DownloadErrorPayload = z.object({
  bucket: z.enum(["lab-reports", "radiology-reports", "invoice-pdfs"]),
  path: z.string().max(500),
  stage: z.enum(["sign", "head", "download", "unexpected"]),
  message: z.string().max(1000).nullable().optional(),
  httpStatus: z.number().int().nullable().optional(),
  durationMs: z.number().int().nonnegative().nullable().optional(),
  headCheckSkipped: z.boolean().optional(),
  attempt: z.number().int().positive().max(50).optional(),
  clientTimestamp: z.string().datetime().optional(),
});

export type DownloadErrorReport = z.infer<typeof DownloadErrorPayload>;

export const logDownloadError = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((input: unknown) => DownloadErrorPayload.parse(input))
  .handler(async ({ data, context }) => {
    // Structured single-line JSON so log search + parsing stays simple.
    // Namespaced with a stable prefix so it's easy to grep in worker logs.
    const record = {
      tag: "download-error",
      userId: context.userId,
      bucket: data.bucket,
      path: data.path,
      stage: data.stage,
      httpStatus: data.httpStatus ?? null,
      durationMs: data.durationMs ?? null,
      headCheckSkipped: data.headCheckSkipped ?? false,
      attempt: data.attempt ?? 1,
      message: data.message ?? null,
      clientTimestamp: data.clientTimestamp ?? null,
      serverTimestamp: new Date().toISOString(),
    };
    console.error(`[download-error] ${JSON.stringify(record)}`);
    return { ok: true as const };
  });
