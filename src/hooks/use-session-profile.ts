import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";

export type SessionProfile = {
  userId: string;
  email: string | null;
  full_name: string | null;
  phone: string | null;
  national_id: string | null;
  gender: "male" | "female" | null;
} | null;

/**
 * Lightweight client-side session + profile snapshot for public routes
 * (e.g. /reservations) that want to prefill forms and offer a portal link
 * when the visitor is signed in.
 */
export function useSessionProfile() {
  const [state, setState] = useState<{ loading: boolean; profile: SessionProfile }>({
    loading: true,
    profile: null,
  });

  useEffect(() => {
    let cancelled = false;

    async function loadFor(userId: string, email: string | null) {
      const { data } = await supabase
        .from("profiles")
        .select("full_name, phone, national_id, gender")
        .eq("id", userId)
        .maybeSingle();
      if (cancelled) return;
      setState({
        loading: false,
        profile: {
          userId,
          email,
          full_name: data?.full_name ?? null,
          phone: data?.phone ?? null,
          national_id: data?.national_id ?? null,
          gender: (data?.gender as "male" | "female" | null) ?? null,
        },
      });
    }

    supabase.auth.getSession().then(({ data }) => {
      const s = data.session;
      if (!s) {
        if (!cancelled) setState({ loading: false, profile: null });
        return;
      }
      void loadFor(s.user.id, s.user.email ?? null);
    });

    const { data: sub } = supabase.auth.onAuthStateChange((event, session) => {
      if (event !== "SIGNED_IN" && event !== "SIGNED_OUT" && event !== "USER_UPDATED") return;
      if (!session) {
        setState({ loading: false, profile: null });
        return;
      }
      void loadFor(session.user.id, session.user.email ?? null);
    });

    return () => {
      cancelled = true;
      sub.subscription.unsubscribe();
    };
  }, []);

  return state;
}
