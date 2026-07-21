/**
 * Read-only hook that tells any page whether the signed-in patient has an
 * active consent of a given type. Uses the same query key as
 * /portal/consents so grants/withdrawals reflect across the app instantly.
 */
import { useQuery } from "@tanstack/react-query";
import {
  listMyConsents,
  type ConsentType,
  type ConsentView,
} from "@/lib/portal/consents.functions";

export function useMyConsents() {
  return useQuery<ConsentView[]>({
    queryKey: ["portal", "my-consents"],
    queryFn: () => listMyConsents(),
    staleTime: 30_000,
  });
}

export function useHasConsent(type: ConsentType): {
  granted: boolean;
  loading: boolean;
} {
  const q = useMyConsents();
  const view = q.data?.find((v) => v.catalog.type === type);
  return { granted: Boolean(view?.active), loading: q.isLoading };
}
