/**
 * Phase 3B — Typed permission catalog.
 * Keep in sync with `public.permissions.key` (see migration 20260723112653).
 * These strings are also used verbatim in RLS policies via
 * `public.has_permission_in_branch(user, key, branch)`.
 */
export const PERMISSIONS = {
  // User & role administration
  UsersManage:            "users.manage",
  UsersRolesAssign:       "users.roles.assign",

  // Appointment lifecycle
  ApptApprove:            "appointments.approve",
  ApptCancel:             "appointments.cancel",
  ApptAssign:             "appointments.assign",
  ApptExport:             "appointments.export",

  // Patient lifecycle
  PatientsExport:         "patients.export",
  PatientsArchive:        "patients.archive",

  // Medical reports
  ReportsMedicalApprove:  "reports.medical.approve",
  ReportsMedicalExport:   "reports.medical.export",

  // Financial / operational exports
  ReportsExport:          "reports.export",
  BillingExport:          "billing.export",
  InsuranceExport:        "insurance.export",
  AuditExport:            "audit.export",

  // AI
  AiToolsUse:             "ai.tools.use",
  AiActionsExecute:       "ai.actions.execute",
} as const;

export type PermissionKey = (typeof PERMISSIONS)[keyof typeof PERMISSIONS];

export const ALL_PERMISSION_KEYS: readonly PermissionKey[] = Object.values(PERMISSIONS);
