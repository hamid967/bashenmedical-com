import { SITE } from "./site";
import type { ClinicSettings } from "./clinicSettings";

export const SITE_URL = "https://bashenmedical.com";
export const CLINIC_ID = `${SITE_URL}/#clinic`;

type SchemaOpts = {
  /** Absolute URL of the page emitting the schema. Sets `url`. */
  pageUrl: string;
  /** Clinic settings pulled from the database. Falls back to compile-time SITE. */
  settings?: ClinicSettings | null;
  /** Extra @type entries to add alongside MedicalClinic + LocalBusiness (e.g. "Place"). */
  extraTypes?: string[];
  /** Optional amenity list for the clinic (Place feature). */
  amenities?: { name: string; value?: boolean | string }[];
};

/**
 * Canonical MedicalClinic + LocalBusiness JSON-LD for Baeshen Medical Complex.
 * A single @id is reused across every page so Google treats them as the same entity.
 * Values come from `clinic_settings` (DB); SITE constants act as a safety fallback.
 */
export function buildLocalBusinessSchema({
  pageUrl,
  settings,
  extraTypes = [],
  amenities,
}: SchemaOpts) {
  const s = settings;
  const nameAr = s?.name_ar ?? SITE.nameAr;
  const nameEn = s?.name_en ?? SITE.nameEn;
  const phone = s?.phone ?? SITE.phone;
  const mobile = s?.mobile ?? SITE.mobile;
  const email = s?.email ?? SITE.email;
  const streetAddress = s?.street_address ?? "King Abdulaziz Rd, Al-Dhabya";
  const addressLocality = s?.address_locality ?? "Sabya";
  const addressRegion = s?.address_region ?? "Jazan";
  const postalCode = s?.postal_code ?? SITE.postalCode;
  const addressCountry = s?.address_country ?? "SA";
  const lat = s?.lat ?? SITE.lat;
  const lng = s?.lng ?? SITE.lng;
  const mapsUrl = s?.maps_url ?? SITE.mapsUrl;
  const priceRange = s?.price_range ?? "$$";
  const currencies = s?.currencies_accepted ?? "SAR";
  const payment = s?.payment_accepted ?? "Cash, Credit Card, Mada, Insurance";
  const specialties = s?.medical_specialties?.length
    ? s.medical_specialties
    : [
        "Cardiovascular",
        "Dermatology",
        "Pediatric",
        "Obstetric",
        "Dentistry",
        "InternalMedicine",
        "Ophthalmologic",
        "Otolaryngologic",
        "Orthopedic",
      ];
  const sameAs = s?.same_as?.length ? s.same_as : [SITE.instagram, SITE.tiktok, SITE.x];
  const hours = s?.opening_hours?.length
    ? s.opening_hours
    : [
        {
          days: ["Saturday", "Sunday", "Monday", "Tuesday", "Wednesday", "Thursday"],
          opens: "09:00",
          closes: "23:00",
        },
        { days: ["Friday"], opens: "16:00", closes: "23:00" },
      ];

  const base: Record<string, unknown> = {
    "@context": "https://schema.org",
    "@type": ["MedicalClinic", "LocalBusiness", ...extraTypes],
    "@id": CLINIC_ID,
    name: nameAr,
    alternateName: nameEn,
    url: pageUrl,
    telephone: phone,
    email,
    image: `${SITE_URL}/og-image.jpg`,
    priceRange,
    currenciesAccepted: currencies,
    paymentAccepted: payment,
    medicalSpecialty: specialties,
    address: {
      "@type": "PostalAddress",
      streetAddress,
      addressLocality,
      addressRegion,
      postalCode,
      addressCountry,
    },
    geo: { "@type": "GeoCoordinates", latitude: lat, longitude: lng },
    hasMap: mapsUrl,
    areaServed: [
      { "@type": "City", name: addressLocality },
      { "@type": "AdministrativeArea", name: `${addressRegion} Region` },
    ],
    openingHoursSpecification: hours.map((h) => ({
      "@type": "OpeningHoursSpecification",
      dayOfWeek: h.days.length === 1 ? h.days[0] : h.days,
      opens: h.opens,
      closes: h.closes,
    })),
    sameAs,
    contactPoint: [
      {
        "@type": "ContactPoint",
        telephone: phone,
        contactType: "reservations",
        areaServed: "SA",
        availableLanguage: ["Arabic", "English"],
      },
      ...(mobile
        ? [
            {
              "@type": "ContactPoint",
              telephone: mobile,
              contactType: "customer service",
              areaServed: "SA",
              availableLanguage: ["Arabic", "English"],
            },
          ]
        : []),
    ],
    isAcceptingNewPatients: true,
    potentialAction: [
      {
        "@type": "ReserveAction",
        name: "حجز موعد مع طبيب",
        target: {
          "@type": "EntryPoint",
          urlTemplate: "https://bashenmedical.com/book",
          inLanguage: ["ar-SA", "en"],
          actionPlatform: [
            "https://schema.org/DesktopWebPlatform",
            "https://schema.org/MobileWebPlatform",
          ],
        },
        result: { "@type": "Reservation", name: "Doctor appointment reservation" },
      },
      {
        "@type": "OrderAction",
        name: "طلب دواء من الصيدلية",
        target: {
          "@type": "EntryPoint",
          urlTemplate: "https://bashenmedical.com/pharmacy",
          inLanguage: ["ar-SA", "en"],
          actionPlatform: [
            "https://schema.org/DesktopWebPlatform",
            "https://schema.org/MobileWebPlatform",
          ],
        },
        deliveryMethod: ["http://purl.org/goodrelations/v1#DeliveryModeOwnFleet"],
      },
      {
        "@type": "CommunicateAction",
        name: "تواصل عبر واتساب",
        target: {
          "@type": "EntryPoint",
          urlTemplate: `https://wa.me/${(mobile ?? phone ?? "").replace(/[^\d]/g, "")}`,
          inLanguage: ["ar-SA", "en"],
          actionPlatform: ["https://schema.org/MobileWebPlatform"],
        },
      },
      {
        "@type": "ScheduleAction",
        name: "طلب رعاية منزلية",
        target: {
          "@type": "EntryPoint",
          urlTemplate: "https://bashenmedical.com/home-care",
          inLanguage: ["ar-SA", "en"],
          actionPlatform: [
            "https://schema.org/DesktopWebPlatform",
            "https://schema.org/MobileWebPlatform",
          ],
        },
      },
    ],
    makesOffer: [
      {
        "@type": "Offer",
        name: "حجز موعد استشاري",
        category: "MedicalConsultation",
        url: "https://bashenmedical.com/book",
        availability: "https://schema.org/InStock",
        priceCurrency: currencies,
      },
      {
        "@type": "Offer",
        name: "طلب دواء وتوصيل",
        category: "Pharmacy",
        url: "https://bashenmedical.com/pharmacy",
        availability: "https://schema.org/InStock",
        priceCurrency: currencies,
      },
      {
        "@type": "Offer",
        name: "الرعاية الصحية المنزلية",
        category: "HomeHealthCare",
        url: "https://bashenmedical.com/home-care",
        availability: "https://schema.org/InStock",
        priceCurrency: currencies,
      },
      {
        "@type": "Offer",
        name: "الرأي الطبي الثاني",
        category: "MedicalConsultation",
        url: "https://bashenmedical.com/second-opinion",
        availability: "https://schema.org/InStock",
        priceCurrency: currencies,
      },
    ],
    hasOfferCatalog: {
      "@type": "OfferCatalog",
      name: "الخدمات الرئيسية — Baeshen Medical",
      itemListElement: [
        {
          "@type": "OfferCatalog",
          name: "العيادات والاستشاريون",
          url: "https://bashenmedical.com/doctors",
          itemListElement: specialties.map((sp) => ({
            "@type": "Offer",
            itemOffered: { "@type": "MedicalSpecialty", name: sp },
          })),
        },
        {
          "@type": "Offer",
          name: "الصيدلية",
          url: "https://bashenmedical.com/pharmacy",
          itemOffered: { "@type": "Service", name: "Pharmacy & medication delivery" },
        },
        {
          "@type": "Offer",
          name: "الرعاية المنزلية",
          url: "https://bashenmedical.com/home-care",
          itemOffered: { "@type": "Service", name: "Home healthcare services" },
        },
        {
          "@type": "Offer",
          name: "الرأي الطبي الثاني",
          url: "https://bashenmedical.com/second-opinion",
          itemOffered: { "@type": "Service", name: "Second medical opinion" },
        },
        {
          "@type": "Offer",
          name: "خدمات الشركات",
          url: "https://bashenmedical.com/corporate",
          itemOffered: { "@type": "Service", name: "Corporate healthcare partnerships" },
        },
      ],
    },
  };



  if (amenities && amenities.length > 0) {
    base.amenityFeature = amenities.map((a) => ({
      "@type": "LocationFeatureSpecification",
      name: a.name,
      value: a.value ?? true,
    }));
  }

  return base;
}

export function buildBreadcrumbs(
  items: { name: string; path: string }[],
): Record<string, unknown> {
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
