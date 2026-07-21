import { SITE_URL, CLINIC_ID } from "./localBusinessSchema";

/**
 * Reusable Medical* JSON-LD builders for leaf routes.
 * Each returns a plain object ready for JSON.stringify in `head().scripts`.
 */

type BreadcrumbItem = { name: string; path: string };

export function buildBreadcrumbSchema(items: BreadcrumbItem[]) {
  return {
    "@context": "https://schema.org",
    "@type": "BreadcrumbList",
    itemListElement: items.map((it, i) => ({
      "@type": "ListItem",
      position: i + 1,
      name: it.name,
      item: it.path.startsWith("http") ? it.path : `${SITE_URL}${it.path}`,
    })),
  };
}

/**
 * Generic MedicalWebPage schema for informational service pages.
 * Use when the page describes a medical service, program, or offering
 * but is not a specific procedure/therapy.
 */
export function buildMedicalWebPageSchema(opts: {
  name: string;
  description: string;
  url: string;
  inLanguage?: string;
  medicalAudience?: "Patient" | "Clinician";
  about?: string;
}) {
  return {
    "@context": "https://schema.org",
    "@type": "MedicalWebPage",
    "@id": opts.url,
    name: opts.name,
    description: opts.description,
    url: opts.url,
    inLanguage: opts.inLanguage ?? "ar-SA",
    isPartOf: { "@id": `${SITE_URL}/#website` },
    about: opts.about ? { "@type": "Thing", name: opts.about } : undefined,
    audience: {
      "@type": "MedicalAudience",
      audienceType: opts.medicalAudience ?? "Patient",
    },
    publisher: { "@id": CLINIC_ID },
    provider: { "@id": CLINIC_ID },
    lastReviewed: new Date().toISOString().slice(0, 10),
    reviewedBy: { "@id": CLINIC_ID },
  };
}

/**
 * MedicalProcedure / MedicalTherapy schema for specific service offerings
 * (e.g., emergency care, home care, pharmacy delivery).
 */
export function buildMedicalServiceSchema(opts: {
  name: string;
  description: string;
  url: string;
  serviceType?: string;
  procedureType?: string;
}) {
  return {
    "@context": "https://schema.org",
    "@type": "MedicalProcedure",
    "@id": `${opts.url}#service`,
    name: opts.name,
    description: opts.description,
    url: opts.url,
    procedureType: opts.procedureType ?? "https://schema.org/DiagnosticProcedure",
    performer: { "@id": CLINIC_ID },
    availableService: {
      "@type": "MedicalTherapy",
      name: opts.serviceType ?? opts.name,
    },
  };
}
