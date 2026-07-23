/**
 * Active-subject context for the patient portal.
 *
 * Lets the signed-in guardian switch between acting on their own account
 * and acting on behalf of one of their verified dependents. The selection
 * is persisted per user in localStorage so it survives reloads and route
 * changes within /patient.
 *
 * This is a UI/session concern only — server functions still enforce
 * authorization based on the authenticated user and RLS on `dependents`.
 * Pages that want to scope reads/actions to the active dependent should
 * call `useActiveSubject()` and pass `subject.dependentId` explicitly.
 */
import * as React from "react";
import { useQuery } from "@tanstack/react-query";
import { listDependents, type Dependent } from "@/lib/portal/dependents.functions";

export type ActiveSubject =
  | { kind: "self"; id: string; name: string }
  | { kind: "dependent"; id: string; name: string; dependent: Dependent };

type Ctx = {
  subject: ActiveSubject;
  dependents: Dependent[];
  isLoading: boolean;
  setSubject: (next: { kind: "self" } | { kind: "dependent"; id: string }) => void;
};

const ActiveSubjectContext = React.createContext<Ctx | null>(null);

function storageKey(userId: string) {
  return `bmc:patient:active-subject:${userId}`;
}

export function ActiveSubjectProvider({
  userId,
  selfName,
  children,
}: {
  userId: string;
  selfName: string;
  children: React.ReactNode;
}) {
  const dependentsQuery = useQuery({
    queryKey: ["patient", "dependents", "for-switcher"],
    queryFn: () => listDependents(),
    staleTime: 60_000,
  });

  const verifiedDependents = React.useMemo(
    () => (dependentsQuery.data ?? []).filter((d) => d.verified),
    [dependentsQuery.data],
  );

  const [rawSelection, setRawSelection] = React.useState<
    { kind: "self" } | { kind: "dependent"; id: string }
  >({ kind: "self" });

  // Hydrate from localStorage after mount (avoids SSR mismatch).
  React.useEffect(() => {
    if (typeof window === "undefined") return;
    try {
      const raw = window.localStorage.getItem(storageKey(userId));
      if (!raw) return;
      const parsed = JSON.parse(raw);
      if (parsed?.kind === "dependent" && typeof parsed.id === "string") {
        setRawSelection({ kind: "dependent", id: parsed.id });
      }
    } catch {
      /* ignore */
    }
  }, [userId]);

  const setSubject = React.useCallback<Ctx["setSubject"]>(
    (next) => {
      setRawSelection(next);
      if (typeof window !== "undefined") {
        try {
          window.localStorage.setItem(storageKey(userId), JSON.stringify(next));
        } catch {
          /* ignore */
        }
      }
    },
    [userId],
  );

  // If the persisted dependent is no longer verified/accessible, fall back to self.
  const subject: ActiveSubject = React.useMemo(() => {
    if (rawSelection.kind === "dependent") {
      const dep = verifiedDependents.find((d) => d.id === rawSelection.id);
      if (dep) {
        return { kind: "dependent", id: dep.id, name: dep.full_name, dependent: dep };
      }
    }
    return { kind: "self", id: userId, name: selfName };
  }, [rawSelection, verifiedDependents, userId, selfName]);

  const value = React.useMemo<Ctx>(
    () => ({
      subject,
      dependents: verifiedDependents,
      isLoading: dependentsQuery.isLoading,
      setSubject,
    }),
    [subject, verifiedDependents, dependentsQuery.isLoading, setSubject],
  );

  return (
    <ActiveSubjectContext.Provider value={value}>{children}</ActiveSubjectContext.Provider>
  );
}

export function useActiveSubject(): Ctx {
  const ctx = React.useContext(ActiveSubjectContext);
  if (!ctx) {
    throw new Error("useActiveSubject must be used within <ActiveSubjectProvider>");
  }
  return ctx;
}
