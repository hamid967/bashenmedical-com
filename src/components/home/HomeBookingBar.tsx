/**
 * Andalusia-style booking strip: branch → specialty → doctor → search.
 * Deep-links into /book (auth-gated) with resolved IDs for automation.
 */
import { useMemo, useState } from "react";
import { useNavigate } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { MapPin, Stethoscope, UserRound, Search } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useI18n } from "@/lib/i18n";

type Branch = { id: string; name_ar: string; name_en: string };
type Specialty = { id: string; slug: string; name_ar: string; name_en: string };
type Doctor = {
  id: string;
  name_ar: string;
  name_en: string;
  specialty_id: string | null;
  branch_id: string | null;
  specialties?: { slug: string | null } | null;
};

export function HomeBookingBar({ variant = "overlay" }: { variant?: "overlay" | "panel" }) {
  const { lang } = useI18n();
  const isAr = lang === "ar";
  const navigate = useNavigate();

  const [branchId, setBranchId] = useState("");
  const [specialtyId, setSpecialtyId] = useState("");
  const [doctorId, setDoctorId] = useState("");

  const { data: branches } = useQuery({
    queryKey: ["home_booking_branches"],
    queryFn: async () => {
      const { data } = await supabase.rpc("list_public_branches");
      return (data ?? []) as Branch[];
    },
    staleTime: 5 * 60_000,
  });

  const { data: specialties } = useQuery({
    queryKey: ["home_booking_specialties"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("specialties")
        .select("id,slug,name_ar,name_en")
        .eq("is_active", true)
        .order("sort_order");
      if (error) throw error;
      return (data ?? []) as Specialty[];
    },
    staleTime: 5 * 60_000,
  });

  const { data: doctors } = useQuery({
    queryKey: ["home_booking_doctors", branchId, specialtyId],
    queryFn: async () => {
      let q = supabase
        .from("doctors")
        .select("id,name_ar,name_en,specialty_id,branch_id,specialties(slug)")
        .eq("is_active", true)
        .order("name_ar")
        .limit(80);
      if (branchId) q = q.eq("branch_id", branchId);
      if (specialtyId) q = q.eq("specialty_id", specialtyId);
      const { data, error } = await q;
      if (error) throw error;
      return (data ?? []) as unknown as Doctor[];
    },
    staleTime: 60_000,
  });

  const doctorOptions = useMemo(() => doctors ?? [], [doctors]);

  const onSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    const search: Record<string, string> = {};
    if (branchId) search.branch = branchId;
    if (specialtyId) search.specialty = specialtyId;
    if (doctorId) search.doctor = doctorId;
    navigate({ to: "/book", search });
  };

  const shell =
    variant === "overlay"
      ? "home-booking-bar home-booking-bar--overlay"
      : "home-booking-bar home-booking-bar--panel";

  return (
    <form
      onSubmit={onSubmit}
      className={shell}
      dir={isAr ? "rtl" : "ltr"}
      aria-label={isAr ? "البحث عن موعد" : "Search for an appointment"}
    >
      <label className="home-booking-bar__field">
        <span className="home-booking-bar__label">
          <MapPin className="h-3.5 w-3.5" aria-hidden />
          {isAr ? "الفرع" : "Branch"}
        </span>
        <select
          value={branchId}
          onChange={(e) => {
            setBranchId(e.target.value);
            setDoctorId("");
          }}
          className="home-booking-bar__control"
        >
          <option value="">{isAr ? "اختر الفرع" : "Select branch"}</option>
          {branches?.map((b) => (
            <option key={b.id} value={b.id}>
              {isAr ? b.name_ar : b.name_en}
            </option>
          ))}
        </select>
      </label>

      <label className="home-booking-bar__field">
        <span className="home-booking-bar__label">
          <Stethoscope className="h-3.5 w-3.5" aria-hidden />
          {isAr ? "التخصص" : "Specialty"}
        </span>
        <select
          value={specialtyId}
          onChange={(e) => {
            setSpecialtyId(e.target.value);
            setDoctorId("");
          }}
          className="home-booking-bar__control"
        >
          <option value="">{isAr ? "اختر التخصص" : "Select specialty"}</option>
          {specialties?.map((s) => (
            <option key={s.id} value={s.id}>
              {isAr ? s.name_ar : s.name_en}
            </option>
          ))}
        </select>
      </label>

      <label className="home-booking-bar__field">
        <span className="home-booking-bar__label">
          <UserRound className="h-3.5 w-3.5" aria-hidden />
          {isAr ? "الطبيب" : "Doctor"}
        </span>
        <select
          value={doctorId}
          onChange={(e) => setDoctorId(e.target.value)}
          className="home-booking-bar__control"
        >
          <option value="">{isAr ? "أي طبيب متاح" : "Any available doctor"}</option>
          {doctorOptions.map((d) => (
            <option key={d.id} value={d.id}>
              {isAr ? d.name_ar : d.name_en}
            </option>
          ))}
        </select>
      </label>

      <button type="submit" className="home-booking-bar__submit">
        <Search className="h-4 w-4" aria-hidden />
        {isAr ? "بحث" : "Search"}
      </button>
    </form>
  );
}
