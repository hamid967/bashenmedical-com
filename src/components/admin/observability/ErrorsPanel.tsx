/**
 * E1 Observability — Client Errors panel.
 * Groups recent client_error_events by fingerprint and lets admins
 * drill into the latest samples for each group.
 */
import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { useMemo, useState } from "react";

import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { getClientErrorFingerprints, listClientErrors } from "@/lib/admin/observability.functions";

const WINDOWS = [
  { label: "1h", value: 1 },
  { label: "24h", value: 24 },
  { label: "7d", value: 24 * 7 },
];

export function ErrorsPanel() {
  const [windowHours, setWindowHours] = useState(24);
  const [selected, setSelected] = useState<string | null>(null);

  const fetchGroups = useServerFn(getClientErrorFingerprints);
  const fetchList = useServerFn(listClientErrors);

  const groupsQ = useQuery({
    queryKey: ["client-errors-groups", windowHours],
    queryFn: () => fetchGroups({ data: { windowHours } }),
    refetchInterval: 60_000,
  });

  const detailsQ = useQuery({
    queryKey: ["client-errors-list", windowHours, selected],
    queryFn: () =>
      fetchList({ data: { windowHours, limit: 50 } }).then((r) => ({
        rows: selected ? r.rows.filter((row) => row.fingerprint === selected) : r.rows,
      })),
    enabled: !!groupsQ.data,
  });

  const totals = useMemo(() => {
    const groups = groupsQ.data?.groups ?? [];
    return {
      groups: groups.length,
      events: groups.reduce((sum, g) => sum + g.count, 0),
    };
  }, [groupsQ.data]);

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div>
          <h2 className="text-lg font-semibold">Client Errors</h2>
          <p className="text-xs text-muted-foreground">
            {totals.groups} توقيع فريد · {totals.events} حدث
          </p>
        </div>
        <div className="flex gap-1">
          {WINDOWS.map((w) => (
            <Button
              key={w.value}
              size="sm"
              variant={windowHours === w.value ? "default" : "outline"}
              onClick={() => {
                setWindowHours(w.value);
                setSelected(null);
              }}
            >
              {w.label}
            </Button>
          ))}
        </div>
      </div>

      <div className="grid gap-4 lg:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle className="text-sm">التوقيعات الأعلى تكرارًا</CardTitle>
          </CardHeader>
          <CardContent className="p-0">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>الرسالة</TableHead>
                  <TableHead>المسار</TableHead>
                  <TableHead className="text-end">عدد</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {(groupsQ.data?.groups ?? []).slice(0, 25).map((g) => (
                  <TableRow
                    key={g.fingerprint}
                    className={`cursor-pointer ${selected === g.fingerprint ? "bg-muted" : ""}`}
                    onClick={() => setSelected(selected === g.fingerprint ? null : g.fingerprint)}
                  >
                    <TableCell className="max-w-[220px] truncate font-mono text-xs">
                      {g.message}
                    </TableCell>
                    <TableCell className="max-w-[140px] truncate text-xs">{g.route}</TableCell>
                    <TableCell className="text-end">
                      <Badge variant="secondary">{g.count}</Badge>
                    </TableCell>
                  </TableRow>
                ))}
                {!groupsQ.isLoading && (groupsQ.data?.groups ?? []).length === 0 && (
                  <TableRow>
                    <TableCell
                      colSpan={3}
                      className="py-8 text-center text-xs text-muted-foreground"
                    >
                      لا توجد أخطاء ضمن هذه النافذة.
                    </TableCell>
                  </TableRow>
                )}
              </TableBody>
            </Table>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="text-sm">
              {selected ? "أحداث التوقيع المحدد" : "أحدث الأحداث"}
            </CardTitle>
          </CardHeader>
          <CardContent className="p-0">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>الوقت</TableHead>
                  <TableHead>الآلية</TableHead>
                  <TableHead>الرسالة</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {(detailsQ.data?.rows ?? []).slice(0, 20).map((r) => (
                  <TableRow key={r.id}>
                    <TableCell className="text-xs tabular-nums">
                      {new Date(r.ts).toLocaleTimeString()}
                    </TableCell>
                    <TableCell className="text-xs">
                      <Badge variant="outline">{r.mechanism}</Badge>
                    </TableCell>
                    <TableCell className="max-w-[260px] truncate font-mono text-xs">
                      {r.message}
                    </TableCell>
                  </TableRow>
                ))}
                {(detailsQ.data?.rows ?? []).length === 0 && (
                  <TableRow>
                    <TableCell
                      colSpan={3}
                      className="py-8 text-center text-xs text-muted-foreground"
                    >
                      لا توجد تفاصيل.
                    </TableCell>
                  </TableRow>
                )}
              </TableBody>
            </Table>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
