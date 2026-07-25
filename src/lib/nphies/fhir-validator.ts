/**
 * Minimal FHIR R4 validator for NPHIES CoverageEligibilityRequest / Response.
 *
 * This is intentionally *not* a full FHIR validator — it enforces the fields
 * NPHIES requires so that malformed payloads are caught before we spend a
 * round-trip, and so responses that don't match the contract downgrade
 * gracefully instead of throwing raw JS errors up the stack.
 *
 * Returns a list of human-readable issues; empty = valid.
 */

export type FhirIssue = {
  severity: "error" | "warning";
  path: string;
  message: string;
};

export interface CoverageEligibilityRequestLike {
  resourceType?: string;
  status?: string;
  purpose?: string[];
  patient?: { identifier?: { value?: string } };
  insurance?: Array<{ coverage?: { identifier?: { value?: string } } }>;
  provider?: { identifier?: { value?: string } };
  servicedDate?: string;
}

export function validateEligibilityRequest(payload: unknown): FhirIssue[] {
  const issues: FhirIssue[] = [];
  const p = (payload ?? {}) as CoverageEligibilityRequestLike;

  if (p.resourceType !== "CoverageEligibilityRequest") {
    issues.push({
      severity: "error",
      path: "resourceType",
      message: "resourceType must be 'CoverageEligibilityRequest'",
    });
  }
  if (p.status !== "active") {
    issues.push({
      severity: "error",
      path: "status",
      message: "status must be 'active'",
    });
  }
  if (!Array.isArray(p.purpose) || p.purpose.length === 0) {
    issues.push({
      severity: "error",
      path: "purpose",
      message:
        "purpose must include at least one of validation|benefits|discovery|auth-requirements",
    });
  }
  const patientId = p.patient?.identifier?.value?.trim();
  if (!patientId) {
    issues.push({
      severity: "warning",
      path: "patient.identifier.value",
      message: "patient national id is empty — NPHIES may reject the request",
    });
  }
  const memberId = p.insurance?.[0]?.coverage?.identifier?.value?.trim();
  if (!memberId) {
    issues.push({
      severity: "warning",
      path: "insurance[0].coverage.identifier.value",
      message: "member/policy identifier is empty",
    });
  }
  const providerId = p.provider?.identifier?.value?.trim();
  if (!providerId) {
    issues.push({
      severity: "error",
      path: "provider.identifier.value",
      message: "provider identifier is required",
    });
  }
  if (p.servicedDate && !/^\d{4}-\d{2}-\d{2}$/.test(p.servicedDate)) {
    issues.push({
      severity: "warning",
      path: "servicedDate",
      message: "servicedDate should be ISO date (YYYY-MM-DD)",
    });
  }
  return issues;
}

export interface CoverageEligibilityResponseLike {
  resourceType?: string;
  outcome?: string;
  disposition?: string;
  insurance?: Array<{
    inforce?: boolean;
    coverage?: { classification?: string };
    item?: Array<{
      unitPrice?: { value?: number };
      benefit?: Array<{ allowedUnsignedInt?: number }>;
    }>;
  }>;
}

export function validateEligibilityResponse(payload: unknown): FhirIssue[] {
  const issues: FhirIssue[] = [];
  const p = (payload ?? {}) as CoverageEligibilityResponseLike;

  if (p.resourceType !== "CoverageEligibilityResponse") {
    issues.push({
      severity: "error",
      path: "resourceType",
      message: `expected 'CoverageEligibilityResponse', got '${p.resourceType ?? "missing"}'`,
    });
  }
  if (!p.outcome || !["queued", "complete", "error", "partial"].includes(p.outcome)) {
    issues.push({
      severity: "error",
      path: "outcome",
      message: "outcome must be one of queued|complete|error|partial",
    });
  }
  if (!Array.isArray(p.insurance) || p.insurance.length === 0) {
    issues.push({
      severity: "warning",
      path: "insurance",
      message: "no insurance array — coverage details will be null",
    });
  }
  return issues;
}

export function summarizeIssues(issues: FhirIssue[]): string | null {
  if (issues.length === 0) return null;
  return issues.map((i) => `[${i.severity}] ${i.path}: ${i.message}`).join("; ");
}
