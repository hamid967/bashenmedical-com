/** Shared booking reference shapes: BMC (new) + BAA (legacy). */
export const BOOKING_REF_RE = /^(BMC-\d{8}-\d{4}|BAA-[0-9A-F]{8})$/i;

export function normalizeBookingRef(raw: string): string {
  return raw.trim().toUpperCase();
}

export function isBmcRef(ref: string): boolean {
  return normalizeBookingRef(ref).startsWith("BMC-");
}

export function isBaaRef(ref: string): boolean {
  return normalizeBookingRef(ref).startsWith("BAA-");
}

export function baaHexPrefix(ref: string): string {
  return normalizeBookingRef(ref).slice(4).toLowerCase();
}
