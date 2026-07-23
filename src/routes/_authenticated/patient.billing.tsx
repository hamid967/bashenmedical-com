/**
 * Phase 5 — /patient/billing — invoices + payments.
 */
import { createFileRoute } from "@tanstack/react-router";
import { queryOptions, useSuspenseQuery } from "@tanstack/react-query";
import { listMyInvoices } from "@/lib/portal/invoices.functions";
import { EmptyState, SkeletonList } from "@/components/states";
import { patientRouteStates } from "@/components/states/patient-route-states";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Receipt, ArrowLeft } from "lucide-react";

const invoicesQuery = queryOptions({
  queryKey: ["patient", "billing"],
  queryFn: () => listMyInvoices(),
  staleTime: 60_000,
});

export const Route = createFileRoute("/_authenticated/patient/billing")({
  loader: ({ context }) => context.queryClient.ensureQueryData(invoicesQuery),
  head: () => ({
    meta: [
      { title: "الفواتير والمدفوعات | بوابة المريض" },
      { name: "robots", content: "noindex, nofollow" },
    ],
  }),
  component: BillingPage,
  ...patientRouteStates({ skeleton: "list", rows: 3 }),
});

function BillingPage() {
  const { data } = useSuspenseQuery(invoicesQuery);
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const items = ((data as any)?.items ?? (Array.isArray(data) ? data : [])) as Array<{
    id: string;
    invoice_number?: string | null;
    total: number;
    currency: string;
    status: string;
    issued_at?: string;
  }>;
  return (
    <div className="space-y-4">
      <h1 className="text-xl font-bold">الفواتير والمدفوعات</h1>
      {items.length === 0 ? (
        <EmptyState title="لا توجد فواتير" description="لا توجد فواتير مسجلة على حسابك." />
      ) : (
        items.map((inv) => (
          <Card key={inv.id}>
            <CardContent className="flex items-center justify-between gap-3 p-4">
              <div className="flex items-start gap-3">
                <div className="rounded-lg bg-primary/10 p-2 text-primary">
                  <Receipt className="h-5 w-5" aria-hidden />
                </div>
                <div>
                  <div className="font-semibold">{inv.invoice_number ?? inv.id.slice(0, 8)}</div>
                  <div className="text-xs text-muted-foreground">
                    {inv.total?.toFixed?.(2) ?? inv.total} {inv.currency}
                  </div>
                </div>
              </div>
              <div className="flex items-center gap-2">
                <Badge variant="outline">{inv.status}</Badge>
                <Button size="sm" variant="outline" asChild>
                  <a href={`/portal/orders/invoice/${inv.id}`}>
                    التفاصيل
                    <ArrowLeft className="ms-1 h-3 w-3" aria-hidden />
                  </a>
                </Button>
              </div>
            </CardContent>
          </Card>
        ))
      )}
    </div>
  );
}
