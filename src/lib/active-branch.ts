import { useEffect, useState, useCallback } from "react";
import { useQuery } from "@tanstack/react-query";
import { listPublicBranches, type PublicBranch } from "@/lib/branches.functions";

const STORAGE_KEY = "admin-active-branch-id";
const CHANGE_EVENT = "admin:active-branch-change";

export type ActiveBranchState = {
  branchId: string | null;
  setBranchId: (id: string | null) => void;
  branches: PublicBranch[];
  isLoading: boolean;
  activeBranch: PublicBranch | null;
};

function readInitial(): string | null {
  if (typeof window === "undefined") return null;
  try {
    return window.localStorage.getItem(STORAGE_KEY);
  } catch {
    return null;
  }
}

/**
 * Global active-branch state shared across the admin console.
 *
 * Persists to localStorage and broadcasts a custom event so any page/panel
 * that listens can react (analytics, KPI cards, filters, etc.) without
 * prop drilling. Cross-tab sync is handled via the standard `storage` event.
 */
export function useActiveBranch(): ActiveBranchState {
  const [branchId, setBranchIdState] = useState<string | null>(null);

  // Hydrate from storage after mount to avoid SSR mismatch.
  useEffect(() => {
    setBranchIdState(readInitial());
  }, []);

  // Listen for changes from other tabs or other switcher instances.
  useEffect(() => {
    function onStorage(e: StorageEvent) {
      if (e.key === STORAGE_KEY) setBranchIdState(e.newValue);
    }
    function onCustom(e: Event) {
      const detail = (e as CustomEvent<string | null>).detail ?? null;
      setBranchIdState(detail);
    }
    window.addEventListener("storage", onStorage);
    window.addEventListener(CHANGE_EVENT, onCustom as EventListener);
    return () => {
      window.removeEventListener("storage", onStorage);
      window.removeEventListener(CHANGE_EVENT, onCustom as EventListener);
    };
  }, []);

  const { data: branches = [], isLoading } = useQuery({
    queryKey: ["public-branches"],
    queryFn: () => listPublicBranches(),
    staleTime: 5 * 60_000,
  });

  const setBranchId = useCallback((id: string | null) => {
    try {
      if (id) window.localStorage.setItem(STORAGE_KEY, id);
      else window.localStorage.removeItem(STORAGE_KEY);
    } catch {
      /* ignore */
    }
    setBranchIdState(id);
    window.dispatchEvent(new CustomEvent(CHANGE_EVENT, { detail: id }));
  }, []);

  const activeBranch = branchId ? (branches.find((b) => b.id === branchId) ?? null) : null;

  return { branchId, setBranchId, branches, isLoading, activeBranch };
}
