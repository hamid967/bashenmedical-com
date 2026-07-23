/**
 * Global provider for V3 Command Palette.
 *
 * - Gated by `v3.admin.command_palette_v3` flag (via ai_feature_flags).
 * - Registers Cmd/Ctrl+K global shortcut when enabled.
 * - Fetches the caller's roles once (guest vs authenticated vs admin/super_admin).
 *
 * Mounted once in `src/routes/__root.tsx`. The existing AdminShellV2 palette
 * still works for admin-only power-user search (patients/doctors lookup);
 * V3 palette adds a lightweight always-on launcher for every user.
 */
import { useEffect, useMemo, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { CommandPaletteV3 } from "./CommandPaletteV3";

type Role = "admin" | "super_admin" | "editor" | "authenticated" | "guest";

async function loadEnabled(): Promise<boolean> {
  try {
    // ai_feature_flags RLS restricts SELECT to admin/super_admin; querying as
    // anon/authenticated-non-admin returns 401 noise. Skip the fetch entirely
    // for anonymous visitors — the palette is admin-gated anyway.
    const { data: sess } = await supabase.auth.getSession();
    if (!sess.session) return false;
    const { data, error } = await supabase
      .from("ai_feature_flags")
      .select("enabled")
      .eq("key", "v3.admin.command_palette_v3")
      .maybeSingle();
    if (error) return false;
    return Boolean(data?.enabled);
  } catch {
    return false;
  }
}

async function loadRoles(): Promise<Set<Role>> {
  const roles = new Set<Role>(["guest"]);
  try {
    const { data: sess } = await supabase.auth.getSession();
    if (!sess.session) return roles;
    roles.add("authenticated");
    const { data } = await supabase
      .from("user_roles")
      .select("role")
      .eq("user_id", sess.session.user.id);
    for (const row of data ?? []) {
      const r = (row as { role: string }).role;
      if (r === "admin" || r === "super_admin" || r === "editor") roles.add(r);
    }
  } catch {
    /* ignore — guest fallback */
  }
  return roles;
}

export function CommandPaletteProvider() {
  const [enabled, setEnabled] = useState(false);
  const [open, setOpen] = useState(false);
  const [roles, setRoles] = useState<Set<Role>>(() => new Set<Role>(["guest"]));

  useEffect(() => {
    let cancelled = false;
    const refresh = () => {
      void loadEnabled().then((v) => {
        if (!cancelled) setEnabled(v);
      });
      void loadRoles().then((v) => {
        if (!cancelled) setRoles(v);
      });
    };
    refresh();
    const { data: sub } = supabase.auth.onAuthStateChange((event) => {
      if (event === "SIGNED_IN" || event === "SIGNED_OUT" || event === "USER_UPDATED") {
        refresh();
      }
    });
    return () => {
      cancelled = true;
      sub.subscription.unsubscribe();
    };
  }, []);

  useEffect(() => {
    if (!enabled) return;
    function onKey(e: KeyboardEvent) {
      const mod = e.metaKey || e.ctrlKey;
      if (mod && e.key.toLowerCase() === "k") {
        e.preventDefault();
        setOpen((v) => !v);
      } else if (e.key === "Escape" && open) {
        setOpen(false);
      }
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [enabled, open]);

  const rolesMemo = useMemo(() => roles, [roles]);

  if (!enabled) return null;
  return <CommandPaletteV3 open={open} onOpenChange={setOpen} roles={rolesMemo} />;
}
