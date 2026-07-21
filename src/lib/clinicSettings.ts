import { supabase } from "@/integrations/supabase/client";

export type OpeningHours = { days: string[]; opens: string; closes: string };

export type ClinicSettings = {
  name_ar: string;
  name_en: string;
  phone: string;
  phone_display: string | null;
  mobile: string | null;
  mobile_display: string | null;
  whatsapp: string | null;
  email: string | null;
  address_ar: string;
  address_en: string;
  street_address: string;
  address_locality: string;
  address_region: string;
  postal_code: string | null;
  address_country: string;
  lat: number;
  lng: number;
  maps_url: string | null;
  price_range: string | null;
  currencies_accepted: string | null;
  payment_accepted: string | null;
  medical_specialties: string[];
  same_as: string[];
  opening_hours: OpeningHours[];
};

export const clinicSettingsQuery = () => ({
  queryKey: ["clinic-settings"],
  queryFn: async (): Promise<ClinicSettings> => {
    const { data, error } = await supabase
      .from("clinic_settings")
      .select("*")
      .eq("id", 1)
      .maybeSingle();
    if (error) throw error;
    if (!data) throw new Error("clinic_settings row missing");
    return {
      ...data,
      opening_hours: (data.opening_hours as unknown as OpeningHours[]) ?? [],
    } as ClinicSettings;
  },
  // Clinic settings change rarely (address, hours, phone). Cache aggressively
  // to cut database load — the row is a PK lookup but is hit on every page.
  staleTime: 30 * 60_000,
  gcTime: 60 * 60_000,
});
