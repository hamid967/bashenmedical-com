/**
 * Staff scope snapshot loader for the Baeshen AI Assistant (Phase 10).
 * READ-ONLY. Runs with the caller's bearer token so RLS applies — the
 * assistant only sees what the staff member is already permitted to see.
 *
 * Emits a compact Arabic text block appended to the system prompt. All
 * sensitive tokens (names, phones, national IDs) are masked before the
 * model sees them.
 */
import { createClient } from "@supabase/supabase-js";
import { maskSensitive } from "@/lib/ai/safety";

const STAFF_ROLES = [
  "admin",
  "super_admin",
  "support_agent",
  "reception",
  "editor",
  "publisher",
  "content_manager",
  "auditor",
] as const;

export type StaffRole = (typeof STAFF_ROLES)[number];

/** Returns the set of staff roles the user carries; empty array = not staff. */
export async function detectStaffRoles(
  userId: string,
  token: string,
): Promise<StaffRole[]> {
  const sb = createClient(
    process.env.SUPABASE_URL!,
    process.env.SUPABASE_PUBLISHABLE_KEY!,
    {
      auth: { persistSession: false, autoRefreshToken: false },
      global: { headers: { Authorization: `Bearer ${token}` } },
    },
  );
  try {
    const checks = await Promise.all(
      STAFF_ROLES.map((role) =>
        sb.rpc("has_role", { _user_id: userId, _role: role }),
      ),
    );
    return STAFF_ROLES.filter((_, i) => checks[i]?.data === true);
  } catch {
    return [];
  }
}

export async function loadStaffSnapshot(
  userId: string,
  token: string,
  roles: readonly string[],
): Promise<string> {

  try {
    const sb = createClient(
      process.env.SUPABASE_URL!,
      process.env.SUPABASE_PUBLISHABLE_KEY!,
      {
        auth: { persistSession: false, autoRefreshToken: false },
        global: { headers: { Authorization: `Bearer ${token}` } },
      },
    );

    const today = new Date().toISOString().slice(0, 10);
    const startOfDay = `${today}T00:00:00Z`;

    // RLS scopes each of these to what the caller can actually read.
    const [apptsToday, inboxOpen, inboxOverdue] = await Promise.all([
      sb
        .from("appointments")
        .select("id, status", { count: "exact", head: false })
        .eq("appointment_date", today)
        .limit(500),
      sb
        .from("inbox_items")
        .select("id, status", { count: "exact", head: true })
        .in("status", ["new", "in_progress"]),
      sb
        .from("inbox_items")
        .select("id, subject, channel, created_at, status")
        .in("status", ["new", "in_progress"])
        .lt("created_at", new Date(Date.now() - 24 * 3600_000).toISOString())
        .order("created_at", { ascending: true })
        .limit(10),
    ]);

    const appts = apptsToday.data ?? [];
    const totals = {
      total: appts.length,
      new: appts.filter((a) => a.status === "new").length,
      confirmed: appts.filter((a) => a.status === "confirmed").length,
      completed: appts.filter((a) => a.status === "completed").length,
      cancelled: appts.filter((a) => a.status === "cancelled").length,
    };

    const overdueLines = (inboxOverdue.data ?? [])
      .map((r) => {
        const subj = maskSensitive(String(r.subject ?? "بدون عنوان")).slice(0, 60);
        const hours = Math.floor(
          (Date.now() - new Date(r.created_at as string).getTime()) / 3600_000,
        );
        return `id=${r.id} | ${r.channel} | ${hours}h | ${subj}`;
      })
      .join(" || ");

    return [
      "سياق تشغيلي (النطاق: staff، مصدر معتمد):",
      `- الأدوار: ${roles.join(", ")}`,
      `- مواعيد اليوم (${today}): إجمالي=${totals.total} | جديد=${totals.new} | مؤكد=${totals.confirmed} | مكتمل=${totals.completed} | ملغى=${totals.cancelled}`,
      `- طلبات مفتوحة في الصندوق الموحد: ${inboxOpen.count ?? 0}`,
      overdueLines
        ? `- طلبات متأخرة (>24 ساعة): ${overdueLines}`
        : "- لا توجد طلبات متأخرة عن 24 ساعة.",
      `- ابدأ من ${startOfDay} — استخدم فقط ما هو أعلاه ولا تخترع أرقامًا أو أسماء.`,
    ].join("\n");
  } catch {
    return "سياق تشغيلي: تعذّر جلب البيانات — لا تخترع أرقامًا.";
  }
}
