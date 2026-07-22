import { createFileRoute } from "@tanstack/react-router";
import type {} from "@tanstack/react-start";

const BASE_URL = "https://bashenmedical.com";

interface SitemapEntry {
  path: string;
  lastmod?: string;
  changefreq?: "always" | "hourly" | "daily" | "weekly" | "monthly" | "yearly" | "never";
  priority?: string;
}

export const Route = createFileRoute("/sitemap.xml")({
  server: {
    handlers: {
      GET: async () => {
        const staticEntries: SitemapEntry[] = [
          { path: "/", changefreq: "weekly", priority: "1.0" },
          { path: "/about", changefreq: "monthly", priority: "0.7" },
          { path: "/complex", changefreq: "monthly", priority: "0.7" },
          { path: "/branches", changefreq: "monthly", priority: "0.8" },
          { path: "/excellence", changefreq: "monthly", priority: "0.9" },
          { path: "/specialties", changefreq: "weekly", priority: "0.9" },
          { path: "/doctors", changefreq: "weekly", priority: "0.9" },
          { path: "/book", changefreq: "weekly", priority: "0.9" },
          { path: "/reservations", changefreq: "weekly", priority: "0.8" },
          { path: "/packages", changefreq: "monthly", priority: "0.8" },
          { path: "/telemedicine", changefreq: "monthly", priority: "0.8" },
          { path: "/home-care", changefreq: "monthly", priority: "0.7" },
          { path: "/pharmacy", changefreq: "monthly", priority: "0.7" },
          { path: "/insurance", changefreq: "monthly", priority: "0.7" },
          { path: "/international-patients", changefreq: "monthly", priority: "0.6" },
          { path: "/careers", changefreq: "weekly", priority: "0.6" },
          { path: "/media/news", changefreq: "weekly", priority: "0.7" },
          { path: "/emergency", changefreq: "monthly", priority: "0.8" },
          { path: "/complaints", changefreq: "monthly", priority: "0.5" },
          { path: "/lookup", changefreq: "monthly", priority: "0.6" },
          { path: "/faq", changefreq: "monthly", priority: "0.7" },
          { path: "/contact", changefreq: "monthly", priority: "0.7" },
          { path: "/health", changefreq: "weekly", priority: "0.8" },
          { path: "/accreditations", changefreq: "monthly", priority: "0.8" },
          { path: "/corporate", changefreq: "monthly", priority: "0.6" },
          { path: "/programs", changefreq: "monthly", priority: "0.6" },
          { path: "/second-opinion", changefreq: "monthly", priority: "0.6" },
          { path: "/media/stories", changefreq: "weekly", priority: "0.7" },
          { path: "/app", changefreq: "monthly", priority: "0.5" },
          { path: "/rate", changefreq: "monthly", priority: "0.4" },
          { path: "/track", changefreq: "monthly", priority: "0.4" },
        ];

        const entries: SitemapEntry[] = [...staticEntries];

        try {
          const url =
            import.meta.env.VITE_SUPABASE_URL ||
            process.env.VITE_SUPABASE_URL ||
            process.env.SUPABASE_URL;
          const key =
            import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY ||
            process.env.VITE_SUPABASE_PUBLISHABLE_KEY ||
            process.env.SUPABASE_PUBLISHABLE_KEY ||
            process.env.SUPABASE_ANON_KEY;

          if (url && key) {
            const headers = { apikey: key };
            const [sr, dr, hr, br, ar, er, psr] = await Promise.all([
              fetch(
                `${url}/rest/v1/specialties?select=slug,created_at&is_active=eq.true&order=sort_order`,
                { headers },
              ),
              fetch(
                `${url}/rest/v1/doctors?select=slug,created_at&is_active=eq.true&slug=not.is.null&order=sort_order`,
                { headers },
              ),
              fetch(
                `${url}/rest/v1/health_articles?select=slug,updated_at,published_at&is_published=eq.true&order=published_at.desc`,
                { headers },
              ),
              fetch(
                `${url}/rest/v1/branches?select=slug,updated_at,created_at&is_active=eq.true&order=sort_order`,
                { headers },
              ),
              fetch(`${url}/rest/v1/accreditations?select=id,created_at&order=sort_order`, {
                headers,
              }),
              fetch(`${url}/rest/v1/excellence_centers?select=slug,created_at&order=sort_order`, {
                headers,
              }),
              fetch(
                `${url}/rest/v1/patient_stories?select=slug,updated_at,created_at&is_published=eq.true&order=created_at.desc`,
                { headers },
              ),
            ]);
            const specialtiesRes = sr.ok ? await sr.json() : [];
            const doctorsRes = dr.ok ? await dr.json() : [];
            const articlesRes = hr.ok ? await hr.json() : [];
            const branchesRes = br.ok ? await br.json() : [];
            const accreditationsRes = ar.ok ? await ar.json() : [];
            const excellenceRes = er.ok ? await er.json() : [];
            const storiesRes = psr.ok ? await psr.json() : [];

            for (const s of (specialtiesRes as Array<{ slug: string; created_at: string }>) ?? []) {
              entries.push({
                path: `/specialties/${encodeURIComponent(s.slug)}`,
                lastmod: s.created_at?.slice(0, 10),
                changefreq: "monthly",
                priority: "0.8",
              });
            }
            for (const d of (doctorsRes as Array<{ slug: string; created_at: string }>) ?? []) {
              entries.push({
                path: `/doctors/${encodeURIComponent(d.slug)}`,
                lastmod: d.created_at?.slice(0, 10),
                changefreq: "monthly",
                priority: "0.7",
              });
            }
            for (const a of (articlesRes as Array<{
              slug: string;
              updated_at: string;
              published_at: string | null;
            }>) ?? []) {
              entries.push({
                path: `/health/${encodeURIComponent(a.slug)}`,
                lastmod: (a.updated_at || a.published_at || "").slice(0, 10) || undefined,
                changefreq: "monthly",
                priority: "0.7",
              });
            }
            for (const b of (branchesRes as Array<{
              slug: string;
              updated_at: string | null;
              created_at: string;
            }>) ?? []) {
              entries.push({
                path: `/branches/${encodeURIComponent(b.slug)}`,
                lastmod: (b.updated_at || b.created_at || "").slice(0, 10) || undefined,
                changefreq: "monthly",
                priority: "0.8",
              });
            }
            for (const a of (accreditationsRes as Array<{ id: string; created_at: string }>) ??
              []) {
              entries.push({
                path: `/accreditations/${encodeURIComponent(a.id)}`,
                lastmod: a.created_at?.slice(0, 10),
                changefreq: "yearly",
                priority: "0.6",
              });
            }
            for (const e of (excellenceRes as Array<{ slug: string; created_at: string }>) ?? []) {
              entries.push({
                path: `/excellence/${encodeURIComponent(e.slug)}`,
                lastmod: e.created_at?.slice(0, 10),
                changefreq: "monthly",
                priority: "0.7",
              });
            }
            for (const s of (storiesRes as Array<{
              slug: string;
              updated_at: string | null;
              created_at: string;
            }>) ?? []) {
              entries.push({
                path: `/media/stories/${encodeURIComponent(s.slug)}`,
                lastmod: (s.updated_at || s.created_at || "").slice(0, 10) || undefined,
                changefreq: "monthly",
                priority: "0.6",
              });
            }
          }
        } catch (err) {
          console.error("sitemap: failed to load dynamic entries", err);
        }

        const urls = entries.map((e) =>
          [
            `  <url>`,
            `    <loc>${BASE_URL}${e.path}</loc>`,
            e.lastmod ? `    <lastmod>${e.lastmod}</lastmod>` : null,
            e.changefreq ? `    <changefreq>${e.changefreq}</changefreq>` : null,
            e.priority ? `    <priority>${e.priority}</priority>` : null,
            `  </url>`,
          ]
            .filter(Boolean)
            .join("\n"),
        );

        const xml = [
          `<?xml version="1.0" encoding="UTF-8"?>`,
          `<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">`,
          ...urls,
          `</urlset>`,
        ].join("\n");

        return new Response(xml, {
          headers: {
            "Content-Type": "application/xml; charset=utf-8",
            "Cache-Control": "public, max-age=3600",
          },
        });
      },
    },
  },
});
