/**
 * ui-v3 Icon system — original SVG set for Baeshen Medical.
 *
 * All icons:
 *  - Use `currentColor` so they inherit text color from CSS tokens.
 *  - Ship with viewBox 24×24 and rounded/linejoin defaults matching Lucide,
 *    so they compose cleanly next to Lucide icons already in use.
 *  - Accept `size`, `color`, `strokeWidth`, and any SVG prop.
 *
 * The `Icon` component looks up icons by name from `iconRegistry` — useful for
 * CMS-driven UIs. Direct imports (`<Stethoscope />`) also work.
 */
import * as React from "react";
import { cn } from "@/lib/utils";

export interface IconProps extends Omit<React.SVGProps<SVGSVGElement>, "color"> {
  size?: number | string;
  color?: string;
  strokeWidth?: number;
  title?: string;
}

type IconRenderer = (p: {
  strokeWidth: number;
}) => React.ReactNode;

function makeIcon(displayName: string, render: IconRenderer) {
  const Comp = React.forwardRef<SVGSVGElement, IconProps>(
    (
      { size = 24, color, strokeWidth = 2, title, className, style, "aria-hidden": ariaHidden, ...rest },
      ref,
    ) => {
      const decorative = title === undefined;
      return (
        <svg
          ref={ref}
          xmlns="http://www.w3.org/2000/svg"
          width={size}
          height={size}
          viewBox="0 0 24 24"
          fill="none"
          stroke={color ?? "currentColor"}
          strokeWidth={strokeWidth}
          strokeLinecap="round"
          strokeLinejoin="round"
          className={cn("shrink-0", className)}
          style={style}
          role={decorative ? undefined : "img"}
          aria-hidden={decorative ? (ariaHidden ?? true) : undefined}
          aria-label={decorative ? undefined : title}
          {...rest}
        >
          {title ? <title>{title}</title> : null}
          {render({ strokeWidth })}
        </svg>
      );
    },
  );
  Comp.displayName = displayName;
  return Comp;
}

/* -------------------------------------------------------------------------- */
/*  Original Baeshen icon set                                                 */
/* -------------------------------------------------------------------------- */

/** Stethoscope — medical consultations. */
export const Stethoscope = makeIcon("Stethoscope", () => (
  <>
    <path d="M6 3v6a5 5 0 0 0 10 0V3" />
    <path d="M6 3h2" />
    <path d="M14 3h2" />
    <path d="M11 14v3a4 4 0 0 0 4 4h1a3 3 0 0 0 3-3v-2" />
    <circle cx="19" cy="14" r="2" />
  </>
));

/** Appointment card — booking flows. */
export const AppointmentCard = makeIcon("AppointmentCard", () => (
  <>
    <rect x="3" y="5" width="18" height="16" rx="2" />
    <path d="M3 10h18" />
    <path d="M8 3v4" />
    <path d="M16 3v4" />
    <path d="m9 15 2 2 4-4" />
  </>
));

/** Patient — user with heart pulse. */
export const PatientHeart = makeIcon("PatientHeart", () => (
  <>
    <circle cx="12" cy="7" r="3.5" />
    <path d="M4 21v-1a6 6 0 0 1 6-6h4a6 6 0 0 1 6 6v1" />
    <path d="M9 17.5h1.5l1-1.5 1 3 1-1.5H15" />
  </>
));

/** Family — two figures connected by a heart. */
export const Family = makeIcon("Family", () => (
  <>
    <circle cx="7" cy="7" r="2.5" />
    <circle cx="17" cy="7" r="2.5" />
    <path d="M3 20v-1a4 4 0 0 1 4-4" />
    <path d="M21 20v-1a4 4 0 0 1-4-4" />
    <path d="M12 15.5c-1.4-1.2-3-2.3-3-4a2 2 0 0 1 3-1.7 2 2 0 0 1 3 1.7c0 1.7-1.6 2.8-3 4Z" />
  </>
));

/** Shield check — verified / secure. */
export const ShieldVerified = makeIcon("ShieldVerified", () => (
  <>
    <path d="M12 3 4 6v6c0 4.5 3.4 8.4 8 9 4.6-.6 8-4.5 8-9V6l-8-3Z" />
    <path d="m9 12 2 2 4-4" />
  </>
));

/** Medical report — clipboard with lines. */
export const MedicalReport = makeIcon("MedicalReport", () => (
  <>
    <rect x="5" y="3" width="14" height="18" rx="2" />
    <path d="M9 3h6v3H9z" />
    <path d="M8 12h8" />
    <path d="M8 16h5" />
    <path d="M12 8v.01" />
  </>
));

/** Prescription — Rx pill. */
export const Prescription = makeIcon("Prescription", () => (
  <>
    <path d="M7 4h4a3 3 0 0 1 0 6H7z" />
    <path d="M7 4v16" />
    <path d="m11 10 6 10" />
    <path d="m14 14 6-4" />
  </>
));

/** Lab flask. */
export const LabFlask = makeIcon("LabFlask", () => (
  <>
    <path d="M9 3h6" />
    <path d="M10 3v6L5 19a2 2 0 0 0 1.8 3h10.4a2 2 0 0 0 1.8-3L14 9V3" />
    <path d="M7.5 15h9" />
  </>
));

/** Radiology / scan — silhouette lines. */
export const Radiology = makeIcon("Radiology", () => (
  <>
    <rect x="3" y="4" width="18" height="16" rx="2" />
    <path d="M7 12h10" />
    <path d="M9 8v8" />
    <path d="M15 8v8" />
    <circle cx="12" cy="12" r="1.2" />
  </>
));

/** Home care — house with heart. */
export const HomeCare = makeIcon("HomeCare", () => (
  <>
    <path d="M3 11 12 4l9 7" />
    <path d="M5 10v10h14V10" />
    <path d="M12 17c-1.3-1-3-2-3-3.5A1.6 1.6 0 0 1 12 12a1.6 1.6 0 0 1 3 1.5c0 1.5-1.7 2.5-3 3.5Z" />
  </>
));

/** Ambulance — quick access. */
export const Ambulance = makeIcon("Ambulance", () => (
  <>
    <path d="M2 17V9a2 2 0 0 1 2-2h9v10" />
    <path d="M13 10h4l4 4v3h-2" />
    <circle cx="7" cy="18" r="2" />
    <circle cx="17" cy="18" r="2" />
    <path d="M6 12h3M7.5 10.5v3" />
  </>
));

/** Chat bubble — messaging / AI assistant. */
export const ChatBubble = makeIcon("ChatBubble", () => (
  <>
    <path d="M4 5h16a1 1 0 0 1 1 1v10a1 1 0 0 1-1 1h-9l-4 4v-4H4a1 1 0 0 1-1-1V6a1 1 0 0 1 1-1Z" />
    <path d="M8 10h8" />
    <path d="M8 13h5" />
  </>
));

/** Insurance card — card with cross. */
export const InsuranceCard = makeIcon("InsuranceCard", () => (
  <>
    <rect x="3" y="6" width="18" height="12" rx="2" />
    <path d="M7 10v4M5 12h4" />
    <path d="M14 11h4" />
    <path d="M14 14h3" />
  </>
));

/**
 * Jazan motif — signature brand mark inspired by Jazan geometric patterns.
 * A four-petal rosette inside a diamond, used as a section accent.
 */
export const JazanMark = makeIcon("JazanMark", () => (
  <>
    <path d="m12 3 9 9-9 9-9-9 9-9Z" />
    <path d="M12 8c1.5 1.5 4 2 4 4s-2.5 2.5-4 4c-1.5-1.5-4-2-4-4s2.5-2.5 4-4Z" />
    <circle cx="12" cy="12" r="1" />
  </>
));

/** RTL-aware forward arrow — resolves direction from `dir` attribute. */
export const ArrowForward = makeIcon("ArrowForward", () => (
  <g className="[[dir=rtl]_&]:-scale-x-100 origin-center">
    <path d="M5 12h14" />
    <path d="m13 6 6 6-6 6" />
  </g>
));

/* -------------------------------------------------------------------------- */
/*  Registry + unified <Icon name="..."/> lookup                              */
/* -------------------------------------------------------------------------- */

export const iconRegistry = {
  stethoscope: Stethoscope,
  "appointment-card": AppointmentCard,
  "patient-heart": PatientHeart,
  family: Family,
  "shield-verified": ShieldVerified,
  "medical-report": MedicalReport,
  prescription: Prescription,
  "lab-flask": LabFlask,
  radiology: Radiology,
  "home-care": HomeCare,
  ambulance: Ambulance,
  chat: ChatBubble,
  "insurance-card": InsuranceCard,
  "jazan-mark": JazanMark,
  "arrow-forward": ArrowForward,
} as const;

export type IconName = keyof typeof iconRegistry;

export interface UnifiedIconProps extends IconProps {
  /** Registry key — e.g. "stethoscope", "jazan-mark". */
  name: IconName;
}

/**
 * Unified <Icon /> — data-driven access to the Baeshen icon set.
 *
 * <Icon name="jazan-mark" size={32} className="text-primary" />
 * <Icon name="prescription" title="وصفة طبية" /> // accessible label
 */
export const Icon = React.forwardRef<SVGSVGElement, UnifiedIconProps>(
  ({ name, ...rest }, ref) => {
    const Cmp = iconRegistry[name];
    if (!Cmp) {
      if (typeof console !== "undefined") {
        console.warn(`[ui-v3/Icon] unknown icon name: ${name}`);
      }
      return null;
    }
    return <Cmp ref={ref} {...rest} />;
  },
);
Icon.displayName = "Icon";
