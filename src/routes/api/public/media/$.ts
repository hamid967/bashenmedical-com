/**
 * Public API — GET /api/public/media/*
 *
 * Streams a file from the private `site-media` bucket so images uploaded
 * through the owner Media Library can be embedded in public pages.
 *
 * We only serve paths that appear in `public.media_library` (defense in
 * depth: even if some object slips into the bucket outside the library
 * flow, it will not be publicly reachable through this route).
 */
import { createFileRoute } from "@tanstack/react-router";
import { z } from "zod";
import { applyRateLimit } from "@/lib/v3/rate-limit-unified.server";

const PathSchema = z
  .string()
  .min(1)
  .max(400)
  .regex(/^[^\s]+$/, "invalid_path")
  .refine((p) => !p.includes(".."), { message: "invalid_path" });

export const Route = createFileRoute("/api/public/media/$")({
  server: {
    handlers: {
      GET: async ({ params, request }) => {
        const limited = await applyRateLimit(request, { category: "reads" });
        if (limited) return limited;

        const rawPath = (params as { _splat?: string })._splat;
        const parsed = PathSchema.safeParse(rawPath);
        if (!parsed.success) return new Response("Not found", { status: 404 });
        const path = parsed.data;

        const { supabaseAdmin } = await import("@/integrations/supabase/client.server");

        // Guard: must be a known library entry.
        const { data: row } = await supabaseAdmin
          .from("media_library")
          .select("mime_type")
          .eq("storage_path", path)
          .maybeSingle();
        if (!row) return new Response("Not found", { status: 404 });

        const { data: file, error } = await supabaseAdmin.storage.from("site-media").download(path);
        if (error || !file) return new Response("Not found", { status: 404 });

        const buf = await file.arrayBuffer();
        return new Response(buf, {
          status: 200,
          headers: {
            "Content-Type": row.mime_type || file.type || "application/octet-stream",
            "Cache-Control": "public, max-age=31536000, immutable",
          },
        });
      },
    },
  },
});
