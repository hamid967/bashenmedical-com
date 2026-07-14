/**
 * HR module — employees, attendance, leave requests, payroll runs.
 */
import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { z } from "zod";

export type Employee = {
  id: string;
  user_id: string | null;
  full_name: string;
  national_id: string | null;
  phone: string | null;
  email: string | null;
  position: string | null;
  department: string | null;
  branch_id: string | null;
  monthly_salary: number;
  hire_date: string | null;
  is_active: boolean;
  notes: string | null;
  created_at: string;
  updated_at: string;
};

export type AttendanceStatus = "present" | "absent" | "late" | "leave";
export type AttendanceRecord = {
  id: string;
  employee_id: string;
  employee_name?: string | null;
  work_date: string;
  check_in: string | null;
  check_out: string | null;
  status: AttendanceStatus;
  notes: string | null;
};

export type LeaveStatus = "pending" | "approved" | "rejected" | "cancelled";
export type LeaveRequest = {
  id: string;
  employee_id: string;
  employee_name?: string | null;
  leave_type: string;
  from_date: string;
  to_date: string;
  days: number;
  status: LeaveStatus;
  reason: string | null;
  review_notes: string | null;
  reviewed_at: string | null;
  created_at: string;
};

export type PayrollStatus = "draft" | "finalized";
export type PayrollRun = {
  id: string;
  period_year: number;
  period_month: number;
  status: PayrollStatus;
  total_gross: number;
  total_net: number;
  notes: string | null;
  finalized_at: string | null;
  created_at: string;
  items?: PayrollItem[];
};

export type PayrollItem = {
  id: string;
  run_id: string;
  employee_id: string;
  employee_name?: string | null;
  base_salary: number;
  allowances: number;
  deductions: number;
  net_pay: number;
  notes: string | null;
};

/* -------- Employees -------- */
export const listEmployees = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { data, error } = await context.supabase.from("employees" as never)
      .select("*").order("full_name").limit(500);
    if (error) throw new Error(error.message);
    return (data ?? []) as unknown as Employee[];
  });

const EmpUpsert = z.object({
  id: z.string().uuid().optional(),
  full_name: z.string().min(2).max(160),
  national_id: z.string().max(30).nullable().optional(),
  phone: z.string().max(30).nullable().optional(),
  email: z.string().max(120).nullable().optional(),
  position: z.string().max(80).nullable().optional(),
  department: z.string().max(80).nullable().optional(),
  branch_id: z.string().uuid().nullable().optional(),
  monthly_salary: z.number().min(0).default(0),
  hire_date: z.string().nullable().optional(),
  is_active: z.boolean().default(true),
  notes: z.string().max(1000).nullable().optional(),
});

export const upsertEmployee = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((d: unknown) => EmpUpsert.parse(d))
  .handler(async ({ data, context }) => {
    const { id, ...rest } = data;
    if (id) {
      const { error } = await context.supabase.from("employees" as never)
        .update(rest as never).eq("id", id);
      if (error) throw new Error(error.message);
      return { ok: true, id };
    }
    const { data: row, error } = await context.supabase.from("employees" as never)
      .insert(rest as never).select("id").single();
    if (error) throw new Error(error.message);
    return { ok: true, id: (row as { id: string }).id };
  });

export const deleteEmployee = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((d: { id: string }) => z.object({ id: z.string().uuid() }).parse(d))
  .handler(async ({ data, context }) => {
    const { error } = await context.supabase.from("employees" as never)
      .update({ is_active: false } as never).eq("id", data.id);
    if (error) throw new Error(error.message);
    return { ok: true };
  });

/* -------- Attendance -------- */
const AttListInput = z.object({
  from: z.string().nullable().optional(),
  to: z.string().nullable().optional(),
  employeeId: z.string().uuid().nullable().optional(),
}).default({});

export const listAttendance = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .validator((d: unknown) => AttListInput.parse(d))
  .handler(async ({ data, context }) => {
    let q = context.supabase.from("attendance_records" as never)
      .select("*").order("work_date", { ascending: false }).limit(500);
    if (data.from) q = q.gte("work_date", data.from);
    if (data.to) q = q.lte("work_date", data.to);
    if (data.employeeId) q = q.eq("employee_id", data.employeeId);
    const { data: rows, error } = await q;
    if (error) throw new Error(error.message);
    const list = (rows ?? []) as AttendanceRecord[];
    // resolve names
    const ids = Array.from(new Set(list.map((r) => r.employee_id)));
    if (ids.length) {
      const { data: emps } = await context.supabase.from("employees" as never)
        .select("id,full_name").in("id", ids);
      const map = new Map<string, string>();
      for (const e of ((emps ?? []) as Array<{ id: string; full_name: string }>)) map.set(e.id, e.full_name);
      list.forEach((r) => { r.employee_name = map.get(r.employee_id) ?? null; });
    }
    return list;
  });

const AttUpsert = z.object({
  id: z.string().uuid().optional(),
  employee_id: z.string().uuid(),
  work_date: z.string(),
  check_in: z.string().nullable().optional(),
  check_out: z.string().nullable().optional(),
  status: z.enum(["present", "absent", "late", "leave"]).default("present"),
  notes: z.string().max(500).nullable().optional(),
});

export const upsertAttendance = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((d: unknown) => AttUpsert.parse(d))
  .handler(async ({ data, context }) => {
    const { id, ...rest } = data;
    if (id) {
      const { error } = await context.supabase.from("attendance_records" as never)
        .update(rest as never).eq("id", id);
      if (error) throw new Error(error.message);
      return { ok: true, id };
    }
    const { data: row, error } = await context.supabase.from("attendance_records" as never)
      .upsert(rest as never, { onConflict: "employee_id,work_date" } as never)
      .select("id").single();
    if (error) throw new Error(error.message);
    return { ok: true, id: (row as { id: string }).id };
  });

/* -------- Leaves -------- */
const LeaveListInput = z.object({
  status: z.enum(["pending", "approved", "rejected", "cancelled", "all"]).default("all"),
}).default({});

export const listLeaves = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .validator((d: unknown) => LeaveListInput.parse(d))
  .handler(async ({ data, context }) => {
    let q = context.supabase.from("leave_requests" as never)
      .select("*").order("created_at", { ascending: false }).limit(200);
    if (data.status !== "all") q = q.eq("status", data.status);
    const { data: rows, error } = await q;
    if (error) throw new Error(error.message);
    const list = (rows ?? []) as LeaveRequest[];
    const ids = Array.from(new Set(list.map((r) => r.employee_id)));
    if (ids.length) {
      const { data: emps } = await context.supabase.from("employees" as never)
        .select("id,full_name").in("id", ids);
      const map = new Map<string, string>();
      for (const e of ((emps ?? []) as Array<{ id: string; full_name: string }>)) map.set(e.id, e.full_name);
      list.forEach((r) => { r.employee_name = map.get(r.employee_id) ?? null; });
    }
    return list;
  });

const LeaveCreate = z.object({
  employee_id: z.string().uuid(),
  leave_type: z.string().max(30).default("annual"),
  from_date: z.string(),
  to_date: z.string(),
  reason: z.string().max(500).nullable().optional(),
});

export const createLeave = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((d: unknown) => LeaveCreate.parse(d))
  .handler(async ({ data, context }) => {
    const days = Math.max(1, Math.floor((new Date(data.to_date).getTime() - new Date(data.from_date).getTime()) / 86_400_000) + 1);
    const { data: row, error } = await context.supabase.from("leave_requests" as never)
      .insert({ ...data, days } as never).select("id").single();
    if (error) throw new Error(error.message);
    return { ok: true, id: (row as { id: string }).id };
  });

const LeaveReview = z.object({
  id: z.string().uuid(),
  status: z.enum(["approved", "rejected", "cancelled"]),
  review_notes: z.string().max(500).nullable().optional(),
});

export const reviewLeave = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((d: unknown) => LeaveReview.parse(d))
  .handler(async ({ data, context }) => {
    const { error } = await context.supabase.from("leave_requests" as never)
      .update({
        status: data.status,
        review_notes: data.review_notes ?? null,
        reviewed_by: context.userId,
        reviewed_at: new Date().toISOString(),
      } as never).eq("id", data.id);
    if (error) throw new Error(error.message);
    return { ok: true };
  });

/* -------- Payroll -------- */
export const listPayrollRuns = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { data: runs, error } = await context.supabase.from("payroll_runs" as never)
      .select("*").order("period_year", { ascending: false })
      .order("period_month", { ascending: false }).limit(24);
    if (error) throw new Error(error.message);
    const list = (runs ?? []) as PayrollRun[];
    if (list.length === 0) return list;
    const ids = list.map((r) => r.id);
    const { data: items } = await context.supabase.from("payroll_items" as never)
      .select("*").in("run_id", ids);
    const empIds = Array.from(new Set(((items ?? []) as PayrollItem[]).map((i) => i.employee_id)));
    const nameMap = new Map<string, string>();
    if (empIds.length) {
      const { data: emps } = await context.supabase.from("employees" as never)
        .select("id,full_name").in("id", empIds);
      for (const e of ((emps ?? []) as Array<{ id: string; full_name: string }>)) nameMap.set(e.id, e.full_name);
    }
    const byRun = new Map<string, PayrollItem[]>();
    for (const it of ((items ?? []) as PayrollItem[])) {
      it.employee_name = nameMap.get(it.employee_id) ?? null;
      const arr = byRun.get(it.run_id) ?? [];
      arr.push(it);
      byRun.set(it.run_id, arr);
    }
    list.forEach((r) => { r.items = byRun.get(r.id) ?? []; });
    return list;
  });

const PayrollCreate = z.object({
  period_year: z.number().int().min(2000).max(3000),
  period_month: z.number().int().min(1).max(12),
});

export const createPayrollRun = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((d: unknown) => PayrollCreate.parse(d))
  .handler(async ({ data, context }) => {
    // Insert run
    const { data: run, error } = await context.supabase.from("payroll_runs" as never)
      .insert({ period_year: data.period_year, period_month: data.period_month } as never)
      .select("id").single();
    if (error) throw new Error(error.message);
    const runId = (run as { id: string }).id;

    // Seed items from active employees
    const { data: emps } = await context.supabase.from("employees" as never)
      .select("id,monthly_salary").eq("is_active", true);
    const rows = ((emps ?? []) as Array<{ id: string; monthly_salary: number }>).map((e) => ({
      run_id: runId,
      employee_id: e.id,
      base_salary: Number(e.monthly_salary ?? 0),
      allowances: 0,
      deductions: 0,
      net_pay: Number(e.monthly_salary ?? 0),
    }));
    if (rows.length) {
      const { error: iErr } = await context.supabase.from("payroll_items" as never)
        .insert(rows as never);
      if (iErr) throw new Error(iErr.message);
    }
    await recalcRunTotals(context.supabase, runId);
    return { ok: true, id: runId };
  });

const PayrollItemUpdate = z.object({
  id: z.string().uuid(),
  allowances: z.number().min(0),
  deductions: z.number().min(0),
  notes: z.string().max(500).nullable().optional(),
});

export const updatePayrollItem = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((d: unknown) => PayrollItemUpdate.parse(d))
  .handler(async ({ data, context }) => {
    const { data: cur, error: gErr } = await context.supabase.from("payroll_items" as never)
      .select("run_id,base_salary").eq("id", data.id).single();
    if (gErr) throw new Error(gErr.message);
    const base = Number((cur as { base_salary: number }).base_salary ?? 0);
    const net = base + data.allowances - data.deductions;
    const { error } = await context.supabase.from("payroll_items" as never)
      .update({ allowances: data.allowances, deductions: data.deductions, net_pay: net, notes: data.notes ?? null } as never)
      .eq("id", data.id);
    if (error) throw new Error(error.message);
    await recalcRunTotals(context.supabase, (cur as { run_id: string }).run_id);
    return { ok: true };
  });

export const finalizePayrollRun = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((d: { id: string }) => z.object({ id: z.string().uuid() }).parse(d))
  .handler(async ({ data, context }) => {
    const { error } = await context.supabase.from("payroll_runs" as never)
      .update({ status: "finalized", finalized_by: context.userId, finalized_at: new Date().toISOString() } as never)
      .eq("id", data.id);
    if (error) throw new Error(error.message);
    return { ok: true };
  });

export const deletePayrollRun = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((d: { id: string }) => z.object({ id: z.string().uuid() }).parse(d))
  .handler(async ({ data, context }) => {
    const { error } = await context.supabase.from("payroll_runs" as never)
      .delete().eq("id", data.id);
    if (error) throw new Error(error.message);
    return { ok: true };
  });

async function recalcRunTotals(supabase: unknown, runId: string) {
  const c = supabase as {
    from: (t: string) => {
      select: (c: string) => { eq: (k: string, v: string) => Promise<{ data: Array<{ base_salary: number; allowances: number; deductions: number; net_pay: number }> | null }> };
      update: (p: Record<string, unknown>) => { eq: (k: string, v: string) => Promise<{ error: { message: string } | null }> };
    };
  };
  const { data } = await c.from("payroll_items").select("base_salary,allowances,deductions,net_pay").eq("run_id", runId);
  const rows = data ?? [];
  const gross = rows.reduce((s, r) => s + Number(r.base_salary) + Number(r.allowances), 0);
  const net = rows.reduce((s, r) => s + Number(r.net_pay), 0);
  await c.from("payroll_runs").update({ total_gross: gross, total_net: net }).eq("id", runId);
}
