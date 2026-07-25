import { useEffect, useState, useCallback } from "react";
import { useQuery } from "@tanstack/react-query";
import { listMyOrganizations, type OrganizationRow } from "@/lib/organizations.functions";

const STORAGE_KEY = "admin-active-tenant-id";
const CHANGE_EVENT = "admin:active-tenant-change";

export type ActiveTenantState = {
  tenantId: string | null;
  setTenantId: (id: string | null) => void;
  organizations: OrganizationRow[];
  isLoading: boolean;
  activeOrganization: OrganizationRow | null;
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
 * Global active-tenant state for the admin console (multi-tenant).
 * Persists to localStorage and broadcasts a custom event so any page
 * filtering by `organization_id` can react without prop drilling.
 */
export function useActiveTenant(): ActiveTenantState {
  const [tenantId, setTenantIdState] = useState<string | null>(null);

  useEffect(() => {
    setTenantIdState(readInitial());
  }, []);

  useEffect(() => {
    function onStorage(e: StorageEvent) {
      if (e.key === STORAGE_KEY) setTenantIdState(e.newValue);
    }
    function onCustom(e: Event) {
      const detail = (e as CustomEvent<string | null>).detail ?? null;
      setTenantIdState(detail);
    }
    window.addEventListener("storage", onStorage);
    window.addEventListener(CHANGE_EVENT, onCustom as EventListener);
    return () => {
      window.removeEventListener("storage", onStorage);
      window.removeEventListener(CHANGE_EVENT, onCustom as EventListener);
    };
  }, []);

  const { data: organizations = [], isLoading } = useQuery({
    queryKey: ["my-organizations"],
    queryFn: () => listMyOrganizations(),
    staleTime: 5 * 60_000,
  });

  const setTenantId = useCallback((id: string | null) => {
    try {
      if (id) window.localStorage.setItem(STORAGE_KEY, id);
      else window.localStorage.removeItem(STORAGE_KEY);
    } catch {
      /* ignore */
    }
    setTenantIdState(id);
    window.dispatchEvent(new CustomEvent(CHANGE_EVENT, { detail: id }));
  }, []);

  const activeOrganization = tenantId
    ? (organizations.find((o) => o.id === tenantId) ?? null)
    : null;

  return { tenantId, setTenantId, organizations, isLoading, activeOrganization };
}
