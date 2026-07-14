export type Json =
  | string
  | number
  | boolean
  | null
  | { [key: string]: Json | undefined }
  | Json[]

export type Database = {
  // Allows to automatically instantiate createClient with right options
  // instead of createClient<Database, { PostgrestVersion: 'XX' }>(URL, KEY)
  __InternalSupabase: {
    PostgrestVersion: "14.5"
  }
  public: {
    Tables: {
      about_sections: {
        Row: {
          body_ar: string | null
          body_en: string | null
          created_at: string
          id: string
          is_active: boolean
          section_key: string
          sort_order: number
          title_ar: string | null
          title_en: string | null
          updated_at: string
        }
        Insert: {
          body_ar?: string | null
          body_en?: string | null
          created_at?: string
          id?: string
          is_active?: boolean
          section_key: string
          sort_order?: number
          title_ar?: string | null
          title_en?: string | null
          updated_at?: string
        }
        Update: {
          body_ar?: string | null
          body_en?: string | null
          created_at?: string
          id?: string
          is_active?: boolean
          section_key?: string
          sort_order?: number
          title_ar?: string | null
          title_en?: string | null
          updated_at?: string
        }
        Relationships: []
      }
      accreditations: {
        Row: {
          category: string | null
          created_at: string
          description_ar: string | null
          description_en: string | null
          id: string
          image_url: string | null
          sort_order: number
          title_ar: string
          title_en: string
          updated_at: string
          year: number | null
        }
        Insert: {
          category?: string | null
          created_at?: string
          description_ar?: string | null
          description_en?: string | null
          id?: string
          image_url?: string | null
          sort_order?: number
          title_ar: string
          title_en: string
          updated_at?: string
          year?: number | null
        }
        Update: {
          category?: string | null
          created_at?: string
          description_ar?: string | null
          description_en?: string | null
          id?: string
          image_url?: string | null
          sort_order?: number
          title_ar?: string
          title_en?: string
          updated_at?: string
          year?: number | null
        }
        Relationships: []
      }
      appointment_audit: {
        Row: {
          appointment_id: string
          changed_at: string
          changed_by: string | null
          id: string
          new_notes: string | null
          new_status: Database["public"]["Enums"]["appointment_status"] | null
          old_notes: string | null
          old_status: Database["public"]["Enums"]["appointment_status"] | null
          reason: string | null
        }
        Insert: {
          appointment_id: string
          changed_at?: string
          changed_by?: string | null
          id?: string
          new_notes?: string | null
          new_status?: Database["public"]["Enums"]["appointment_status"] | null
          old_notes?: string | null
          old_status?: Database["public"]["Enums"]["appointment_status"] | null
          reason?: string | null
        }
        Update: {
          appointment_id?: string
          changed_at?: string
          changed_by?: string | null
          id?: string
          new_notes?: string | null
          new_status?: Database["public"]["Enums"]["appointment_status"] | null
          old_notes?: string | null
          old_status?: Database["public"]["Enums"]["appointment_status"] | null
          reason?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "appointment_audit_appointment_id_fkey"
            columns: ["appointment_id"]
            isOneToOne: false
            referencedRelation: "appointments"
            referencedColumns: ["id"]
          },
        ]
      }
      appointment_waitlist: {
        Row: {
          branch_id: string | null
          created_at: string
          doctor_id: string | null
          id: string
          notes: string | null
          notified_at: string | null
          patient_name: string
          patient_phone: string
          preferred_from: string
          preferred_to: string
          reference: string
          specialty_id: string | null
          status: string
          updated_at: string
        }
        Insert: {
          branch_id?: string | null
          created_at?: string
          doctor_id?: string | null
          id?: string
          notes?: string | null
          notified_at?: string | null
          patient_name: string
          patient_phone: string
          preferred_from: string
          preferred_to: string
          reference: string
          specialty_id?: string | null
          status?: string
          updated_at?: string
        }
        Update: {
          branch_id?: string | null
          created_at?: string
          doctor_id?: string | null
          id?: string
          notes?: string | null
          notified_at?: string | null
          patient_name?: string
          patient_phone?: string
          preferred_from?: string
          preferred_to?: string
          reference?: string
          specialty_id?: string | null
          status?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "appointment_waitlist_branch_id_fkey"
            columns: ["branch_id"]
            isOneToOne: false
            referencedRelation: "branches"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "appointment_waitlist_doctor_id_fkey"
            columns: ["doctor_id"]
            isOneToOne: false
            referencedRelation: "doctors"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "appointment_waitlist_specialty_id_fkey"
            columns: ["specialty_id"]
            isOneToOne: false
            referencedRelation: "specialties"
            referencedColumns: ["id"]
          },
        ]
      }
      appointments: {
        Row: {
          appointment_date: string
          appointment_time: string
          branch_id: string | null
          cancelled_at: string | null
          created_at: string
          doctor_id: string | null
          estimated_cost_sar: number | null
          gender: string | null
          id: string
          idempotency_key: string | null
          insurance_coverage_percent: number | null
          insurance_member_id: string | null
          insurance_policy_number: string | null
          insurance_provider_id: string | null
          insurance_status: string
          is_demo: boolean
          national_id: string | null
          notes: string | null
          patient_email: string | null
          patient_id: string | null
          patient_name: string
          patient_phone: string
          patient_share_sar: number | null
          reason: string | null
          reminder_24h: boolean
          reminder_2h: boolean
          reminder_offsets_minutes: number[]
          specialty_id: string | null
          status: Database["public"]["Enums"]["appointment_status"]
          updated_at: string
          whatsapp_opt_in: boolean
        }
        Insert: {
          appointment_date: string
          appointment_time: string
          branch_id?: string | null
          cancelled_at?: string | null
          created_at?: string
          doctor_id?: string | null
          estimated_cost_sar?: number | null
          gender?: string | null
          id?: string
          idempotency_key?: string | null
          insurance_coverage_percent?: number | null
          insurance_member_id?: string | null
          insurance_policy_number?: string | null
          insurance_provider_id?: string | null
          insurance_status?: string
          is_demo?: boolean
          national_id?: string | null
          notes?: string | null
          patient_email?: string | null
          patient_id?: string | null
          patient_name: string
          patient_phone: string
          patient_share_sar?: number | null
          reason?: string | null
          reminder_24h?: boolean
          reminder_2h?: boolean
          reminder_offsets_minutes?: number[]
          specialty_id?: string | null
          status?: Database["public"]["Enums"]["appointment_status"]
          updated_at?: string
          whatsapp_opt_in?: boolean
        }
        Update: {
          appointment_date?: string
          appointment_time?: string
          branch_id?: string | null
          cancelled_at?: string | null
          created_at?: string
          doctor_id?: string | null
          estimated_cost_sar?: number | null
          gender?: string | null
          id?: string
          idempotency_key?: string | null
          insurance_coverage_percent?: number | null
          insurance_member_id?: string | null
          insurance_policy_number?: string | null
          insurance_provider_id?: string | null
          insurance_status?: string
          is_demo?: boolean
          national_id?: string | null
          notes?: string | null
          patient_email?: string | null
          patient_id?: string | null
          patient_name?: string
          patient_phone?: string
          patient_share_sar?: number | null
          reason?: string | null
          reminder_24h?: boolean
          reminder_2h?: boolean
          reminder_offsets_minutes?: number[]
          specialty_id?: string | null
          status?: Database["public"]["Enums"]["appointment_status"]
          updated_at?: string
          whatsapp_opt_in?: boolean
        }
        Relationships: [
          {
            foreignKeyName: "appointments_branch_id_fkey"
            columns: ["branch_id"]
            isOneToOne: false
            referencedRelation: "branches"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "appointments_doctor_id_fkey"
            columns: ["doctor_id"]
            isOneToOne: false
            referencedRelation: "doctors"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "appointments_insurance_provider_id_fkey"
            columns: ["insurance_provider_id"]
            isOneToOne: false
            referencedRelation: "insurance_providers"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "appointments_patient_id_fkey"
            columns: ["patient_id"]
            isOneToOne: false
            referencedRelation: "patients"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "appointments_specialty_id_fkey"
            columns: ["specialty_id"]
            isOneToOne: false
            referencedRelation: "specialties"
            referencedColumns: ["id"]
          },
        ]
      }
      attendance_records: {
        Row: {
          check_in: string | null
          check_out: string | null
          created_at: string
          employee_id: string
          id: string
          notes: string | null
          status: string
          updated_at: string
          work_date: string
        }
        Insert: {
          check_in?: string | null
          check_out?: string | null
          created_at?: string
          employee_id: string
          id?: string
          notes?: string | null
          status?: string
          updated_at?: string
          work_date: string
        }
        Update: {
          check_in?: string | null
          check_out?: string | null
          created_at?: string
          employee_id?: string
          id?: string
          notes?: string | null
          status?: string
          updated_at?: string
          work_date?: string
        }
        Relationships: [
          {
            foreignKeyName: "attendance_records_employee_id_fkey"
            columns: ["employee_id"]
            isOneToOne: false
            referencedRelation: "employees"
            referencedColumns: ["id"]
          },
        ]
      }
      audit_logs: {
        Row: {
          action: string
          actor_id: string | null
          actor_role: string | null
          after_data: Json | null
          before_data: Json | null
          created_at: string
          entity_id: string | null
          entity_type: string
          id: string
          ip_address: string | null
          metadata: Json | null
          user_agent: string | null
        }
        Insert: {
          action: string
          actor_id?: string | null
          actor_role?: string | null
          after_data?: Json | null
          before_data?: Json | null
          created_at?: string
          entity_id?: string | null
          entity_type: string
          id?: string
          ip_address?: string | null
          metadata?: Json | null
          user_agent?: string | null
        }
        Update: {
          action?: string
          actor_id?: string | null
          actor_role?: string | null
          after_data?: Json | null
          before_data?: Json | null
          created_at?: string
          entity_id?: string | null
          entity_type?: string
          id?: string
          ip_address?: string | null
          metadata?: Json | null
          user_agent?: string | null
        }
        Relationships: []
      }
      availability: {
        Row: {
          branch_id: string | null
          created_at: string
          doctor_id: string
          end_time: string
          id: string
          slot_minutes: number
          start_time: string
          weekday: number
        }
        Insert: {
          branch_id?: string | null
          created_at?: string
          doctor_id: string
          end_time: string
          id?: string
          slot_minutes?: number
          start_time: string
          weekday: number
        }
        Update: {
          branch_id?: string | null
          created_at?: string
          doctor_id?: string
          end_time?: string
          id?: string
          slot_minutes?: number
          start_time?: string
          weekday?: number
        }
        Relationships: [
          {
            foreignKeyName: "availability_branch_id_fkey"
            columns: ["branch_id"]
            isOneToOne: false
            referencedRelation: "branches"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "availability_doctor_id_fkey"
            columns: ["doctor_id"]
            isOneToOne: false
            referencedRelation: "doctors"
            referencedColumns: ["id"]
          },
        ]
      }
      availability_slots: {
        Row: {
          appointment_id: string | null
          branch_id: string | null
          created_at: string
          doctor_id: string
          end_time: string
          id: string
          slot_date: string
          start_time: string
          status: string
          updated_at: string
        }
        Insert: {
          appointment_id?: string | null
          branch_id?: string | null
          created_at?: string
          doctor_id: string
          end_time: string
          id?: string
          slot_date: string
          start_time: string
          status?: string
          updated_at?: string
        }
        Update: {
          appointment_id?: string | null
          branch_id?: string | null
          created_at?: string
          doctor_id?: string
          end_time?: string
          id?: string
          slot_date?: string
          start_time?: string
          status?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "availability_slots_appointment_id_fkey"
            columns: ["appointment_id"]
            isOneToOne: false
            referencedRelation: "appointments"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "availability_slots_branch_id_fkey"
            columns: ["branch_id"]
            isOneToOne: false
            referencedRelation: "branches"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "availability_slots_doctor_id_fkey"
            columns: ["doctor_id"]
            isOneToOne: false
            referencedRelation: "doctors"
            referencedColumns: ["id"]
          },
        ]
      }
      branch_excellence_centers: {
        Row: {
          branch_id: string
          created_at: string
          excellence_center_id: string
          id: string
          is_featured: boolean
          sort_order: number
        }
        Insert: {
          branch_id: string
          created_at?: string
          excellence_center_id: string
          id?: string
          is_featured?: boolean
          sort_order?: number
        }
        Update: {
          branch_id?: string
          created_at?: string
          excellence_center_id?: string
          id?: string
          is_featured?: boolean
          sort_order?: number
        }
        Relationships: [
          {
            foreignKeyName: "branch_excellence_centers_branch_id_fkey"
            columns: ["branch_id"]
            isOneToOne: false
            referencedRelation: "branches"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "branch_excellence_centers_excellence_center_id_fkey"
            columns: ["excellence_center_id"]
            isOneToOne: false
            referencedRelation: "excellence_centers"
            referencedColumns: ["id"]
          },
        ]
      }
      branch_mrn_counter: {
        Row: {
          branch_id: string
          last_value: number
        }
        Insert: {
          branch_id: string
          last_value?: number
        }
        Update: {
          branch_id?: string
          last_value?: number
        }
        Relationships: [
          {
            foreignKeyName: "branch_mrn_counter_branch_id_fkey"
            columns: ["branch_id"]
            isOneToOne: true
            referencedRelation: "branches"
            referencedColumns: ["id"]
          },
        ]
      }
      branches: {
        Row: {
          address_ar: string | null
          address_en: string | null
          city_ar: string | null
          city_en: string | null
          created_at: string
          description_ar: string | null
          description_en: string | null
          email: string | null
          emergency_phone: string | null
          hero_image_url: string | null
          id: string
          is_active: boolean
          lat: number | null
          lng: number | null
          map_embed_url: string | null
          name_ar: string
          name_en: string
          phone: string | null
          settings: Json
          slug: string
          sort_order: number
          updated_at: string
          working_hours: Json
        }
        Insert: {
          address_ar?: string | null
          address_en?: string | null
          city_ar?: string | null
          city_en?: string | null
          created_at?: string
          description_ar?: string | null
          description_en?: string | null
          email?: string | null
          emergency_phone?: string | null
          hero_image_url?: string | null
          id?: string
          is_active?: boolean
          lat?: number | null
          lng?: number | null
          map_embed_url?: string | null
          name_ar: string
          name_en: string
          phone?: string | null
          settings?: Json
          slug: string
          sort_order?: number
          updated_at?: string
          working_hours?: Json
        }
        Update: {
          address_ar?: string | null
          address_en?: string | null
          city_ar?: string | null
          city_en?: string | null
          created_at?: string
          description_ar?: string | null
          description_en?: string | null
          email?: string | null
          emergency_phone?: string | null
          hero_image_url?: string | null
          id?: string
          is_active?: boolean
          lat?: number | null
          lng?: number | null
          map_embed_url?: string | null
          name_ar?: string
          name_en?: string
          phone?: string | null
          settings?: Json
          slug?: string
          sort_order?: number
          updated_at?: string
          working_hours?: Json
        }
        Relationships: []
      }
      clinic_settings: {
        Row: {
          address_ar: string
          address_country: string
          address_en: string
          address_locality: string
          address_region: string
          branch_id: string | null
          created_at: string
          currencies_accepted: string | null
          email: string | null
          id: number
          lat: number
          lng: number
          maps_url: string | null
          medical_specialties: string[]
          mobile: string | null
          mobile_display: string | null
          name_ar: string
          name_en: string
          opening_hours: Json
          payment_accepted: string | null
          phone: string
          phone_display: string | null
          postal_code: string | null
          price_range: string | null
          same_as: string[]
          street_address: string
          updated_at: string
          whatsapp: string | null
        }
        Insert: {
          address_ar: string
          address_country?: string
          address_en: string
          address_locality: string
          address_region: string
          branch_id?: string | null
          created_at?: string
          currencies_accepted?: string | null
          email?: string | null
          id?: number
          lat: number
          lng: number
          maps_url?: string | null
          medical_specialties?: string[]
          mobile?: string | null
          mobile_display?: string | null
          name_ar: string
          name_en: string
          opening_hours?: Json
          payment_accepted?: string | null
          phone: string
          phone_display?: string | null
          postal_code?: string | null
          price_range?: string | null
          same_as?: string[]
          street_address: string
          updated_at?: string
          whatsapp?: string | null
        }
        Update: {
          address_ar?: string
          address_country?: string
          address_en?: string
          address_locality?: string
          address_region?: string
          branch_id?: string | null
          created_at?: string
          currencies_accepted?: string | null
          email?: string | null
          id?: number
          lat?: number
          lng?: number
          maps_url?: string | null
          medical_specialties?: string[]
          mobile?: string | null
          mobile_display?: string | null
          name_ar?: string
          name_en?: string
          opening_hours?: Json
          payment_accepted?: string | null
          phone?: string
          phone_display?: string | null
          postal_code?: string | null
          price_range?: string | null
          same_as?: string[]
          street_address?: string
          updated_at?: string
          whatsapp?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "clinic_settings_branch_id_fkey"
            columns: ["branch_id"]
            isOneToOne: false
            referencedRelation: "branches"
            referencedColumns: ["id"]
          },
        ]
      }
      complaints: {
        Row: {
          assigned_to: string | null
          attachments: Json
          created_at: string
          department: string | null
          id: string
          internal_notes: string | null
          message: string
          patient_email: string | null
          patient_name: string
          patient_phone: string
          patient_user_id: string | null
          reference: string
          status: string
          type: string
          updated_at: string
        }
        Insert: {
          assigned_to?: string | null
          attachments?: Json
          created_at?: string
          department?: string | null
          id?: string
          internal_notes?: string | null
          message: string
          patient_email?: string | null
          patient_name: string
          patient_phone: string
          patient_user_id?: string | null
          reference?: string
          status?: string
          type: string
          updated_at?: string
        }
        Update: {
          assigned_to?: string | null
          attachments?: Json
          created_at?: string
          department?: string | null
          id?: string
          internal_notes?: string | null
          message?: string
          patient_email?: string | null
          patient_name?: string
          patient_phone?: string
          patient_user_id?: string | null
          reference?: string
          status?: string
          type?: string
          updated_at?: string
        }
        Relationships: []
      }
      corporate_requests: {
        Row: {
          admin_notes: string | null
          company_name: string
          contact_name: string
          created_at: string
          email: string | null
          employee_count: number | null
          id: string
          notes: string | null
          phone: string
          service_type: string | null
          status: string
          updated_at: string
        }
        Insert: {
          admin_notes?: string | null
          company_name: string
          contact_name: string
          created_at?: string
          email?: string | null
          employee_count?: number | null
          id?: string
          notes?: string | null
          phone: string
          service_type?: string | null
          status?: string
          updated_at?: string
        }
        Update: {
          admin_notes?: string | null
          company_name?: string
          contact_name?: string
          created_at?: string
          email?: string | null
          employee_count?: number | null
          id?: string
          notes?: string | null
          phone?: string
          service_type?: string | null
          status?: string
          updated_at?: string
        }
        Relationships: []
      }
      dependents: {
        Row: {
          created_at: string
          date_of_birth: string | null
          full_name: string
          gender: string | null
          guardian_user_id: string
          id: string
          national_id: string | null
          patient_id: string | null
          phone: string | null
          relationship: string
          updated_at: string
          verified: boolean
        }
        Insert: {
          created_at?: string
          date_of_birth?: string | null
          full_name: string
          gender?: string | null
          guardian_user_id: string
          id?: string
          national_id?: string | null
          patient_id?: string | null
          phone?: string | null
          relationship: string
          updated_at?: string
          verified?: boolean
        }
        Update: {
          created_at?: string
          date_of_birth?: string | null
          full_name?: string
          gender?: string | null
          guardian_user_id?: string
          id?: string
          national_id?: string | null
          patient_id?: string | null
          phone?: string | null
          relationship?: string
          updated_at?: string
          verified?: boolean
        }
        Relationships: [
          {
            foreignKeyName: "dependents_patient_id_fkey"
            columns: ["patient_id"]
            isOneToOne: false
            referencedRelation: "patients"
            referencedColumns: ["id"]
          },
        ]
      }
      doctor_branches: {
        Row: {
          branch_id: string
          created_at: string
          doctor_id: string
          is_primary: boolean
        }
        Insert: {
          branch_id: string
          created_at?: string
          doctor_id: string
          is_primary?: boolean
        }
        Update: {
          branch_id?: string
          created_at?: string
          doctor_id?: string
          is_primary?: boolean
        }
        Relationships: [
          {
            foreignKeyName: "doctor_branches_branch_id_fkey"
            columns: ["branch_id"]
            isOneToOne: false
            referencedRelation: "branches"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "doctor_branches_doctor_id_fkey"
            columns: ["doctor_id"]
            isOneToOne: false
            referencedRelation: "doctors"
            referencedColumns: ["id"]
          },
        ]
      }
      doctor_leaves: {
        Row: {
          all_day: boolean
          branch_id: string | null
          created_at: string
          created_by: string | null
          doctor_id: string
          end_date: string
          id: string
          reason: string | null
          start_date: string
          updated_at: string
        }
        Insert: {
          all_day?: boolean
          branch_id?: string | null
          created_at?: string
          created_by?: string | null
          doctor_id: string
          end_date: string
          id?: string
          reason?: string | null
          start_date: string
          updated_at?: string
        }
        Update: {
          all_day?: boolean
          branch_id?: string | null
          created_at?: string
          created_by?: string | null
          doctor_id?: string
          end_date?: string
          id?: string
          reason?: string | null
          start_date?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "doctor_leaves_branch_id_fkey"
            columns: ["branch_id"]
            isOneToOne: false
            referencedRelation: "branches"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "doctor_leaves_doctor_id_fkey"
            columns: ["doctor_id"]
            isOneToOne: false
            referencedRelation: "doctors"
            referencedColumns: ["id"]
          },
        ]
      }
      doctors: {
        Row: {
          avg_rating: number
          bio_ar: string | null
          bio_en: string | null
          booking_enabled: boolean
          branch_id: string | null
          consultation_fee_sar: number | null
          created_at: string
          education_ar: string | null
          education_en: string | null
          experience_ar: string | null
          experience_en: string | null
          gender: string | null
          id: string
          is_active: boolean
          is_demo: boolean
          languages: string[] | null
          name_ar: string
          name_en: string
          photo_url: string | null
          photos: string[]
          profile_id: string | null
          ratings_count: number
          slug: string | null
          sort_order: number
          specialty_id: string | null
          title_ar: string | null
          title_en: string | null
          years_experience: number | null
        }
        Insert: {
          avg_rating?: number
          bio_ar?: string | null
          bio_en?: string | null
          booking_enabled?: boolean
          branch_id?: string | null
          consultation_fee_sar?: number | null
          created_at?: string
          education_ar?: string | null
          education_en?: string | null
          experience_ar?: string | null
          experience_en?: string | null
          gender?: string | null
          id?: string
          is_active?: boolean
          is_demo?: boolean
          languages?: string[] | null
          name_ar: string
          name_en: string
          photo_url?: string | null
          photos?: string[]
          profile_id?: string | null
          ratings_count?: number
          slug?: string | null
          sort_order?: number
          specialty_id?: string | null
          title_ar?: string | null
          title_en?: string | null
          years_experience?: number | null
        }
        Update: {
          avg_rating?: number
          bio_ar?: string | null
          bio_en?: string | null
          booking_enabled?: boolean
          branch_id?: string | null
          consultation_fee_sar?: number | null
          created_at?: string
          education_ar?: string | null
          education_en?: string | null
          experience_ar?: string | null
          experience_en?: string | null
          gender?: string | null
          id?: string
          is_active?: boolean
          is_demo?: boolean
          languages?: string[] | null
          name_ar?: string
          name_en?: string
          photo_url?: string | null
          photos?: string[]
          profile_id?: string | null
          ratings_count?: number
          slug?: string | null
          sort_order?: number
          specialty_id?: string | null
          title_ar?: string | null
          title_en?: string | null
          years_experience?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "doctors_branch_id_fkey"
            columns: ["branch_id"]
            isOneToOne: false
            referencedRelation: "branches"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "doctors_profile_id_fkey"
            columns: ["profile_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "doctors_specialty_id_fkey"
            columns: ["specialty_id"]
            isOneToOne: false
            referencedRelation: "specialties"
            referencedColumns: ["id"]
          },
        ]
      }
      employees: {
        Row: {
          branch_id: string | null
          created_at: string
          department: string | null
          email: string | null
          full_name: string
          hire_date: string | null
          id: string
          is_active: boolean
          monthly_salary: number
          national_id: string | null
          notes: string | null
          phone: string | null
          position: string | null
          updated_at: string
          user_id: string | null
        }
        Insert: {
          branch_id?: string | null
          created_at?: string
          department?: string | null
          email?: string | null
          full_name: string
          hire_date?: string | null
          id?: string
          is_active?: boolean
          monthly_salary?: number
          national_id?: string | null
          notes?: string | null
          phone?: string | null
          position?: string | null
          updated_at?: string
          user_id?: string | null
        }
        Update: {
          branch_id?: string | null
          created_at?: string
          department?: string | null
          email?: string | null
          full_name?: string
          hire_date?: string | null
          id?: string
          is_active?: boolean
          monthly_salary?: number
          national_id?: string | null
          notes?: string | null
          phone?: string | null
          position?: string | null
          updated_at?: string
          user_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "employees_branch_id_fkey"
            columns: ["branch_id"]
            isOneToOne: false
            referencedRelation: "branches"
            referencedColumns: ["id"]
          },
        ]
      }
      excellence_centers: {
        Row: {
          created_at: string
          description_ar: string | null
          description_en: string | null
          hero_image_url: string | null
          icon: string | null
          id: string
          is_active: boolean
          metadata: Json
          name_ar: string
          name_en: string
          short_ar: string | null
          short_en: string | null
          slug: string
          sort_order: number
          specialty_id: string | null
          updated_at: string
        }
        Insert: {
          created_at?: string
          description_ar?: string | null
          description_en?: string | null
          hero_image_url?: string | null
          icon?: string | null
          id?: string
          is_active?: boolean
          metadata?: Json
          name_ar: string
          name_en: string
          short_ar?: string | null
          short_en?: string | null
          slug: string
          sort_order?: number
          specialty_id?: string | null
          updated_at?: string
        }
        Update: {
          created_at?: string
          description_ar?: string | null
          description_en?: string | null
          hero_image_url?: string | null
          icon?: string | null
          id?: string
          is_active?: boolean
          metadata?: Json
          name_ar?: string
          name_en?: string
          short_ar?: string | null
          short_en?: string | null
          slug?: string
          sort_order?: number
          specialty_id?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "excellence_centers_specialty_id_fkey"
            columns: ["specialty_id"]
            isOneToOne: false
            referencedRelation: "specialties"
            referencedColumns: ["id"]
          },
        ]
      }
      faqs: {
        Row: {
          answer_ar: string
          answer_en: string | null
          created_at: string
          id: string
          is_active: boolean
          question_ar: string
          question_en: string | null
          sort_order: number
          updated_at: string
        }
        Insert: {
          answer_ar: string
          answer_en?: string | null
          created_at?: string
          id?: string
          is_active?: boolean
          question_ar: string
          question_en?: string | null
          sort_order?: number
          updated_at?: string
        }
        Update: {
          answer_ar?: string
          answer_en?: string | null
          created_at?: string
          id?: string
          is_active?: boolean
          question_ar?: string
          question_en?: string | null
          sort_order?: number
          updated_at?: string
        }
        Relationships: []
      }
      health_articles: {
        Row: {
          author_name: string | null
          category_id: string | null
          content_ar: string
          content_en: string | null
          cover_image_url: string | null
          created_at: string
          excerpt_ar: string
          excerpt_en: string | null
          id: string
          is_published: boolean
          keywords: string[]
          published_at: string | null
          reading_minutes: number
          season: string | null
          slug: string
          title_ar: string
          title_en: string | null
          updated_at: string
        }
        Insert: {
          author_name?: string | null
          category_id?: string | null
          content_ar: string
          content_en?: string | null
          cover_image_url?: string | null
          created_at?: string
          excerpt_ar: string
          excerpt_en?: string | null
          id?: string
          is_published?: boolean
          keywords?: string[]
          published_at?: string | null
          reading_minutes?: number
          season?: string | null
          slug: string
          title_ar: string
          title_en?: string | null
          updated_at?: string
        }
        Update: {
          author_name?: string | null
          category_id?: string | null
          content_ar?: string
          content_en?: string | null
          cover_image_url?: string | null
          created_at?: string
          excerpt_ar?: string
          excerpt_en?: string | null
          id?: string
          is_published?: boolean
          keywords?: string[]
          published_at?: string | null
          reading_minutes?: number
          season?: string | null
          slug?: string
          title_ar?: string
          title_en?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "health_articles_category_id_fkey"
            columns: ["category_id"]
            isOneToOne: false
            referencedRelation: "health_categories"
            referencedColumns: ["id"]
          },
        ]
      }
      health_categories: {
        Row: {
          created_at: string
          description_ar: string | null
          description_en: string | null
          id: string
          is_active: boolean
          name_ar: string
          name_en: string
          slug: string
          sort_order: number
          updated_at: string
        }
        Insert: {
          created_at?: string
          description_ar?: string | null
          description_en?: string | null
          id?: string
          is_active?: boolean
          name_ar: string
          name_en: string
          slug: string
          sort_order?: number
          updated_at?: string
        }
        Update: {
          created_at?: string
          description_ar?: string | null
          description_en?: string | null
          id?: string
          is_active?: boolean
          name_ar?: string
          name_en?: string
          slug?: string
          sort_order?: number
          updated_at?: string
        }
        Relationships: []
      }
      home_care_requests: {
        Row: {
          address: string | null
          branch_id: string | null
          created_at: string
          created_by: string | null
          id: string
          notes: string | null
          patient_name: string
          patient_phone: string
          preferred_date: string | null
          preferred_time: string | null
          service: string | null
          status: string
          updated_at: string
        }
        Insert: {
          address?: string | null
          branch_id?: string | null
          created_at?: string
          created_by?: string | null
          id?: string
          notes?: string | null
          patient_name: string
          patient_phone: string
          preferred_date?: string | null
          preferred_time?: string | null
          service?: string | null
          status?: string
          updated_at?: string
        }
        Update: {
          address?: string | null
          branch_id?: string | null
          created_at?: string
          created_by?: string | null
          id?: string
          notes?: string | null
          patient_name?: string
          patient_phone?: string
          preferred_date?: string | null
          preferred_time?: string | null
          service?: string | null
          status?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "home_care_requests_branch_id_fkey"
            columns: ["branch_id"]
            isOneToOne: false
            referencedRelation: "branches"
            referencedColumns: ["id"]
          },
        ]
      }
      insurance_approvals: {
        Row: {
          appointment_id: string | null
          approved_amount: number | null
          attachments: Json | null
          created_at: string
          expires_at: string | null
          id: string
          insurance_provider_id: string | null
          is_mock: boolean
          missing_documents: string[] | null
          notes: string | null
          patient_id: string
          patient_share: number | null
          request_number: string | null
          reviewed_at: string | null
          service_description: string
          status: string
          submitted_at: string | null
          updated_at: string
        }
        Insert: {
          appointment_id?: string | null
          approved_amount?: number | null
          attachments?: Json | null
          created_at?: string
          expires_at?: string | null
          id?: string
          insurance_provider_id?: string | null
          is_mock?: boolean
          missing_documents?: string[] | null
          notes?: string | null
          patient_id: string
          patient_share?: number | null
          request_number?: string | null
          reviewed_at?: string | null
          service_description: string
          status?: string
          submitted_at?: string | null
          updated_at?: string
        }
        Update: {
          appointment_id?: string | null
          approved_amount?: number | null
          attachments?: Json | null
          created_at?: string
          expires_at?: string | null
          id?: string
          insurance_provider_id?: string | null
          is_mock?: boolean
          missing_documents?: string[] | null
          notes?: string | null
          patient_id?: string
          patient_share?: number | null
          request_number?: string | null
          reviewed_at?: string | null
          service_description?: string
          status?: string
          submitted_at?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "insurance_approvals_appointment_id_fkey"
            columns: ["appointment_id"]
            isOneToOne: false
            referencedRelation: "appointments"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "insurance_approvals_insurance_provider_id_fkey"
            columns: ["insurance_provider_id"]
            isOneToOne: false
            referencedRelation: "insurance_providers"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "insurance_approvals_patient_id_fkey"
            columns: ["patient_id"]
            isOneToOne: false
            referencedRelation: "patients"
            referencedColumns: ["id"]
          },
        ]
      }
      insurance_providers: {
        Row: {
          active: boolean
          coverage_percent: number
          coverage_tier: string
          created_at: string
          id: string
          name_ar: string
          name_en: string | null
          notes_ar: string | null
          sort_order: number
          updated_at: string
        }
        Insert: {
          active?: boolean
          coverage_percent?: number
          coverage_tier?: string
          created_at?: string
          id?: string
          name_ar: string
          name_en?: string | null
          notes_ar?: string | null
          sort_order?: number
          updated_at?: string
        }
        Update: {
          active?: boolean
          coverage_percent?: number
          coverage_tier?: string
          created_at?: string
          id?: string
          name_ar?: string
          name_en?: string | null
          notes_ar?: string | null
          sort_order?: number
          updated_at?: string
        }
        Relationships: []
      }
      insurance_verifications: {
        Row: {
          appointment_id: string | null
          consultation_fee: number | null
          coverage_percent: number | null
          covered_amount: number | null
          created_at: string
          doctor_id: string | null
          eligible: boolean
          estimated_cost: number | null
          id: string
          message: string | null
          patient_share: number | null
          policy_hint: string | null
          provider_id: string | null
          reason: string | null
          user_id: string
        }
        Insert: {
          appointment_id?: string | null
          consultation_fee?: number | null
          coverage_percent?: number | null
          covered_amount?: number | null
          created_at?: string
          doctor_id?: string | null
          eligible: boolean
          estimated_cost?: number | null
          id?: string
          message?: string | null
          patient_share?: number | null
          policy_hint?: string | null
          provider_id?: string | null
          reason?: string | null
          user_id: string
        }
        Update: {
          appointment_id?: string | null
          consultation_fee?: number | null
          coverage_percent?: number | null
          covered_amount?: number | null
          created_at?: string
          doctor_id?: string | null
          eligible?: boolean
          estimated_cost?: number | null
          id?: string
          message?: string | null
          patient_share?: number | null
          policy_hint?: string | null
          provider_id?: string | null
          reason?: string | null
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "insurance_verifications_appointment_id_fkey"
            columns: ["appointment_id"]
            isOneToOne: false
            referencedRelation: "appointments"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "insurance_verifications_doctor_id_fkey"
            columns: ["doctor_id"]
            isOneToOne: false
            referencedRelation: "doctors"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "insurance_verifications_provider_id_fkey"
            columns: ["provider_id"]
            isOneToOne: false
            referencedRelation: "insurance_providers"
            referencedColumns: ["id"]
          },
        ]
      }
      integration_logs: {
        Row: {
          created_at: string
          duration_ms: number | null
          error_message: string | null
          id: string
          integration_key: string
          is_mock: boolean
          operation: string
          request_data: Json | null
          response_data: Json | null
          status: string
        }
        Insert: {
          created_at?: string
          duration_ms?: number | null
          error_message?: string | null
          id?: string
          integration_key: string
          is_mock?: boolean
          operation: string
          request_data?: Json | null
          response_data?: Json | null
          status: string
        }
        Update: {
          created_at?: string
          duration_ms?: number | null
          error_message?: string | null
          id?: string
          integration_key?: string
          is_mock?: boolean
          operation?: string
          request_data?: Json | null
          response_data?: Json | null
          status?: string
        }
        Relationships: []
      }
      intro_settings: {
        Row: {
          created_at: string
          headline_ar: string | null
          headline_en: string | null
          id: string
          is_active: boolean
          prefetch_enabled: boolean
          prefetch_lead_ms: number
          scene_order: Json
          services: Json
          stat_metrics: Json
          tagline_ar: string | null
          tagline_en: string | null
          updated_at: string
          updated_by: string | null
        }
        Insert: {
          created_at?: string
          headline_ar?: string | null
          headline_en?: string | null
          id: string
          is_active?: boolean
          prefetch_enabled?: boolean
          prefetch_lead_ms?: number
          scene_order?: Json
          services?: Json
          stat_metrics?: Json
          tagline_ar?: string | null
          tagline_en?: string | null
          updated_at?: string
          updated_by?: string | null
        }
        Update: {
          created_at?: string
          headline_ar?: string | null
          headline_en?: string | null
          id?: string
          is_active?: boolean
          prefetch_enabled?: boolean
          prefetch_lead_ms?: number
          scene_order?: Json
          services?: Json
          stat_metrics?: Json
          tagline_ar?: string | null
          tagline_en?: string | null
          updated_at?: string
          updated_by?: string | null
        }
        Relationships: []
      }
      inventory_items: {
        Row: {
          barcode: string | null
          branch_id: string | null
          created_at: string
          expiry_date: string | null
          form: string | null
          id: string
          is_active: boolean
          min_stock: number
          name_ar: string
          name_en: string | null
          notes: string | null
          price: number | null
          quantity: number
          sku: string | null
          unit: string | null
          updated_at: string
        }
        Insert: {
          barcode?: string | null
          branch_id?: string | null
          created_at?: string
          expiry_date?: string | null
          form?: string | null
          id?: string
          is_active?: boolean
          min_stock?: number
          name_ar: string
          name_en?: string | null
          notes?: string | null
          price?: number | null
          quantity?: number
          sku?: string | null
          unit?: string | null
          updated_at?: string
        }
        Update: {
          barcode?: string | null
          branch_id?: string | null
          created_at?: string
          expiry_date?: string | null
          form?: string | null
          id?: string
          is_active?: boolean
          min_stock?: number
          name_ar?: string
          name_en?: string | null
          notes?: string | null
          price?: number | null
          quantity?: number
          sku?: string | null
          unit?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "inventory_items_branch_id_fkey"
            columns: ["branch_id"]
            isOneToOne: false
            referencedRelation: "branches"
            referencedColumns: ["id"]
          },
        ]
      }
      invoices: {
        Row: {
          appointment_id: string | null
          created_at: string
          currency: string
          id: string
          invoice_number: string | null
          is_demo: boolean
          issued_at: string
          notes: string | null
          paid_at: string | null
          patient_id: string
          pdf_path: string | null
          status: string
          total: number
          updated_at: string
        }
        Insert: {
          appointment_id?: string | null
          created_at?: string
          currency?: string
          id?: string
          invoice_number?: string | null
          is_demo?: boolean
          issued_at?: string
          notes?: string | null
          paid_at?: string | null
          patient_id: string
          pdf_path?: string | null
          status?: string
          total?: number
          updated_at?: string
        }
        Update: {
          appointment_id?: string | null
          created_at?: string
          currency?: string
          id?: string
          invoice_number?: string | null
          is_demo?: boolean
          issued_at?: string
          notes?: string | null
          paid_at?: string | null
          patient_id?: string
          pdf_path?: string | null
          status?: string
          total?: number
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "invoices_appointment_id_fkey"
            columns: ["appointment_id"]
            isOneToOne: false
            referencedRelation: "appointments"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "invoices_patient_id_fkey"
            columns: ["patient_id"]
            isOneToOne: false
            referencedRelation: "patients"
            referencedColumns: ["id"]
          },
        ]
      }
      lab_reports: {
        Row: {
          created_at: string
          file_path: string | null
          id: string
          is_demo: boolean
          ordered_by: string | null
          patient_id: string
          released_at: string | null
          report_date: string
          status: string
          summary: string | null
          test_type: string | null
          title: string
          updated_at: string
        }
        Insert: {
          created_at?: string
          file_path?: string | null
          id?: string
          is_demo?: boolean
          ordered_by?: string | null
          patient_id: string
          released_at?: string | null
          report_date?: string
          status?: string
          summary?: string | null
          test_type?: string | null
          title: string
          updated_at?: string
        }
        Update: {
          created_at?: string
          file_path?: string | null
          id?: string
          is_demo?: boolean
          ordered_by?: string | null
          patient_id?: string
          released_at?: string | null
          report_date?: string
          status?: string
          summary?: string | null
          test_type?: string | null
          title?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "lab_reports_ordered_by_fkey"
            columns: ["ordered_by"]
            isOneToOne: false
            referencedRelation: "doctors"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "lab_reports_patient_id_fkey"
            columns: ["patient_id"]
            isOneToOne: false
            referencedRelation: "patients"
            referencedColumns: ["id"]
          },
        ]
      }
      leave_requests: {
        Row: {
          created_at: string
          days: number
          employee_id: string
          from_date: string
          id: string
          leave_type: string
          reason: string | null
          review_notes: string | null
          reviewed_at: string | null
          reviewed_by: string | null
          status: string
          to_date: string
          updated_at: string
        }
        Insert: {
          created_at?: string
          days?: number
          employee_id: string
          from_date: string
          id?: string
          leave_type?: string
          reason?: string | null
          review_notes?: string | null
          reviewed_at?: string | null
          reviewed_by?: string | null
          status?: string
          to_date: string
          updated_at?: string
        }
        Update: {
          created_at?: string
          days?: number
          employee_id?: string
          from_date?: string
          id?: string
          leave_type?: string
          reason?: string | null
          review_notes?: string | null
          reviewed_at?: string | null
          reviewed_by?: string | null
          status?: string
          to_date?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "leave_requests_employee_id_fkey"
            columns: ["employee_id"]
            isOneToOne: false
            referencedRelation: "employees"
            referencedColumns: ["id"]
          },
        ]
      }
      mcp_tool_invocations: {
        Row: {
          args_summary: Json | null
          duration_ms: number | null
          id: string
          invoked_at: string
          is_error: boolean
          result_summary: string | null
          tool_name: string
          user_id: string
        }
        Insert: {
          args_summary?: Json | null
          duration_ms?: number | null
          id?: string
          invoked_at?: string
          is_error?: boolean
          result_summary?: string | null
          tool_name: string
          user_id: string
        }
        Update: {
          args_summary?: Json | null
          duration_ms?: number | null
          id?: string
          invoked_at?: string
          is_error?: boolean
          result_summary?: string | null
          tool_name?: string
          user_id?: string
        }
        Relationships: []
      }
      medical_reports: {
        Row: {
          appointment_id: string | null
          created_at: string
          created_by: string | null
          doctor_id: string | null
          file_path: string | null
          id: string
          is_demo: boolean
          patient_id: string
          published_at: string | null
          report_type: string
          revoke_reason: string | null
          revoked_at: string | null
          status: string
          summary: string | null
          title_ar: string
          title_en: string | null
          updated_at: string
        }
        Insert: {
          appointment_id?: string | null
          created_at?: string
          created_by?: string | null
          doctor_id?: string | null
          file_path?: string | null
          id?: string
          is_demo?: boolean
          patient_id: string
          published_at?: string | null
          report_type: string
          revoke_reason?: string | null
          revoked_at?: string | null
          status?: string
          summary?: string | null
          title_ar: string
          title_en?: string | null
          updated_at?: string
        }
        Update: {
          appointment_id?: string | null
          created_at?: string
          created_by?: string | null
          doctor_id?: string | null
          file_path?: string | null
          id?: string
          is_demo?: boolean
          patient_id?: string
          published_at?: string | null
          report_type?: string
          revoke_reason?: string | null
          revoked_at?: string | null
          status?: string
          summary?: string | null
          title_ar?: string
          title_en?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "medical_reports_appointment_id_fkey"
            columns: ["appointment_id"]
            isOneToOne: false
            referencedRelation: "appointments"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "medical_reports_doctor_id_fkey"
            columns: ["doctor_id"]
            isOneToOne: false
            referencedRelation: "doctors"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "medical_reports_patient_id_fkey"
            columns: ["patient_id"]
            isOneToOne: false
            referencedRelation: "patients"
            referencedColumns: ["id"]
          },
        ]
      }
      medicine_orders: {
        Row: {
          address: string | null
          branch_id: string | null
          created_at: string
          delivery_type: Database["public"]["Enums"]["delivery_type"]
          district: string | null
          id: string
          items_text: string | null
          notes: string | null
          patient_name: string
          patient_phone: string
          prescription_image_url: string | null
          status: Database["public"]["Enums"]["medicine_order_status"]
          updated_at: string
        }
        Insert: {
          address?: string | null
          branch_id?: string | null
          created_at?: string
          delivery_type?: Database["public"]["Enums"]["delivery_type"]
          district?: string | null
          id?: string
          items_text?: string | null
          notes?: string | null
          patient_name: string
          patient_phone: string
          prescription_image_url?: string | null
          status?: Database["public"]["Enums"]["medicine_order_status"]
          updated_at?: string
        }
        Update: {
          address?: string | null
          branch_id?: string | null
          created_at?: string
          delivery_type?: Database["public"]["Enums"]["delivery_type"]
          district?: string | null
          id?: string
          items_text?: string | null
          notes?: string | null
          patient_name?: string
          patient_phone?: string
          prescription_image_url?: string | null
          status?: Database["public"]["Enums"]["medicine_order_status"]
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "medicine_orders_branch_id_fkey"
            columns: ["branch_id"]
            isOneToOne: false
            referencedRelation: "branches"
            referencedColumns: ["id"]
          },
        ]
      }
      message_templates: {
        Row: {
          body: string
          channel: string
          created_at: string
          created_by: string | null
          description: string | null
          id: string
          is_active: boolean
          name: string
          template_key: string
          title: string | null
          updated_at: string
          updated_by: string | null
        }
        Insert: {
          body: string
          channel: string
          created_at?: string
          created_by?: string | null
          description?: string | null
          id?: string
          is_active?: boolean
          name: string
          template_key: string
          title?: string | null
          updated_at?: string
          updated_by?: string | null
        }
        Update: {
          body?: string
          channel?: string
          created_at?: string
          created_by?: string | null
          description?: string | null
          id?: string
          is_active?: boolean
          name?: string
          template_key?: string
          title?: string | null
          updated_at?: string
          updated_by?: string | null
        }
        Relationships: []
      }
      notifications: {
        Row: {
          appointment_id: string | null
          audience: string
          body: string | null
          branch_id: string | null
          channel: Database["public"]["Enums"]["notification_channel"]
          created_at: string
          id: string
          kind: string
          last_error: string | null
          metadata: Json | null
          read_at: string | null
          recipient: string | null
          send_status: Database["public"]["Enums"]["notification_send_status"]
          sent_at: string | null
          title: string
          user_id: string | null
        }
        Insert: {
          appointment_id?: string | null
          audience: string
          body?: string | null
          branch_id?: string | null
          channel?: Database["public"]["Enums"]["notification_channel"]
          created_at?: string
          id?: string
          kind: string
          last_error?: string | null
          metadata?: Json | null
          read_at?: string | null
          recipient?: string | null
          send_status?: Database["public"]["Enums"]["notification_send_status"]
          sent_at?: string | null
          title: string
          user_id?: string | null
        }
        Update: {
          appointment_id?: string | null
          audience?: string
          body?: string | null
          branch_id?: string | null
          channel?: Database["public"]["Enums"]["notification_channel"]
          created_at?: string
          id?: string
          kind?: string
          last_error?: string | null
          metadata?: Json | null
          read_at?: string | null
          recipient?: string | null
          send_status?: Database["public"]["Enums"]["notification_send_status"]
          sent_at?: string | null
          title?: string
          user_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "notifications_branch_id_fkey"
            columns: ["branch_id"]
            isOneToOne: false
            referencedRelation: "branches"
            referencedColumns: ["id"]
          },
        ]
      }
      nurse_calls: {
        Row: {
          accepted_at: string | null
          assigned_nurse_id: string | null
          branch_id: string | null
          called_at: string
          completed_at: string | null
          created_at: string
          id: string
          notes: string | null
          patient_id: string | null
          priority: string
          reason: string | null
          room_no: string | null
          status: string
          updated_at: string
        }
        Insert: {
          accepted_at?: string | null
          assigned_nurse_id?: string | null
          branch_id?: string | null
          called_at?: string
          completed_at?: string | null
          created_at?: string
          id?: string
          notes?: string | null
          patient_id?: string | null
          priority?: string
          reason?: string | null
          room_no?: string | null
          status?: string
          updated_at?: string
        }
        Update: {
          accepted_at?: string | null
          assigned_nurse_id?: string | null
          branch_id?: string | null
          called_at?: string
          completed_at?: string | null
          created_at?: string
          id?: string
          notes?: string | null
          patient_id?: string | null
          priority?: string
          reason?: string | null
          room_no?: string | null
          status?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "nurse_calls_assigned_nurse_id_fkey"
            columns: ["assigned_nurse_id"]
            isOneToOne: false
            referencedRelation: "nurses"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "nurse_calls_branch_id_fkey"
            columns: ["branch_id"]
            isOneToOne: false
            referencedRelation: "branches"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "nurse_calls_patient_id_fkey"
            columns: ["patient_id"]
            isOneToOne: false
            referencedRelation: "patients"
            referencedColumns: ["id"]
          },
        ]
      }
      nurse_shifts: {
        Row: {
          branch_id: string | null
          created_at: string
          created_by: string | null
          end_time: string
          id: string
          notes: string | null
          nurse_id: string
          shift_date: string
          shift_type: string
          start_time: string
          updated_at: string
        }
        Insert: {
          branch_id?: string | null
          created_at?: string
          created_by?: string | null
          end_time: string
          id?: string
          notes?: string | null
          nurse_id: string
          shift_date: string
          shift_type: string
          start_time: string
          updated_at?: string
        }
        Update: {
          branch_id?: string | null
          created_at?: string
          created_by?: string | null
          end_time?: string
          id?: string
          notes?: string | null
          nurse_id?: string
          shift_date?: string
          shift_type?: string
          start_time?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "nurse_shifts_branch_id_fkey"
            columns: ["branch_id"]
            isOneToOne: false
            referencedRelation: "branches"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "nurse_shifts_nurse_id_fkey"
            columns: ["nurse_id"]
            isOneToOne: false
            referencedRelation: "nurses"
            referencedColumns: ["id"]
          },
        ]
      }
      nurses: {
        Row: {
          branch_id: string | null
          created_at: string
          department: string | null
          email: string | null
          employee_no: string | null
          full_name: string
          id: string
          notes: string | null
          phone: string | null
          status: string
          updated_at: string
        }
        Insert: {
          branch_id?: string | null
          created_at?: string
          department?: string | null
          email?: string | null
          employee_no?: string | null
          full_name: string
          id?: string
          notes?: string | null
          phone?: string | null
          status?: string
          updated_at?: string
        }
        Update: {
          branch_id?: string | null
          created_at?: string
          department?: string | null
          email?: string | null
          employee_no?: string | null
          full_name?: string
          id?: string
          notes?: string | null
          phone?: string | null
          status?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "nurses_branch_id_fkey"
            columns: ["branch_id"]
            isOneToOne: false
            referencedRelation: "branches"
            referencedColumns: ["id"]
          },
        ]
      }
      patient_allergies: {
        Row: {
          allergen: string
          created_at: string
          id: string
          noted_on: string | null
          notes: string | null
          patient_id: string
          reaction: string | null
          recorded_by: string | null
          severity: Database["public"]["Enums"]["allergy_severity"]
          updated_at: string
        }
        Insert: {
          allergen: string
          created_at?: string
          id?: string
          noted_on?: string | null
          notes?: string | null
          patient_id: string
          reaction?: string | null
          recorded_by?: string | null
          severity?: Database["public"]["Enums"]["allergy_severity"]
          updated_at?: string
        }
        Update: {
          allergen?: string
          created_at?: string
          id?: string
          noted_on?: string | null
          notes?: string | null
          patient_id?: string
          reaction?: string | null
          recorded_by?: string | null
          severity?: Database["public"]["Enums"]["allergy_severity"]
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "patient_allergies_patient_id_fkey"
            columns: ["patient_id"]
            isOneToOne: false
            referencedRelation: "patients"
            referencedColumns: ["id"]
          },
        ]
      }
      patient_attachments: {
        Row: {
          category: Database["public"]["Enums"]["attachment_category"]
          created_at: string
          file_path: string
          id: string
          mime_type: string | null
          notes: string | null
          patient_id: string
          size_bytes: number | null
          title: string
          updated_at: string
          uploaded_by: string | null
          visit_id: string | null
        }
        Insert: {
          category?: Database["public"]["Enums"]["attachment_category"]
          created_at?: string
          file_path: string
          id?: string
          mime_type?: string | null
          notes?: string | null
          patient_id: string
          size_bytes?: number | null
          title: string
          updated_at?: string
          uploaded_by?: string | null
          visit_id?: string | null
        }
        Update: {
          category?: Database["public"]["Enums"]["attachment_category"]
          created_at?: string
          file_path?: string
          id?: string
          mime_type?: string | null
          notes?: string | null
          patient_id?: string
          size_bytes?: number | null
          title?: string
          updated_at?: string
          uploaded_by?: string | null
          visit_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "patient_attachments_patient_id_fkey"
            columns: ["patient_id"]
            isOneToOne: false
            referencedRelation: "patients"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "patient_attachments_visit_id_fkey"
            columns: ["visit_id"]
            isOneToOne: false
            referencedRelation: "patient_visits"
            referencedColumns: ["id"]
          },
        ]
      }
      patient_check_ins: {
        Row: {
          appointment_id: string
          checked_in_at: string
          created_at: string
          id: string
          notes: string | null
          patient_id: string | null
          queue_number: number | null
          status: string
          updated_at: string
        }
        Insert: {
          appointment_id: string
          checked_in_at?: string
          created_at?: string
          id?: string
          notes?: string | null
          patient_id?: string | null
          queue_number?: number | null
          status?: string
          updated_at?: string
        }
        Update: {
          appointment_id?: string
          checked_in_at?: string
          created_at?: string
          id?: string
          notes?: string | null
          patient_id?: string | null
          queue_number?: number | null
          status?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "patient_check_ins_appointment_id_fkey"
            columns: ["appointment_id"]
            isOneToOne: false
            referencedRelation: "appointments"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "patient_check_ins_patient_id_fkey"
            columns: ["patient_id"]
            isOneToOne: false
            referencedRelation: "patients"
            referencedColumns: ["id"]
          },
        ]
      }
      patient_immunizations: {
        Row: {
          administered_on: string
          created_at: string
          dose_number: number | null
          id: string
          lot_number: string | null
          next_due_on: string | null
          notes: string | null
          patient_id: string
          provider_name: string | null
          recorded_by: string | null
          route: string | null
          site: string | null
          updated_at: string
          vaccine_name: string
        }
        Insert: {
          administered_on: string
          created_at?: string
          dose_number?: number | null
          id?: string
          lot_number?: string | null
          next_due_on?: string | null
          notes?: string | null
          patient_id: string
          provider_name?: string | null
          recorded_by?: string | null
          route?: string | null
          site?: string | null
          updated_at?: string
          vaccine_name: string
        }
        Update: {
          administered_on?: string
          created_at?: string
          dose_number?: number | null
          id?: string
          lot_number?: string | null
          next_due_on?: string | null
          notes?: string | null
          patient_id?: string
          provider_name?: string | null
          recorded_by?: string | null
          route?: string | null
          site?: string | null
          updated_at?: string
          vaccine_name?: string
        }
        Relationships: [
          {
            foreignKeyName: "patient_immunizations_patient_id_fkey"
            columns: ["patient_id"]
            isOneToOne: false
            referencedRelation: "patients"
            referencedColumns: ["id"]
          },
        ]
      }
      patient_medical_history: {
        Row: {
          category: Database["public"]["Enums"]["medical_history_category"]
          condition: string
          created_at: string
          id: string
          notes: string | null
          onset_date: string | null
          patient_id: string
          recorded_by: string | null
          resolution_date: string | null
          status: Database["public"]["Enums"]["medical_history_status"]
          updated_at: string
        }
        Insert: {
          category?: Database["public"]["Enums"]["medical_history_category"]
          condition: string
          created_at?: string
          id?: string
          notes?: string | null
          onset_date?: string | null
          patient_id: string
          recorded_by?: string | null
          resolution_date?: string | null
          status?: Database["public"]["Enums"]["medical_history_status"]
          updated_at?: string
        }
        Update: {
          category?: Database["public"]["Enums"]["medical_history_category"]
          condition?: string
          created_at?: string
          id?: string
          notes?: string | null
          onset_date?: string | null
          patient_id?: string
          recorded_by?: string | null
          resolution_date?: string | null
          status?: Database["public"]["Enums"]["medical_history_status"]
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "patient_medical_history_patient_id_fkey"
            columns: ["patient_id"]
            isOneToOne: false
            referencedRelation: "patients"
            referencedColumns: ["id"]
          },
        ]
      }
      patient_medications: {
        Row: {
          created_at: string
          dosage: string | null
          end_date: string | null
          frequency: string | null
          id: string
          medication_name: string
          notes: string | null
          patient_id: string
          prescribed_by_name: string | null
          recorded_by: string | null
          route: string | null
          start_date: string | null
          status: Database["public"]["Enums"]["medication_status"]
          updated_at: string
        }
        Insert: {
          created_at?: string
          dosage?: string | null
          end_date?: string | null
          frequency?: string | null
          id?: string
          medication_name: string
          notes?: string | null
          patient_id: string
          prescribed_by_name?: string | null
          recorded_by?: string | null
          route?: string | null
          start_date?: string | null
          status?: Database["public"]["Enums"]["medication_status"]
          updated_at?: string
        }
        Update: {
          created_at?: string
          dosage?: string | null
          end_date?: string | null
          frequency?: string | null
          id?: string
          medication_name?: string
          notes?: string | null
          patient_id?: string
          prescribed_by_name?: string | null
          recorded_by?: string | null
          route?: string | null
          start_date?: string | null
          status?: Database["public"]["Enums"]["medication_status"]
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "patient_medications_patient_id_fkey"
            columns: ["patient_id"]
            isOneToOne: false
            referencedRelation: "patients"
            referencedColumns: ["id"]
          },
        ]
      }
      patient_qr_scans: {
        Row: {
          id: string
          patient_id: string
          scanned_at: string
          scanned_by: string | null
          source: string
          user_agent: string | null
        }
        Insert: {
          id?: string
          patient_id: string
          scanned_at?: string
          scanned_by?: string | null
          source?: string
          user_agent?: string | null
        }
        Update: {
          id?: string
          patient_id?: string
          scanned_at?: string
          scanned_by?: string | null
          source?: string
          user_agent?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "patient_qr_scans_patient_id_fkey"
            columns: ["patient_id"]
            isOneToOne: false
            referencedRelation: "patients"
            referencedColumns: ["id"]
          },
        ]
      }
      patient_ratings: {
        Row: {
          appointment_ref: string | null
          branch_id: string | null
          comment: string | null
          created_at: string
          created_by: string | null
          doctor_id: string | null
          id: string
          patient_name: string | null
          patient_phone: string | null
          rating: number
          source: string
          staff_reply: string | null
          staff_reply_at: string | null
          staff_reply_by: string | null
        }
        Insert: {
          appointment_ref?: string | null
          branch_id?: string | null
          comment?: string | null
          created_at?: string
          created_by?: string | null
          doctor_id?: string | null
          id?: string
          patient_name?: string | null
          patient_phone?: string | null
          rating: number
          source?: string
          staff_reply?: string | null
          staff_reply_at?: string | null
          staff_reply_by?: string | null
        }
        Update: {
          appointment_ref?: string | null
          branch_id?: string | null
          comment?: string | null
          created_at?: string
          created_by?: string | null
          doctor_id?: string | null
          id?: string
          patient_name?: string | null
          patient_phone?: string | null
          rating?: number
          source?: string
          staff_reply?: string | null
          staff_reply_at?: string | null
          staff_reply_by?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "patient_ratings_branch_id_fkey"
            columns: ["branch_id"]
            isOneToOne: false
            referencedRelation: "branches"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "patient_ratings_doctor_id_fkey"
            columns: ["doctor_id"]
            isOneToOne: false
            referencedRelation: "doctors"
            referencedColumns: ["id"]
          },
        ]
      }
      patient_stories: {
        Row: {
          body_md: string | null
          branch_id: string | null
          created_at: string
          display_order: number
          excerpt: string | null
          hero_image_url: string | null
          id: string
          published_at: string | null
          slug: string
          specialty: string | null
          status: string
          title_ar: string
          title_en: string | null
          updated_at: string
        }
        Insert: {
          body_md?: string | null
          branch_id?: string | null
          created_at?: string
          display_order?: number
          excerpt?: string | null
          hero_image_url?: string | null
          id?: string
          published_at?: string | null
          slug: string
          specialty?: string | null
          status?: string
          title_ar: string
          title_en?: string | null
          updated_at?: string
        }
        Update: {
          body_md?: string | null
          branch_id?: string | null
          created_at?: string
          display_order?: number
          excerpt?: string | null
          hero_image_url?: string | null
          id?: string
          published_at?: string | null
          slug?: string
          specialty?: string | null
          status?: string
          title_ar?: string
          title_en?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "patient_stories_branch_id_fkey"
            columns: ["branch_id"]
            isOneToOne: false
            referencedRelation: "branches"
            referencedColumns: ["id"]
          },
        ]
      }
      patient_surgeries: {
        Row: {
          complications: string | null
          created_at: string
          hospital: string | null
          id: string
          notes: string | null
          outcome: string | null
          patient_id: string
          procedure_name: string
          recorded_by: string | null
          surgeon_name: string | null
          surgery_date: string | null
          updated_at: string
        }
        Insert: {
          complications?: string | null
          created_at?: string
          hospital?: string | null
          id?: string
          notes?: string | null
          outcome?: string | null
          patient_id: string
          procedure_name: string
          recorded_by?: string | null
          surgeon_name?: string | null
          surgery_date?: string | null
          updated_at?: string
        }
        Update: {
          complications?: string | null
          created_at?: string
          hospital?: string | null
          id?: string
          notes?: string | null
          outcome?: string | null
          patient_id?: string
          procedure_name?: string
          recorded_by?: string | null
          surgeon_name?: string | null
          surgery_date?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "patient_surgeries_patient_id_fkey"
            columns: ["patient_id"]
            isOneToOne: false
            referencedRelation: "patients"
            referencedColumns: ["id"]
          },
        ]
      }
      patient_visits: {
        Row: {
          appointment_id: string | null
          assessment: string | null
          chief_complaint: string | null
          created_at: string
          created_by: string | null
          doctor_id: string | null
          follow_up_date: string | null
          id: string
          objective: string | null
          patient_id: string
          plan: string | null
          subjective: string | null
          updated_at: string
          visit_date: string
          vitals: Json | null
        }
        Insert: {
          appointment_id?: string | null
          assessment?: string | null
          chief_complaint?: string | null
          created_at?: string
          created_by?: string | null
          doctor_id?: string | null
          follow_up_date?: string | null
          id?: string
          objective?: string | null
          patient_id: string
          plan?: string | null
          subjective?: string | null
          updated_at?: string
          visit_date?: string
          vitals?: Json | null
        }
        Update: {
          appointment_id?: string | null
          assessment?: string | null
          chief_complaint?: string | null
          created_at?: string
          created_by?: string | null
          doctor_id?: string | null
          follow_up_date?: string | null
          id?: string
          objective?: string | null
          patient_id?: string
          plan?: string | null
          subjective?: string | null
          updated_at?: string
          visit_date?: string
          vitals?: Json | null
        }
        Relationships: [
          {
            foreignKeyName: "patient_visits_appointment_id_fkey"
            columns: ["appointment_id"]
            isOneToOne: false
            referencedRelation: "appointments"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "patient_visits_doctor_id_fkey"
            columns: ["doctor_id"]
            isOneToOne: false
            referencedRelation: "doctors"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "patient_visits_patient_id_fkey"
            columns: ["patient_id"]
            isOneToOne: false
            referencedRelation: "patients"
            referencedColumns: ["id"]
          },
        ]
      }
      patients: {
        Row: {
          address: string | null
          blood_type: string | null
          branch_id: string
          city: string | null
          created_at: string
          created_by: string | null
          date_of_birth: string | null
          email: string | null
          emergency_contact_name: string | null
          emergency_contact_phone: string | null
          full_name_ar: string
          full_name_en: string | null
          gender: Database["public"]["Enums"]["gender_type"] | null
          id: string
          is_active: boolean
          is_demo: boolean
          marital_status: string | null
          mrn: string
          national_id: string | null
          nationality: string | null
          notes: string | null
          notify_email: boolean
          notify_sms: boolean
          notify_whatsapp: boolean
          phone: string
          profile_id: string | null
          secondary_phone: string | null
          status: Database["public"]["Enums"]["patient_status"]
          tags: string[]
          updated_at: string
        }
        Insert: {
          address?: string | null
          blood_type?: string | null
          branch_id: string
          city?: string | null
          created_at?: string
          created_by?: string | null
          date_of_birth?: string | null
          email?: string | null
          emergency_contact_name?: string | null
          emergency_contact_phone?: string | null
          full_name_ar: string
          full_name_en?: string | null
          gender?: Database["public"]["Enums"]["gender_type"] | null
          id?: string
          is_active?: boolean
          is_demo?: boolean
          marital_status?: string | null
          mrn: string
          national_id?: string | null
          nationality?: string | null
          notes?: string | null
          notify_email?: boolean
          notify_sms?: boolean
          notify_whatsapp?: boolean
          phone: string
          profile_id?: string | null
          secondary_phone?: string | null
          status?: Database["public"]["Enums"]["patient_status"]
          tags?: string[]
          updated_at?: string
        }
        Update: {
          address?: string | null
          blood_type?: string | null
          branch_id?: string
          city?: string | null
          created_at?: string
          created_by?: string | null
          date_of_birth?: string | null
          email?: string | null
          emergency_contact_name?: string | null
          emergency_contact_phone?: string | null
          full_name_ar?: string
          full_name_en?: string | null
          gender?: Database["public"]["Enums"]["gender_type"] | null
          id?: string
          is_active?: boolean
          is_demo?: boolean
          marital_status?: string | null
          mrn?: string
          national_id?: string | null
          nationality?: string | null
          notes?: string | null
          notify_email?: boolean
          notify_sms?: boolean
          notify_whatsapp?: boolean
          phone?: string
          profile_id?: string | null
          secondary_phone?: string | null
          status?: Database["public"]["Enums"]["patient_status"]
          tags?: string[]
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "patients_branch_id_fkey"
            columns: ["branch_id"]
            isOneToOne: false
            referencedRelation: "branches"
            referencedColumns: ["id"]
          },
        ]
      }
      payments: {
        Row: {
          amount: number
          created_at: string
          currency: string
          gateway: string | null
          gateway_ref: string | null
          id: string
          invoice_id: string
          is_mock: boolean
          metadata: Json | null
          method: string
          paid_at: string | null
          status: string
          updated_at: string
        }
        Insert: {
          amount: number
          created_at?: string
          currency?: string
          gateway?: string | null
          gateway_ref?: string | null
          id?: string
          invoice_id: string
          is_mock?: boolean
          metadata?: Json | null
          method: string
          paid_at?: string | null
          status?: string
          updated_at?: string
        }
        Update: {
          amount?: number
          created_at?: string
          currency?: string
          gateway?: string | null
          gateway_ref?: string | null
          id?: string
          invoice_id?: string
          is_mock?: boolean
          metadata?: Json | null
          method?: string
          paid_at?: string | null
          status?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "payments_invoice_id_fkey"
            columns: ["invoice_id"]
            isOneToOne: false
            referencedRelation: "invoices"
            referencedColumns: ["id"]
          },
        ]
      }
      payroll_items: {
        Row: {
          allowances: number
          base_salary: number
          created_at: string
          deductions: number
          employee_id: string
          id: string
          net_pay: number
          notes: string | null
          run_id: string
        }
        Insert: {
          allowances?: number
          base_salary?: number
          created_at?: string
          deductions?: number
          employee_id: string
          id?: string
          net_pay?: number
          notes?: string | null
          run_id: string
        }
        Update: {
          allowances?: number
          base_salary?: number
          created_at?: string
          deductions?: number
          employee_id?: string
          id?: string
          net_pay?: number
          notes?: string | null
          run_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "payroll_items_employee_id_fkey"
            columns: ["employee_id"]
            isOneToOne: false
            referencedRelation: "employees"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "payroll_items_run_id_fkey"
            columns: ["run_id"]
            isOneToOne: false
            referencedRelation: "payroll_runs"
            referencedColumns: ["id"]
          },
        ]
      }
      payroll_runs: {
        Row: {
          created_at: string
          finalized_at: string | null
          finalized_by: string | null
          id: string
          notes: string | null
          period_month: number
          period_year: number
          status: string
          total_gross: number
          total_net: number
          updated_at: string
        }
        Insert: {
          created_at?: string
          finalized_at?: string | null
          finalized_by?: string | null
          id?: string
          notes?: string | null
          period_month: number
          period_year: number
          status?: string
          total_gross?: number
          total_net?: number
          updated_at?: string
        }
        Update: {
          created_at?: string
          finalized_at?: string | null
          finalized_by?: string | null
          id?: string
          notes?: string | null
          period_month?: number
          period_year?: number
          status?: string
          total_gross?: number
          total_net?: number
          updated_at?: string
        }
        Relationships: []
      }
      permissions: {
        Row: {
          category: string
          created_at: string
          description_ar: string
          description_en: string | null
          key: string
        }
        Insert: {
          category: string
          created_at?: string
          description_ar: string
          description_en?: string | null
          key: string
        }
        Update: {
          category?: string
          created_at?: string
          description_ar?: string
          description_en?: string | null
          key?: string
        }
        Relationships: []
      }
      prescriptions: {
        Row: {
          branch_id: string | null
          created_at: string
          created_by: string | null
          dispense_qty: number | null
          doctor_id: string | null
          dosage: string | null
          end_date: string | null
          id: string
          instructions: string | null
          is_demo: boolean
          item_id: string | null
          medication: string
          notes: string | null
          patient_id: string
          pharmacy_status: string
          refills_remaining: number
          review_notes: string | null
          reviewed_at: string | null
          reviewed_by: string | null
          start_date: string | null
          status: string
          updated_at: string
        }
        Insert: {
          branch_id?: string | null
          created_at?: string
          created_by?: string | null
          dispense_qty?: number | null
          doctor_id?: string | null
          dosage?: string | null
          end_date?: string | null
          id?: string
          instructions?: string | null
          is_demo?: boolean
          item_id?: string | null
          medication: string
          notes?: string | null
          patient_id: string
          pharmacy_status?: string
          refills_remaining?: number
          review_notes?: string | null
          reviewed_at?: string | null
          reviewed_by?: string | null
          start_date?: string | null
          status?: string
          updated_at?: string
        }
        Update: {
          branch_id?: string | null
          created_at?: string
          created_by?: string | null
          dispense_qty?: number | null
          doctor_id?: string | null
          dosage?: string | null
          end_date?: string | null
          id?: string
          instructions?: string | null
          is_demo?: boolean
          item_id?: string | null
          medication?: string
          notes?: string | null
          patient_id?: string
          pharmacy_status?: string
          refills_remaining?: number
          review_notes?: string | null
          reviewed_at?: string | null
          reviewed_by?: string | null
          start_date?: string | null
          status?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "prescriptions_branch_id_fkey"
            columns: ["branch_id"]
            isOneToOne: false
            referencedRelation: "branches"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "prescriptions_doctor_id_fkey"
            columns: ["doctor_id"]
            isOneToOne: false
            referencedRelation: "doctors"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "prescriptions_item_id_fkey"
            columns: ["item_id"]
            isOneToOne: false
            referencedRelation: "inventory_items"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "prescriptions_patient_id_fkey"
            columns: ["patient_id"]
            isOneToOne: false
            referencedRelation: "patients"
            referencedColumns: ["id"]
          },
        ]
      }
      profiles: {
        Row: {
          avatar_url: string | null
          created_at: string
          dark_mode: boolean
          date_of_birth: string | null
          default_branch_id: string | null
          emergency_contact_name: string | null
          emergency_contact_phone: string | null
          full_name: string | null
          gender: string | null
          id: string
          insurance_policy_no: string | null
          insurance_provider: string | null
          national_id: string | null
          notification_prefs: Json
          phone: string | null
          preferred_language: string
          updated_at: string
        }
        Insert: {
          avatar_url?: string | null
          created_at?: string
          dark_mode?: boolean
          date_of_birth?: string | null
          default_branch_id?: string | null
          emergency_contact_name?: string | null
          emergency_contact_phone?: string | null
          full_name?: string | null
          gender?: string | null
          id: string
          insurance_policy_no?: string | null
          insurance_provider?: string | null
          national_id?: string | null
          notification_prefs?: Json
          phone?: string | null
          preferred_language?: string
          updated_at?: string
        }
        Update: {
          avatar_url?: string | null
          created_at?: string
          dark_mode?: boolean
          date_of_birth?: string | null
          default_branch_id?: string | null
          emergency_contact_name?: string | null
          emergency_contact_phone?: string | null
          full_name?: string | null
          gender?: string | null
          id?: string
          insurance_policy_no?: string | null
          insurance_provider?: string | null
          national_id?: string | null
          notification_prefs?: Json
          phone?: string | null
          preferred_language?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "profiles_default_branch_id_fkey"
            columns: ["default_branch_id"]
            isOneToOne: false
            referencedRelation: "branches"
            referencedColumns: ["id"]
          },
        ]
      }
      purchase_request_items: {
        Row: {
          created_at: string
          estimated_price: number | null
          id: string
          item_id: string | null
          name_ar: string
          notes: string | null
          quantity: number
          request_id: string
          unit: string | null
        }
        Insert: {
          created_at?: string
          estimated_price?: number | null
          id?: string
          item_id?: string | null
          name_ar: string
          notes?: string | null
          quantity?: number
          request_id: string
          unit?: string | null
        }
        Update: {
          created_at?: string
          estimated_price?: number | null
          id?: string
          item_id?: string | null
          name_ar?: string
          notes?: string | null
          quantity?: number
          request_id?: string
          unit?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "purchase_request_items_item_id_fkey"
            columns: ["item_id"]
            isOneToOne: false
            referencedRelation: "inventory_items"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "purchase_request_items_request_id_fkey"
            columns: ["request_id"]
            isOneToOne: false
            referencedRelation: "purchase_requests"
            referencedColumns: ["id"]
          },
        ]
      }
      purchase_requests: {
        Row: {
          branch_id: string | null
          created_at: string
          id: string
          notes: string | null
          priority: string
          request_no: string | null
          requested_by: string | null
          review_notes: string | null
          reviewed_at: string | null
          reviewed_by: string | null
          status: string
          updated_at: string
        }
        Insert: {
          branch_id?: string | null
          created_at?: string
          id?: string
          notes?: string | null
          priority?: string
          request_no?: string | null
          requested_by?: string | null
          review_notes?: string | null
          reviewed_at?: string | null
          reviewed_by?: string | null
          status?: string
          updated_at?: string
        }
        Update: {
          branch_id?: string | null
          created_at?: string
          id?: string
          notes?: string | null
          priority?: string
          request_no?: string | null
          requested_by?: string | null
          review_notes?: string | null
          reviewed_at?: string | null
          reviewed_by?: string | null
          status?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "purchase_requests_branch_id_fkey"
            columns: ["branch_id"]
            isOneToOne: false
            referencedRelation: "branches"
            referencedColumns: ["id"]
          },
        ]
      }
      push_subscriptions: {
        Row: {
          auth: string
          created_at: string
          endpoint: string
          failure_count: number
          id: string
          last_seen_at: string
          p256dh: string
          updated_at: string
          user_agent: string | null
          user_id: string
        }
        Insert: {
          auth: string
          created_at?: string
          endpoint: string
          failure_count?: number
          id?: string
          last_seen_at?: string
          p256dh: string
          updated_at?: string
          user_agent?: string | null
          user_id: string
        }
        Update: {
          auth?: string
          created_at?: string
          endpoint?: string
          failure_count?: number
          id?: string
          last_seen_at?: string
          p256dh?: string
          updated_at?: string
          user_agent?: string | null
          user_id?: string
        }
        Relationships: []
      }
      radiology_reports: {
        Row: {
          body_part: string | null
          created_at: string
          file_path: string | null
          findings: string | null
          id: string
          is_demo: boolean
          modality: string
          ordered_by: string | null
          patient_id: string
          released_at: string | null
          report_date: string
          status: string
          updated_at: string
        }
        Insert: {
          body_part?: string | null
          created_at?: string
          file_path?: string | null
          findings?: string | null
          id?: string
          is_demo?: boolean
          modality: string
          ordered_by?: string | null
          patient_id: string
          released_at?: string | null
          report_date?: string
          status?: string
          updated_at?: string
        }
        Update: {
          body_part?: string | null
          created_at?: string
          file_path?: string | null
          findings?: string | null
          id?: string
          is_demo?: boolean
          modality?: string
          ordered_by?: string | null
          patient_id?: string
          released_at?: string | null
          report_date?: string
          status?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "radiology_reports_ordered_by_fkey"
            columns: ["ordered_by"]
            isOneToOne: false
            referencedRelation: "doctors"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "radiology_reports_patient_id_fkey"
            columns: ["patient_id"]
            isOneToOne: false
            referencedRelation: "patients"
            referencedColumns: ["id"]
          },
        ]
      }
      refunds: {
        Row: {
          amount: number
          approved_by: string | null
          created_at: string
          id: string
          is_mock: boolean
          payment_id: string
          reason: string | null
          requested_by: string | null
          status: string
          updated_at: string
        }
        Insert: {
          amount: number
          approved_by?: string | null
          created_at?: string
          id?: string
          is_mock?: boolean
          payment_id: string
          reason?: string | null
          requested_by?: string | null
          status?: string
          updated_at?: string
        }
        Update: {
          amount?: number
          approved_by?: string | null
          created_at?: string
          id?: string
          is_mock?: boolean
          payment_id?: string
          reason?: string | null
          requested_by?: string | null
          status?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "refunds_payment_id_fkey"
            columns: ["payment_id"]
            isOneToOne: false
            referencedRelation: "payments"
            referencedColumns: ["id"]
          },
        ]
      }
      reminder_preference_audit: {
        Row: {
          appointment_id: string
          changed_at: string
          changed_by: string | null
          id: string
          new_value: boolean | null
          old_value: boolean | null
          reason: string | null
          reminder_kind: string
          source: string
        }
        Insert: {
          appointment_id: string
          changed_at?: string
          changed_by?: string | null
          id?: string
          new_value?: boolean | null
          old_value?: boolean | null
          reason?: string | null
          reminder_kind: string
          source: string
        }
        Update: {
          appointment_id?: string
          changed_at?: string
          changed_by?: string | null
          id?: string
          new_value?: boolean | null
          old_value?: boolean | null
          reason?: string | null
          reminder_kind?: string
          source?: string
        }
        Relationships: [
          {
            foreignKeyName: "reminder_preference_audit_appointment_id_fkey"
            columns: ["appointment_id"]
            isOneToOne: false
            referencedRelation: "appointments"
            referencedColumns: ["id"]
          },
        ]
      }
      reminder_preferences: {
        Row: {
          appointment_lead_minutes: number
          created_at: string
          daily_repeat_days: number
          id: string
          medication_lead_minutes: number
          sleep_hour: number
          updated_at: string
          user_id: string
          wake_hour: number
        }
        Insert: {
          appointment_lead_minutes?: number
          created_at?: string
          daily_repeat_days?: number
          id?: string
          medication_lead_minutes?: number
          sleep_hour?: number
          updated_at?: string
          user_id: string
          wake_hour?: number
        }
        Update: {
          appointment_lead_minutes?: number
          created_at?: string
          daily_repeat_days?: number
          id?: string
          medication_lead_minutes?: number
          sleep_hour?: number
          updated_at?: string
          user_id?: string
          wake_hour?: number
        }
        Relationships: []
      }
      report_versions: {
        Row: {
          changed_at: string
          changed_by: string | null
          file_path: string | null
          id: string
          report_id: string
          summary: string | null
          version_number: number
        }
        Insert: {
          changed_at?: string
          changed_by?: string | null
          file_path?: string | null
          id?: string
          report_id: string
          summary?: string | null
          version_number: number
        }
        Update: {
          changed_at?: string
          changed_by?: string | null
          file_path?: string | null
          id?: string
          report_id?: string
          summary?: string | null
          version_number?: number
        }
        Relationships: [
          {
            foreignKeyName: "report_versions_report_id_fkey"
            columns: ["report_id"]
            isOneToOne: false
            referencedRelation: "medical_reports"
            referencedColumns: ["id"]
          },
        ]
      }
      role_permissions: {
        Row: {
          created_at: string
          created_by: string | null
          permission_key: string
          role: Database["public"]["Enums"]["app_role"]
        }
        Insert: {
          created_at?: string
          created_by?: string | null
          permission_key: string
          role: Database["public"]["Enums"]["app_role"]
        }
        Update: {
          created_at?: string
          created_by?: string | null
          permission_key?: string
          role?: Database["public"]["Enums"]["app_role"]
        }
        Relationships: [
          {
            foreignKeyName: "role_permissions_permission_key_fkey"
            columns: ["permission_key"]
            isOneToOne: false
            referencedRelation: "permissions"
            referencedColumns: ["key"]
          },
        ]
      }
      second_opinion_requests: {
        Row: {
          admin_notes: string | null
          created_at: string
          email: string | null
          id: string
          patient_name: string
          phone: string
          specialty: string
          status: string
          summary: string
          updated_at: string
          upload_paths: string[]
        }
        Insert: {
          admin_notes?: string | null
          created_at?: string
          email?: string | null
          id?: string
          patient_name: string
          phone: string
          specialty: string
          status?: string
          summary: string
          updated_at?: string
          upload_paths?: string[]
        }
        Update: {
          admin_notes?: string | null
          created_at?: string
          email?: string | null
          id?: string
          patient_name?: string
          phone?: string
          specialty?: string
          status?: string
          summary?: string
          updated_at?: string
          upload_paths?: string[]
        }
        Relationships: []
      }
      security_audit_log: {
        Row: {
          action: string
          actor: string | null
          appointment_id: string | null
          branch_id: string | null
          created_at: string
          from_status: string | null
          id: string
          ip_address: unknown
          metadata: Json | null
          reason: string | null
          record_id: string | null
          table_name: string | null
          to_status: string | null
          user_agent: string | null
        }
        Insert: {
          action: string
          actor?: string | null
          appointment_id?: string | null
          branch_id?: string | null
          created_at?: string
          from_status?: string | null
          id?: string
          ip_address?: unknown
          metadata?: Json | null
          reason?: string | null
          record_id?: string | null
          table_name?: string | null
          to_status?: string | null
          user_agent?: string | null
        }
        Update: {
          action?: string
          actor?: string | null
          appointment_id?: string | null
          branch_id?: string | null
          created_at?: string
          from_status?: string | null
          id?: string
          ip_address?: unknown
          metadata?: Json | null
          reason?: string | null
          record_id?: string | null
          table_name?: string | null
          to_status?: string | null
          user_agent?: string | null
        }
        Relationships: []
      }
      specialties: {
        Row: {
          created_at: string
          description_ar: string | null
          description_en: string | null
          icon: string | null
          id: string
          is_active: boolean
          name_ar: string
          name_en: string
          slug: string
          sort_order: number
        }
        Insert: {
          created_at?: string
          description_ar?: string | null
          description_en?: string | null
          icon?: string | null
          id?: string
          is_active?: boolean
          name_ar: string
          name_en: string
          slug: string
          sort_order?: number
        }
        Update: {
          created_at?: string
          description_ar?: string | null
          description_en?: string | null
          icon?: string | null
          id?: string
          is_active?: boolean
          name_ar?: string
          name_en?: string
          slug?: string
          sort_order?: number
        }
        Relationships: []
      }
      stock_movements: {
        Row: {
          branch_id: string | null
          created_at: string
          created_by: string | null
          id: string
          item_id: string
          movement_type: string
          quantity_delta: number
          reason: string | null
          reference: string | null
        }
        Insert: {
          branch_id?: string | null
          created_at?: string
          created_by?: string | null
          id?: string
          item_id: string
          movement_type: string
          quantity_delta: number
          reason?: string | null
          reference?: string | null
        }
        Update: {
          branch_id?: string | null
          created_at?: string
          created_by?: string | null
          id?: string
          item_id?: string
          movement_type?: string
          quantity_delta?: number
          reason?: string | null
          reference?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "stock_movements_branch_id_fkey"
            columns: ["branch_id"]
            isOneToOne: false
            referencedRelation: "branches"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "stock_movements_item_id_fkey"
            columns: ["item_id"]
            isOneToOne: false
            referencedRelation: "inventory_items"
            referencedColumns: ["id"]
          },
        ]
      }
      system_settings: {
        Row: {
          description: string | null
          key: string
          updated_at: string
          updated_by: string | null
          value: Json
        }
        Insert: {
          description?: string | null
          key: string
          updated_at?: string
          updated_by?: string | null
          value: Json
        }
        Update: {
          description?: string | null
          key?: string
          updated_at?: string
          updated_by?: string | null
          value?: Json
        }
        Relationships: []
      }
      transition_alert_rules: {
        Row: {
          created_at: string
          enabled: boolean
          id: string
          is_shared: boolean
          label: string | null
          scope: string
          status: string
          threshold: number
          updated_at: string
          user_id: string
        }
        Insert: {
          created_at?: string
          enabled?: boolean
          id?: string
          is_shared?: boolean
          label?: string | null
          scope: string
          status: string
          threshold: number
          updated_at?: string
          user_id: string
        }
        Update: {
          created_at?: string
          enabled?: boolean
          id?: string
          is_shared?: boolean
          label?: string | null
          scope?: string
          status?: string
          threshold?: number
          updated_at?: string
          user_id?: string
        }
        Relationships: []
      }
      user_roles: {
        Row: {
          branch_id: string | null
          created_at: string
          id: string
          is_global: boolean
          role: Database["public"]["Enums"]["app_role"]
          user_id: string
        }
        Insert: {
          branch_id?: string | null
          created_at?: string
          id?: string
          is_global?: boolean
          role: Database["public"]["Enums"]["app_role"]
          user_id: string
        }
        Update: {
          branch_id?: string | null
          created_at?: string
          id?: string
          is_global?: boolean
          role?: Database["public"]["Enums"]["app_role"]
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "user_roles_branch_id_fkey"
            columns: ["branch_id"]
            isOneToOne: false
            referencedRelation: "branches"
            referencedColumns: ["id"]
          },
        ]
      }
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      _appointment_belongs_to_me: { Args: { _phone: string }; Returns: boolean }
      _assert_branch_access: {
        Args: { _branch_id: string }
        Returns: undefined
      }
      _assert_slot_free: {
        Args: {
          _date: string
          _doctor_id: string
          _exclude_appt_id?: string
          _time: string
        }
        Returns: undefined
      }
      _assert_staff: { Args: never; Returns: undefined }
      _emit_appointment_notification: {
        Args: {
          _appt: Database["public"]["Tables"]["appointments"]["Row"]
          _body: string
          _kind: string
          _title: string
        }
        Returns: undefined
      }
      assign_user_role: {
        Args: {
          _branch_id?: string
          _ip?: string
          _role: Database["public"]["Enums"]["app_role"]
          _ua?: string
          _user_id: string
        }
        Returns: undefined
      }
      book_slot: {
        Args: {
          p_gender?: string
          p_national_id?: string
          p_notes?: string
          p_patient_email?: string
          p_patient_id?: string
          p_patient_name: string
          p_patient_phone: string
          p_reason?: string
          p_slot_id: string
        }
        Returns: string
      }
      can_access_patient: { Args: { _patient_id: string }; Returns: boolean }
      can_write_patient_clinical: {
        Args: { _patient_id: string }
        Returns: boolean
      }
      cancel_appointment_by_ref: {
        Args: { _phone: string; _reason?: string; _ref: string }
        Returns: boolean
      }
      cancel_order_by_ref: {
        Args: { _kind: string; _phone: string; _reason?: string; _ref: string }
        Returns: Json
      }
      dashboard_appointments_daily: {
        Args: { _branch_id?: string; _days?: number }
        Returns: {
          cancelled: number
          confirmed: number
          day: string
          no_show: number
          total: number
        }[]
      }
      dashboard_by_specialty: {
        Args: { _branch_id?: string; _days?: number }
        Returns: {
          count: number
          name_ar: string
          name_en: string
          specialty_id: string
        }[]
      }
      dashboard_kpis: { Args: { _branch_id?: string }; Returns: Json }
      dashboard_peak_hours: {
        Args: { _branch_id?: string; _days?: number }
        Returns: {
          count: number
          hour: number
        }[]
      }
      dashboard_recent_activity: {
        Args: { _branch_id?: string; _limit?: number }
        Returns: {
          appointment_id: string
          changed_at: string
          id: string
          new_status: Database["public"]["Enums"]["appointment_status"]
          old_status: Database["public"]["Enums"]["appointment_status"]
          patient_name: string
          reason: string
        }[]
      }
      dashboard_status_breakdown: {
        Args: { _branch_id?: string; _days?: number }
        Returns: {
          count: number
          status: string
        }[]
      }
      dashboard_upcoming: {
        Args: { _branch_id?: string; _limit?: number }
        Returns: {
          appointment_date: string
          appointment_time: string
          doctor_name_ar: string
          id: string
          patient_name: string
          patient_phone: string
          specialty_name_ar: string
          status: Database["public"]["Enums"]["appointment_status"]
        }[]
      }
      doctor_next_available_date: {
        Args: { _branch_id?: string; _doctor_id: string }
        Returns: string
      }
      doctor_occupancy: {
        Args: { _branch_id?: string; _days?: number }
        Returns: {
          booked: number
          branch_id: string
          capacity: number
          doctor_id: string
          is_active: boolean
          leave_days: number
          name_ar: string
          name_en: string
          occupancy_pct: number
          specialty_id: string
          specialty_name_ar: string
        }[]
      }
      enqueue_appointment_reminders: { Args: never; Returns: Json }
      estimate_appointment_cost: {
        Args: { _doctor_id: string; _provider_id: string }
        Returns: Json
      }
      generate_mrn: { Args: { _branch_id: string }; Returns: string }
      get_my_doctor_id: { Args: never; Returns: string }
      get_my_patient_id: { Args: never; Returns: string }
      get_order_by_ref: {
        Args: { _kind: string; _phone: string; _ref: string }
        Returns: {
          created_at: string
          id: string
          kind: string
          metadata: Json
          reference: string
          scheduled_at: string
          status: string
          title: string
        }[]
      }
      get_public_doctor_rating_summary: {
        Args: { _doctor_id: string }
        Returns: {
          average: number
          count: number
        }[]
      }
      get_ratings_summary: {
        Args: { _branch_id?: string; _days?: number; _doctor_id?: string }
        Returns: {
          avg_rating: number
          entity_id: string
          entity_name: string
          ratings_count: number
          scope: string
          stars_1: number
          stars_2: number
          stars_3: number
          stars_4: number
          stars_5: number
        }[]
      }
      has_branch_access: {
        Args: { _branch_id: string; _user_id: string }
        Returns: boolean
      }
      has_permission: {
        Args: { _permission_key: string; _user_id: string }
        Returns: boolean
      }
      has_role: {
        Args: {
          _role: Database["public"]["Enums"]["app_role"]
          _user_id: string
        }
        Returns: boolean
      }
      list_appointment_audit_by_ref: {
        Args: { _phone: string; _ref: string }
        Returns: {
          actor_kind: string
          changed_at: string
          new_notes: string
          new_status: string
          old_notes: string
          old_status: string
          reason: string
        }[]
      }
      list_doctor_leaves: {
        Args: {
          _branch_id?: string
          _doctor_id?: string
          _from: string
          _to: string
        }
        Returns: {
          all_day: boolean
          branch_id: string
          created_at: string
          doctor_id: string
          doctor_name_ar: string
          end_date: string
          id: string
          reason: string
          start_date: string
        }[]
      }
      list_doctors_next_slot: {
        Args: { _doctor_ids: string[] }
        Returns: {
          doctor_id: string
          next_slot_at: string
          next_slot_branch_id: string
        }[]
      }
      list_permissions_catalog: {
        Args: never
        Returns: {
          category: string
          description_ar: string
          description_en: string
          key: string
        }[]
      }
      list_pharmacy_prescriptions: {
        Args: { _branch_id?: string; _status?: string }
        Returns: {
          branch_id: string
          created_at: string
          dispense_qty: number
          doctor_id: string
          doctor_name: string
          dosage: string
          id: string
          instructions: string
          item_id: string
          medication: string
          patient_id: string
          patient_name: string
          pharmacy_status: string
          review_notes: string
          reviewed_at: string
        }[]
      }
      list_public_branches: {
        Args: never
        Returns: {
          address_ar: string
          address_en: string
          city_ar: string
          city_en: string
          description_ar: string
          description_en: string
          emergency_phone: string
          hero_image_url: string
          id: string
          lat: number
          lng: number
          map_embed_url: string
          name_ar: string
          name_en: string
          phone: string
          slug: string
          sort_order: number
          working_hours: Json
        }[]
      }
      list_public_branches_for_rating: {
        Args: never
        Returns: {
          id: string
          name_ar: string
          name_en: string
        }[]
      }
      list_public_doctor_ratings: {
        Args: { _doctor_id: string; _limit?: number }
        Returns: {
          comment: string
          created_at: string
          id: string
          patient_name: string
          rating: number
          staff_reply: string
          staff_reply_at: string
        }[]
      }
      list_public_doctors: {
        Args: {
          _branch_id?: string
          _gender?: string
          _language?: string
          _limit?: number
          _offset?: number
          _q?: string
          _specialty_slug?: string
        }
        Returns: {
          avg_rating: number
          bio_ar: string
          bio_en: string
          booking_enabled: boolean
          branch_id: string
          branch_name_ar: string
          branch_name_en: string
          gender: string
          id: string
          languages: string[]
          name_ar: string
          name_en: string
          photo_url: string
          ratings_count: number
          slug: string
          specialty_id: string
          specialty_name_ar: string
          specialty_name_en: string
          specialty_slug: string
          title_ar: string
          title_en: string
          years_experience: number
        }[]
      }
      list_public_doctors_for_rating: {
        Args: { _branch_id?: string }
        Returns: {
          branch_id: string
          id: string
          name_ar: string
          name_en: string
          specialty_name_ar: string
        }[]
      }
      list_public_excellence_centers: {
        Args: { _branch_id?: string }
        Returns: {
          description_ar: string
          description_en: string
          hero_image_url: string
          icon: string
          id: string
          name_ar: string
          name_en: string
          short_ar: string
          short_en: string
          slug: string
          sort_order: number
          specialty_id: string
        }[]
      }
      list_reminder_preferences_by_ref: {
        Args: { _phone: string; _ref: string }
        Returns: {
          changed_at: string
          id: string
          new_value: boolean
          old_value: boolean
          reason: string
          reminder_kind: string
          source: string
        }[]
      }
      list_role_permission_audit: {
        Args: { _limit?: number; _offset?: number }
        Returns: {
          action: string
          actor_email: string
          actor_id: string
          actor_name: string
          created_at: string
          id: string
          new_enabled: boolean
          permission_key: string
          permission_label_ar: string
          permission_label_en: string
          previous_enabled: boolean
          role_key: string
        }[]
      }
      list_role_permissions_matrix: {
        Args: never
        Returns: {
          permission_key: string
          role: Database["public"]["Enums"]["app_role"]
        }[]
      }
      list_users_with_roles: {
        Args: never
        Returns: {
          created_at: string
          email: string
          full_name: string
          phone: string
          roles: Json
          user_id: string
        }[]
      }
      log_auth_event: {
        Args: {
          _action: string
          _email?: string
          _ip?: string
          _metadata?: Json
          _ua?: string
          _user_id?: string
        }
        Returns: undefined
      }
      log_security_event:
        | {
            Args: {
              _action: string
              _appointment_id?: string
              _from_status?: string
              _metadata?: Json
              _reason?: string
              _to_status?: string
            }
            Returns: undefined
          }
        | {
            Args: {
              _action: string
              _appointment_id?: string
              _from_status?: string
              _ip_address?: string
              _metadata?: Json
              _reason?: string
              _to_status?: string
              _user_agent?: string
            }
            Returns: undefined
          }
      lookup_appointment: {
        Args: { _phone: string; _ref: string }
        Returns: {
          appointment_date: string
          appointment_time: string
          cancel_reason: string
          cancelled_at: string
          created_at: string
          doctor_id: string
          doctor_name_ar: string
          doctor_name_en: string
          id: string
          notes: string
          patient_name: string
          patient_phone: string
          reason: string
          reminder_24h: boolean
          reminder_2h: boolean
          specialty_id: string
          specialty_name_ar: string
          specialty_name_en: string
          status: Database["public"]["Enums"]["appointment_status"]
        }[]
      }
      lookup_complaint: {
        Args: { _phone: string; _ref: string }
        Returns: {
          created_at: string
          department: string
          id: string
          message: string
          reference: string
          status: string
          type: string
          updated_at: string
        }[]
      }
      mark_notifications_read: { Args: { _ids?: string[] }; Returns: number }
      my_appointments: {
        Args: never
        Returns: {
          appointment_date: string
          appointment_time: string
          created_at: string
          doctor_name_ar: string
          doctor_name_en: string
          id: string
          notes: string
          patient_name: string
          patient_phone: string
          reason: string
          specialty_name_ar: string
          specialty_name_en: string
          status: Database["public"]["Enums"]["appointment_status"]
        }[]
      }
      my_appointments_with_reminders: {
        Args: never
        Returns: {
          appointment_date: string
          appointment_time: string
          doctor_name_ar: string
          doctor_name_en: string
          id: string
          patient_name: string
          patient_phone: string
          reminder_24h: boolean
          reminder_2h: boolean
          specialty_name_ar: string
          specialty_name_en: string
          status: Database["public"]["Enums"]["appointment_status"]
        }[]
      }
      my_notifications: {
        Args: { _limit?: number }
        Returns: {
          appointment_id: string
          body: string
          created_at: string
          id: string
          kind: string
          metadata: Json
          read_at: string
          title: string
        }[]
      }
      my_reminder_preference_audit: {
        Args: { _appointment_id: string }
        Returns: {
          changed_at: string
          id: string
          new_value: boolean
          old_value: boolean
          reason: string
          reminder_kind: string
          source: string
        }[]
      }
      normalize_reason: { Args: { _raw: string }; Returns: string }
      patient_qr_scan_stats: {
        Args: { _patient_ids: string[] }
        Returns: {
          last_scanned_at: string
          patient_id: string
          scan_count: number
        }[]
      }
      pharmacy_review_prescription: {
        Args: {
          _decision: string
          _id: string
          _item_id?: string
          _notes?: string
          _quantity?: number
        }
        Returns: Json
      }
      release_slot: { Args: { p_appointment_id: string }; Returns: boolean }
      reply_to_rating: {
        Args: { _id: string; _reply: string }
        Returns: undefined
      }
      reschedule_appointment_by_ref: {
        Args: {
          _new_date: string
          _new_time: string
          _phone: string
          _reason?: string
          _ref: string
        }
        Returns: boolean
      }
      revoke_user_role: {
        Args: {
          _ip?: string
          _role: Database["public"]["Enums"]["app_role"]
          _ua?: string
          _user_id: string
        }
        Returns: undefined
      }
      set_role_permission: {
        Args: {
          _enabled: boolean
          _permission_key: string
          _role: Database["public"]["Enums"]["app_role"]
        }
        Returns: undefined
      }
      specialty_doctor_counts: {
        Args: never
        Returns: {
          doctor_count: number
          specialty_id: string
        }[]
      }
      submit_public_rating: {
        Args: {
          _appointment_ref?: string
          _branch_id: string
          _comment?: string
          _doctor_id: string
          _patient_name?: string
          _patient_phone?: string
          _rating: number
        }
        Returns: string
      }
      track_appointment: {
        Args: { _phone_last4: string; _ref: string }
        Returns: {
          appointment_date: string
          appointment_time: string
          cancelled_at: string
          created_at: string
          doctor_name_ar: string
          patient_name: string
          reference: string
          specialty_name_ar: string
          status: string
        }[]
      }
      track_orders_by_phone:
        | {
            Args: { _phone: string }
            Returns: {
              created_at: string
              kind: string
              reference: string
              scheduled_at: string
              status: string
              title: string
            }[]
          }
        | {
            Args: { _phone: string; _reference?: string }
            Returns: {
              created_at: string
              kind: string
              reference: string
              scheduled_at: string
              status: string
              title: string
            }[]
          }
      update_appointment_notes: {
        Args: { _id: string; _notes: string; _reason?: string }
        Returns: undefined
      }
      update_appointment_status: {
        Args: {
          _id: string
          _reason?: string
          _status: Database["public"]["Enums"]["appointment_status"]
        }
        Returns: undefined
      }
      update_reminders_by_ref: {
        Args: {
          _phone: string
          _reason?: string
          _ref: string
          _reminder_24h: boolean
          _reminder_2h: boolean
        }
        Returns: boolean
      }
    }
    Enums: {
      allergy_severity: "mild" | "moderate" | "severe" | "life_threatening"
      app_role:
        | "admin"
        | "reception"
        | "pharmacy"
        | "super_admin"
        | "doctor"
        | "patient"
        | "center_admin"
        | "branch_manager"
        | "reports_officer"
        | "billing_officer"
        | "insurance_officer"
        | "support_agent"
        | "content_manager"
        | "auditor"
      appointment_status:
        | "new"
        | "confirmed"
        | "completed"
        | "cancelled"
        | "no_show"
      attachment_category:
        | "lab"
        | "imaging"
        | "report"
        | "prescription"
        | "insurance"
        | "other"
      delivery_type: "pickup" | "delivery"
      gender_type: "male" | "female" | "other"
      medical_history_category: "chronic" | "past" | "family" | "surgical_note"
      medical_history_status: "active" | "resolved" | "managed"
      medication_status: "active" | "paused" | "stopped" | "completed"
      medicine_order_status:
        | "new"
        | "preparing"
        | "ready"
        | "out_for_delivery"
        | "delivered"
        | "cancelled"
      notification_channel: "in_app" | "sms" | "whatsapp" | "email" | "web_push"
      notification_send_status:
        | "pending"
        | "queued"
        | "sent"
        | "failed"
        | "skipped"
      patient_status: "active" | "inactive" | "archived" | "deceased"
    }
    CompositeTypes: {
      [_ in never]: never
    }
  }
}

type DatabaseWithoutInternals = Omit<Database, "__InternalSupabase">

type DefaultSchema = DatabaseWithoutInternals[Extract<keyof Database, "public">]

export type Tables<
  DefaultSchemaTableNameOrOptions extends
    | keyof (DefaultSchema["Tables"] & DefaultSchema["Views"])
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
        DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])
    : never = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
      DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])[TableName] extends {
      Row: infer R
    }
    ? R
    : never
  : DefaultSchemaTableNameOrOptions extends keyof (DefaultSchema["Tables"] &
        DefaultSchema["Views"])
    ? (DefaultSchema["Tables"] &
        DefaultSchema["Views"])[DefaultSchemaTableNameOrOptions] extends {
        Row: infer R
      }
      ? R
      : never
    : never

export type TablesInsert<
  DefaultSchemaTableNameOrOptions extends
    | keyof DefaultSchema["Tables"]
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"][TableName] extends {
      Insert: infer I
    }
    ? I
    : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema["Tables"]
    ? DefaultSchema["Tables"][DefaultSchemaTableNameOrOptions] extends {
        Insert: infer I
      }
      ? I
      : never
    : never

export type TablesUpdate<
  DefaultSchemaTableNameOrOptions extends
    | keyof DefaultSchema["Tables"]
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"][TableName] extends {
      Update: infer U
    }
    ? U
    : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema["Tables"]
    ? DefaultSchema["Tables"][DefaultSchemaTableNameOrOptions] extends {
        Update: infer U
      }
      ? U
      : never
    : never

export type Enums<
  DefaultSchemaEnumNameOrOptions extends
    | keyof DefaultSchema["Enums"]
    | { schema: keyof DatabaseWithoutInternals },
  EnumName extends DefaultSchemaEnumNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"]
    : never = never,
> = DefaultSchemaEnumNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"][EnumName]
  : DefaultSchemaEnumNameOrOptions extends keyof DefaultSchema["Enums"]
    ? DefaultSchema["Enums"][DefaultSchemaEnumNameOrOptions]
    : never

export type CompositeTypes<
  PublicCompositeTypeNameOrOptions extends
    | keyof DefaultSchema["CompositeTypes"]
    | { schema: keyof DatabaseWithoutInternals },
  CompositeTypeName extends PublicCompositeTypeNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"]
    : never = never,
> = PublicCompositeTypeNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"][CompositeTypeName]
  : PublicCompositeTypeNameOrOptions extends keyof DefaultSchema["CompositeTypes"]
    ? DefaultSchema["CompositeTypes"][PublicCompositeTypeNameOrOptions]
    : never

export const Constants = {
  public: {
    Enums: {
      allergy_severity: ["mild", "moderate", "severe", "life_threatening"],
      app_role: [
        "admin",
        "reception",
        "pharmacy",
        "super_admin",
        "doctor",
        "patient",
        "center_admin",
        "branch_manager",
        "reports_officer",
        "billing_officer",
        "insurance_officer",
        "support_agent",
        "content_manager",
        "auditor",
      ],
      appointment_status: [
        "new",
        "confirmed",
        "completed",
        "cancelled",
        "no_show",
      ],
      attachment_category: [
        "lab",
        "imaging",
        "report",
        "prescription",
        "insurance",
        "other",
      ],
      delivery_type: ["pickup", "delivery"],
      gender_type: ["male", "female", "other"],
      medical_history_category: ["chronic", "past", "family", "surgical_note"],
      medical_history_status: ["active", "resolved", "managed"],
      medication_status: ["active", "paused", "stopped", "completed"],
      medicine_order_status: [
        "new",
        "preparing",
        "ready",
        "out_for_delivery",
        "delivered",
        "cancelled",
      ],
      notification_channel: ["in_app", "sms", "whatsapp", "email", "web_push"],
      notification_send_status: [
        "pending",
        "queued",
        "sent",
        "failed",
        "skipped",
      ],
      patient_status: ["active", "inactive", "archived", "deceased"],
    },
  },
} as const
