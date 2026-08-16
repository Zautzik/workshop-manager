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
    PostgrestVersion: "14.1"
  }
  graphql_public: {
    Tables: {
      [_ in never]: never
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      graphql: {
        Args: {
          extensions?: Json
          operationName?: string
          query?: string
          variables?: Json
        }
        Returns: Json
      }
    }
    Enums: {
      [_ in never]: never
    }
    CompositeTypes: {
      [_ in never]: never
    }
  }
  public: {
    Tables: {
      app_settings: {
        Row: {
          key: string
          updated_at: string
          value: Json
        }
        Insert: {
          key: string
          updated_at?: string
          value?: Json
        }
        Update: {
          key?: string
          updated_at?: string
          value?: Json
        }
        Relationships: []
      }
      attendance_events: {
        Row: {
          at: string
          created_at: string
          employee_id: string | null
          event_type: string
          id: string
          machine_id: string | null
          metadata: Json
          method: string
        }
        Insert: {
          at?: string
          created_at?: string
          employee_id?: string | null
          event_type: string
          id?: string
          machine_id?: string | null
          metadata?: Json
          method?: string
        }
        Update: {
          at?: string
          created_at?: string
          employee_id?: string | null
          event_type?: string
          id?: string
          machine_id?: string | null
          metadata?: Json
          method?: string
        }
        Relationships: [
          {
            foreignKeyName: "attendance_events_employee_id_fkey"
            columns: ["employee_id"]
            isOneToOne: false
            referencedRelation: "employees"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "attendance_events_employee_id_fkey"
            columns: ["employee_id"]
            isOneToOne: false
            referencedRelation: "worker_stats"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "attendance_events_machine_id_fkey"
            columns: ["machine_id"]
            isOneToOne: false
            referencedRelation: "machines"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "attendance_events_machine_id_fkey"
            columns: ["machine_id"]
            isOneToOne: false
            referencedRelation: "planta_live"
            referencedColumns: ["machine_id"]
          },
          {
            foreignKeyName: "attendance_events_machine_id_fkey"
            columns: ["machine_id"]
            isOneToOne: false
            referencedRelation: "planta_live"
            referencedColumns: ["workstation_id"]
          },
        ]
      }
      bulk_operation_jobs: {
        Row: {
          completed_at: string | null
          created_at: string
          error_message: string | null
          id: string
          operation_type: string
          payload: Json
          requested_by: string
          result: Json
          status: Database["public"]["Enums"]["bulk_job_status"]
        }
        Insert: {
          completed_at?: string | null
          created_at?: string
          error_message?: string | null
          id?: string
          operation_type: string
          payload?: Json
          requested_by: string
          result?: Json
          status?: Database["public"]["Enums"]["bulk_job_status"]
        }
        Update: {
          completed_at?: string | null
          created_at?: string
          error_message?: string | null
          id?: string
          operation_type?: string
          payload?: Json
          requested_by?: string
          result?: Json
          status?: Database["public"]["Enums"]["bulk_job_status"]
        }
        Relationships: []
      }
      capture_events: {
        Row: {
          applied: boolean
          applied_ref_id: string | null
          applied_ref_type: string | null
          channel: Database["public"]["Enums"]["capture_channel"]
          corrected_costs: Json | null
          corrected_data: Json | null
          created_at: string
          domain: Database["public"]["Enums"]["capture_domain"]
          elapsed_minutes: number | null
          event_type: string
          guide_id: string | null
          id: string
          inferred_costs: Json | null
          item_id: string | null
          legacy_id: string | null
          legacy_table: string | null
          lot_id: string | null
          message_timestamp: string
          operator_employee_id: string | null
          operator_name: string | null
          operator_phone: string | null
          ot_id: string | null
          ot_number: string | null
          parsed_data: Json | null
          photo_url: string | null
          purchase_id: string | null
          quantity: number | null
          raw_message: string | null
          review_comments: string | null
          reviewed_at: string | null
          reviewed_by: string | null
          scanned_value: string | null
          status: Database["public"]["Enums"]["capture_status"]
          unit: string | null
          unit_cost: number | null
          updated_at: string
        }
        Insert: {
          applied?: boolean
          applied_ref_id?: string | null
          applied_ref_type?: string | null
          channel?: Database["public"]["Enums"]["capture_channel"]
          corrected_costs?: Json | null
          corrected_data?: Json | null
          created_at?: string
          domain: Database["public"]["Enums"]["capture_domain"]
          elapsed_minutes?: number | null
          event_type: string
          guide_id?: string | null
          id?: string
          inferred_costs?: Json | null
          item_id?: string | null
          legacy_id?: string | null
          legacy_table?: string | null
          lot_id?: string | null
          message_timestamp?: string
          operator_employee_id?: string | null
          operator_name?: string | null
          operator_phone?: string | null
          ot_id?: string | null
          ot_number?: string | null
          parsed_data?: Json | null
          photo_url?: string | null
          purchase_id?: string | null
          quantity?: number | null
          raw_message?: string | null
          review_comments?: string | null
          reviewed_at?: string | null
          reviewed_by?: string | null
          scanned_value?: string | null
          status?: Database["public"]["Enums"]["capture_status"]
          unit?: string | null
          unit_cost?: number | null
          updated_at?: string
        }
        Update: {
          applied?: boolean
          applied_ref_id?: string | null
          applied_ref_type?: string | null
          channel?: Database["public"]["Enums"]["capture_channel"]
          corrected_costs?: Json | null
          corrected_data?: Json | null
          created_at?: string
          domain?: Database["public"]["Enums"]["capture_domain"]
          elapsed_minutes?: number | null
          event_type?: string
          guide_id?: string | null
          id?: string
          inferred_costs?: Json | null
          item_id?: string | null
          legacy_id?: string | null
          legacy_table?: string | null
          lot_id?: string | null
          message_timestamp?: string
          operator_employee_id?: string | null
          operator_name?: string | null
          operator_phone?: string | null
          ot_id?: string | null
          ot_number?: string | null
          parsed_data?: Json | null
          photo_url?: string | null
          purchase_id?: string | null
          quantity?: number | null
          raw_message?: string | null
          review_comments?: string | null
          reviewed_at?: string | null
          reviewed_by?: string | null
          scanned_value?: string | null
          status?: Database["public"]["Enums"]["capture_status"]
          unit?: string | null
          unit_cost?: number | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "capture_events_item_id_fkey"
            columns: ["item_id"]
            isOneToOne: false
            referencedRelation: "inventory_items"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "capture_events_item_id_fkey"
            columns: ["item_id"]
            isOneToOne: false
            referencedRelation: "inventory_items_stock_v"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "capture_events_item_id_fkey"
            columns: ["item_id"]
            isOneToOne: false
            referencedRelation: "inventory_low_stock_alerts_v"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "capture_events_item_id_fkey"
            columns: ["item_id"]
            isOneToOne: false
            referencedRelation: "material_cost_v"
            referencedColumns: ["item_id"]
          },
          {
            foreignKeyName: "capture_events_lot_id_fkey"
            columns: ["lot_id"]
            isOneToOne: false
            referencedRelation: "inventory_lots"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "capture_events_ot_id_fkey"
            columns: ["ot_id"]
            isOneToOne: false
            referencedRelation: "ot_certificacion"
            referencedColumns: ["ot_id"]
          },
          {
            foreignKeyName: "capture_events_ot_id_fkey"
            columns: ["ot_id"]
            isOneToOne: false
            referencedRelation: "ot_compras_estado"
            referencedColumns: ["ot_id"]
          },
          {
            foreignKeyName: "capture_events_ot_id_fkey"
            columns: ["ot_id"]
            isOneToOne: false
            referencedRelation: "ot_cost_summary"
            referencedColumns: ["ot_id"]
          },
          {
            foreignKeyName: "capture_events_ot_id_fkey"
            columns: ["ot_id"]
            isOneToOne: false
            referencedRelation: "ot_fulfillment"
            referencedColumns: ["ot_id"]
          },
          {
            foreignKeyName: "capture_events_ot_id_fkey"
            columns: ["ot_id"]
            isOneToOne: false
            referencedRelation: "ots"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "capture_events_purchase_id_fkey"
            columns: ["purchase_id"]
            isOneToOne: false
            referencedRelation: "machine_parts_on_order_v"
            referencedColumns: ["purchase_id"]
          },
          {
            foreignKeyName: "capture_events_purchase_id_fkey"
            columns: ["purchase_id"]
            isOneToOne: false
            referencedRelation: "oc_billing"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "capture_events_purchase_id_fkey"
            columns: ["purchase_id"]
            isOneToOne: false
            referencedRelation: "oc_conciliacion"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "capture_events_purchase_id_fkey"
            columns: ["purchase_id"]
            isOneToOne: false
            referencedRelation: "purchases"
            referencedColumns: ["id"]
          },
        ]
      }
      certification_requirements: {
        Row: {
          created_at: string
          id: string
          material_category: string | null
          min_days_valid_at_use: number
          notes: string | null
          override_role: string | null
          updated_at: string
        }
        Insert: {
          created_at?: string
          id?: string
          material_category?: string | null
          min_days_valid_at_use?: number
          notes?: string | null
          override_role?: string | null
          updated_at?: string
        }
        Update: {
          created_at?: string
          id?: string
          material_category?: string | null
          min_days_valid_at_use?: number
          notes?: string | null
          override_role?: string | null
          updated_at?: string
        }
        Relationships: []
      }
      clients: {
        Row: {
          address: string | null
          city: string | null
          contact_name: string | null
          created_at: string
          email: string | null
          id: string
          is_active: boolean
          name: string
          notes: string | null
          payment_terms: string | null
          phone: string | null
          rut: string | null
          salesman_id: string | null
          updated_at: string
        }
        Insert: {
          address?: string | null
          city?: string | null
          contact_name?: string | null
          created_at?: string
          email?: string | null
          id?: string
          is_active?: boolean
          name: string
          notes?: string | null
          payment_terms?: string | null
          phone?: string | null
          rut?: string | null
          salesman_id?: string | null
          updated_at?: string
        }
        Update: {
          address?: string | null
          city?: string | null
          contact_name?: string | null
          created_at?: string
          email?: string | null
          id?: string
          is_active?: boolean
          name?: string
          notes?: string | null
          payment_terms?: string | null
          phone?: string | null
          rut?: string | null
          salesman_id?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "clients_salesman_id_fkey"
            columns: ["salesman_id"]
            isOneToOne: false
            referencedRelation: "employees"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "clients_salesman_id_fkey"
            columns: ["salesman_id"]
            isOneToOne: false
            referencedRelation: "worker_stats"
            referencedColumns: ["id"]
          },
        ]
      }
      compensation_rates: {
        Row: {
          created_at: string
          created_by: string | null
          currency_code: string
          effective_from: string
          effective_to: string | null
          employee_id: string
          hourly_rate: number
          id: string
          incentive_eligibility: boolean
          night_shift_multiplier: number
          overtime_multiplier_100: number
          overtime_multiplier_50: number
          updated_at: string
          weekend_multiplier: number
        }
        Insert: {
          created_at?: string
          created_by?: string | null
          currency_code?: string
          effective_from: string
          effective_to?: string | null
          employee_id: string
          hourly_rate?: number
          id?: string
          incentive_eligibility?: boolean
          night_shift_multiplier?: number
          overtime_multiplier_100?: number
          overtime_multiplier_50?: number
          updated_at?: string
          weekend_multiplier?: number
        }
        Update: {
          created_at?: string
          created_by?: string | null
          currency_code?: string
          effective_from?: string
          effective_to?: string | null
          employee_id?: string
          hourly_rate?: number
          id?: string
          incentive_eligibility?: boolean
          night_shift_multiplier?: number
          overtime_multiplier_100?: number
          overtime_multiplier_50?: number
          updated_at?: string
          weekend_multiplier?: number
        }
        Relationships: [
          {
            foreignKeyName: "compensation_rates_employee_id_fkey"
            columns: ["employee_id"]
            isOneToOne: false
            referencedRelation: "employees"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "compensation_rates_employee_id_fkey"
            columns: ["employee_id"]
            isOneToOne: false
            referencedRelation: "worker_stats"
            referencedColumns: ["id"]
          },
        ]
      }
      cost_catalog: {
        Row: {
          catalog_key: string | null
          category: string
          created_at: string
          id: string
          is_active: boolean
          name: string
          notes: string | null
          unit: string
          unit_cost: number
          updated_at: string
        }
        Insert: {
          catalog_key?: string | null
          category: string
          created_at?: string
          id?: string
          is_active?: boolean
          name: string
          notes?: string | null
          unit?: string
          unit_cost?: number
          updated_at?: string
        }
        Update: {
          catalog_key?: string | null
          category?: string
          created_at?: string
          id?: string
          is_active?: boolean
          name?: string
          notes?: string | null
          unit?: string
          unit_cost?: number
          updated_at?: string
        }
        Relationships: []
      }
      dies: {
        Row: {
          acquired_on: string | null
          acquisition_cost: number | null
          cavities: number
          client_id: string | null
          code: string
          created_at: string
          exclusive: boolean
          height_cm: number | null
          id: string
          last_used_at: string | null
          name: string
          notes: string | null
          product_type: string | null
          shelf_location: string | null
          status: string
          times_used: number
          updated_at: string
          width_cm: number | null
        }
        Insert: {
          acquired_on?: string | null
          acquisition_cost?: number | null
          cavities?: number
          client_id?: string | null
          code: string
          created_at?: string
          exclusive?: boolean
          height_cm?: number | null
          id?: string
          last_used_at?: string | null
          name: string
          notes?: string | null
          product_type?: string | null
          shelf_location?: string | null
          status?: string
          times_used?: number
          updated_at?: string
          width_cm?: number | null
        }
        Update: {
          acquired_on?: string | null
          acquisition_cost?: number | null
          cavities?: number
          client_id?: string | null
          code?: string
          created_at?: string
          exclusive?: boolean
          height_cm?: number | null
          id?: string
          last_used_at?: string | null
          name?: string
          notes?: string | null
          product_type?: string | null
          shelf_location?: string | null
          status?: string
          times_used?: number
          updated_at?: string
          width_cm?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "dies_client_id_fkey"
            columns: ["client_id"]
            isOneToOne: false
            referencedRelation: "clients"
            referencedColumns: ["id"]
          },
        ]
      }
      dispatch_guides: {
        Row: {
          carrier: string | null
          client_id: string | null
          client_name: string | null
          created_at: string
          dispatch_date: string
          guide_number: string
          id: string
          invoice_id: string | null
          notes: string | null
          ot_id: string | null
          quantity: number
          received_by: string | null
          status: Database["public"]["Enums"]["dispatch_status"]
          updated_at: string
          vehicle_plate: string | null
        }
        Insert: {
          carrier?: string | null
          client_id?: string | null
          client_name?: string | null
          created_at?: string
          dispatch_date?: string
          guide_number?: string
          id?: string
          invoice_id?: string | null
          notes?: string | null
          ot_id?: string | null
          quantity?: number
          received_by?: string | null
          status?: Database["public"]["Enums"]["dispatch_status"]
          updated_at?: string
          vehicle_plate?: string | null
        }
        Update: {
          carrier?: string | null
          client_id?: string | null
          client_name?: string | null
          created_at?: string
          dispatch_date?: string
          guide_number?: string
          id?: string
          invoice_id?: string | null
          notes?: string | null
          ot_id?: string | null
          quantity?: number
          received_by?: string | null
          status?: Database["public"]["Enums"]["dispatch_status"]
          updated_at?: string
          vehicle_plate?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "dispatch_guides_client_id_fkey"
            columns: ["client_id"]
            isOneToOne: false
            referencedRelation: "clients"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "dispatch_guides_invoice_id_fkey"
            columns: ["invoice_id"]
            isOneToOne: false
            referencedRelation: "sales_invoices"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "dispatch_guides_ot_id_fkey"
            columns: ["ot_id"]
            isOneToOne: false
            referencedRelation: "ot_certificacion"
            referencedColumns: ["ot_id"]
          },
          {
            foreignKeyName: "dispatch_guides_ot_id_fkey"
            columns: ["ot_id"]
            isOneToOne: false
            referencedRelation: "ot_compras_estado"
            referencedColumns: ["ot_id"]
          },
          {
            foreignKeyName: "dispatch_guides_ot_id_fkey"
            columns: ["ot_id"]
            isOneToOne: false
            referencedRelation: "ot_cost_summary"
            referencedColumns: ["ot_id"]
          },
          {
            foreignKeyName: "dispatch_guides_ot_id_fkey"
            columns: ["ot_id"]
            isOneToOne: false
            referencedRelation: "ot_fulfillment"
            referencedColumns: ["ot_id"]
          },
          {
            foreignKeyName: "dispatch_guides_ot_id_fkey"
            columns: ["ot_id"]
            isOneToOne: false
            referencedRelation: "ots"
            referencedColumns: ["id"]
          },
        ]
      }
      employee_incentives: {
        Row: {
          amount: number
          approved_by: string | null
          awarded_date: string
          created_at: string
          currency_code: string
          employee_id: string
          id: string
          incentive_rule_id: string | null
          notes: string | null
          period_end: string | null
          period_start: string | null
          status: Database["public"]["Enums"]["incentive_award_status"]
          updated_at: string
        }
        Insert: {
          amount?: number
          approved_by?: string | null
          awarded_date?: string
          created_at?: string
          currency_code?: string
          employee_id: string
          id?: string
          incentive_rule_id?: string | null
          notes?: string | null
          period_end?: string | null
          period_start?: string | null
          status?: Database["public"]["Enums"]["incentive_award_status"]
          updated_at?: string
        }
        Update: {
          amount?: number
          approved_by?: string | null
          awarded_date?: string
          created_at?: string
          currency_code?: string
          employee_id?: string
          id?: string
          incentive_rule_id?: string | null
          notes?: string | null
          period_end?: string | null
          period_start?: string | null
          status?: Database["public"]["Enums"]["incentive_award_status"]
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "employee_incentives_employee_id_fkey"
            columns: ["employee_id"]
            isOneToOne: false
            referencedRelation: "employees"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "employee_incentives_employee_id_fkey"
            columns: ["employee_id"]
            isOneToOne: false
            referencedRelation: "worker_stats"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "employee_incentives_incentive_rule_id_fkey"
            columns: ["incentive_rule_id"]
            isOneToOne: false
            referencedRelation: "incentive_rules"
            referencedColumns: ["id"]
          },
        ]
      }
      employee_skills: {
        Row: {
          assessment_method: string | null
          assessor_id: string | null
          certification_expires_on: string | null
          certified: boolean
          created_at: string
          demonstrated_proficiency_date: string | null
          employee_id: string
          hours_practiced: number | null
          id: string
          last_assessed_on: string | null
          notes: string | null
          proficiency_level: number
          skill_id: string
          source_of_knowledge: string | null
          updated_at: string
        }
        Insert: {
          assessment_method?: string | null
          assessor_id?: string | null
          certification_expires_on?: string | null
          certified?: boolean
          created_at?: string
          demonstrated_proficiency_date?: string | null
          employee_id: string
          hours_practiced?: number | null
          id?: string
          last_assessed_on?: string | null
          notes?: string | null
          proficiency_level?: number
          skill_id: string
          source_of_knowledge?: string | null
          updated_at?: string
        }
        Update: {
          assessment_method?: string | null
          assessor_id?: string | null
          certification_expires_on?: string | null
          certified?: boolean
          created_at?: string
          demonstrated_proficiency_date?: string | null
          employee_id?: string
          hours_practiced?: number | null
          id?: string
          last_assessed_on?: string | null
          notes?: string | null
          proficiency_level?: number
          skill_id?: string
          source_of_knowledge?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "employee_skills_employee_id_fkey"
            columns: ["employee_id"]
            isOneToOne: false
            referencedRelation: "employees"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "employee_skills_employee_id_fkey"
            columns: ["employee_id"]
            isOneToOne: false
            referencedRelation: "worker_stats"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "employee_skills_skill_id_fkey"
            columns: ["skill_id"]
            isOneToOne: false
            referencedRelation: "skills"
            referencedColumns: ["id"]
          },
        ]
      }
      employees: {
        Row: {
          attendance_score: number | null
          badge_code: string | null
          created_at: string
          department: string
          email: string | null
          emergency_contact_name: string | null
          emergency_contact_phone: string | null
          employee_code: string | null
          full_name: string
          hire_date: string | null
          id: string
          lateness_minutes: number | null
          notes: string | null
          overall_rating: number | null
          overtime_availability: boolean | null
          phone: string | null
          quality_score: number | null
          sheets_per_hour: number | null
          speed_score: number | null
          status: Database["public"]["Enums"]["employee_status"]
          teamwork_rating: number | null
          termination_date: string | null
          updated_at: string
          user_id: string | null
        }
        Insert: {
          attendance_score?: number | null
          badge_code?: string | null
          created_at?: string
          department: string
          email?: string | null
          emergency_contact_name?: string | null
          emergency_contact_phone?: string | null
          employee_code?: string | null
          full_name: string
          hire_date?: string | null
          id?: string
          lateness_minutes?: number | null
          notes?: string | null
          overall_rating?: number | null
          overtime_availability?: boolean | null
          phone?: string | null
          quality_score?: number | null
          sheets_per_hour?: number | null
          speed_score?: number | null
          status?: Database["public"]["Enums"]["employee_status"]
          teamwork_rating?: number | null
          termination_date?: string | null
          updated_at?: string
          user_id?: string | null
        }
        Update: {
          attendance_score?: number | null
          badge_code?: string | null
          created_at?: string
          department?: string
          email?: string | null
          emergency_contact_name?: string | null
          emergency_contact_phone?: string | null
          employee_code?: string | null
          full_name?: string
          hire_date?: string | null
          id?: string
          lateness_minutes?: number | null
          notes?: string | null
          overall_rating?: number | null
          overtime_availability?: boolean | null
          phone?: string | null
          quality_score?: number | null
          sheets_per_hour?: number | null
          speed_score?: number | null
          status?: Database["public"]["Enums"]["employee_status"]
          teamwork_rating?: number | null
          termination_date?: string | null
          updated_at?: string
          user_id?: string | null
        }
        Relationships: []
      }
      employment_contracts: {
        Row: {
          base_hours_per_week: number
          contract_type: Database["public"]["Enums"]["employment_contract_type"]
          created_at: string
          created_by: string | null
          employee_id: string
          end_date: string | null
          id: string
          is_active: boolean
          max_hours_per_day: number
          max_hours_per_week: number
          minimum_rest_hours: number
          overtime_allowed: boolean
          overtime_cap_hours_per_week: number
          start_date: string
          updated_at: string
        }
        Insert: {
          base_hours_per_week?: number
          contract_type?: Database["public"]["Enums"]["employment_contract_type"]
          created_at?: string
          created_by?: string | null
          employee_id: string
          end_date?: string | null
          id?: string
          is_active?: boolean
          max_hours_per_day?: number
          max_hours_per_week?: number
          minimum_rest_hours?: number
          overtime_allowed?: boolean
          overtime_cap_hours_per_week?: number
          start_date: string
          updated_at?: string
        }
        Update: {
          base_hours_per_week?: number
          contract_type?: Database["public"]["Enums"]["employment_contract_type"]
          created_at?: string
          created_by?: string | null
          employee_id?: string
          end_date?: string | null
          id?: string
          is_active?: boolean
          max_hours_per_day?: number
          max_hours_per_week?: number
          minimum_rest_hours?: number
          overtime_allowed?: boolean
          overtime_cap_hours_per_week?: number
          start_date?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "employment_contracts_employee_id_fkey"
            columns: ["employee_id"]
            isOneToOne: false
            referencedRelation: "employees"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "employment_contracts_employee_id_fkey"
            columns: ["employee_id"]
            isOneToOne: false
            referencedRelation: "worker_stats"
            referencedColumns: ["id"]
          },
        ]
      }
      equipment_investments: {
        Row: {
          created_at: string | null
          equipment_name: string
          estimated_annual_savings: number | null
          estimated_roi_months: number | null
          id: string
          machine_id: string | null
          notes: string | null
          payback_period_months: number | null
          purchase_cost: number
          status: string | null
          updated_at: string | null
        }
        Insert: {
          created_at?: string | null
          equipment_name: string
          estimated_annual_savings?: number | null
          estimated_roi_months?: number | null
          id?: string
          machine_id?: string | null
          notes?: string | null
          payback_period_months?: number | null
          purchase_cost: number
          status?: string | null
          updated_at?: string | null
        }
        Update: {
          created_at?: string | null
          equipment_name?: string
          estimated_annual_savings?: number | null
          estimated_roi_months?: number | null
          id?: string
          machine_id?: string | null
          notes?: string | null
          payback_period_months?: number | null
          purchase_cost?: number
          status?: string | null
          updated_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "equipment_investments_machine_id_fkey"
            columns: ["machine_id"]
            isOneToOne: false
            referencedRelation: "machines"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "equipment_investments_machine_id_fkey"
            columns: ["machine_id"]
            isOneToOne: false
            referencedRelation: "planta_live"
            referencedColumns: ["machine_id"]
          },
          {
            foreignKeyName: "equipment_investments_machine_id_fkey"
            columns: ["machine_id"]
            isOneToOne: false
            referencedRelation: "planta_live"
            referencedColumns: ["workstation_id"]
          },
        ]
      }
      hr_compliance_access_logs: {
        Row: {
          access_type: string
          accessed_at: string
          accessed_by: string | null
          employee_id: string | null
          id: string
          metadata: Json
          purpose: string | null
          record_id: string | null
          request_method: string | null
          request_path: string | null
          table_name: string
        }
        Insert: {
          access_type: string
          accessed_at?: string
          accessed_by?: string | null
          employee_id?: string | null
          id?: string
          metadata?: Json
          purpose?: string | null
          record_id?: string | null
          request_method?: string | null
          request_path?: string | null
          table_name: string
        }
        Update: {
          access_type?: string
          accessed_at?: string
          accessed_by?: string | null
          employee_id?: string | null
          id?: string
          metadata?: Json
          purpose?: string | null
          record_id?: string | null
          request_method?: string | null
          request_path?: string | null
          table_name?: string
        }
        Relationships: [
          {
            foreignKeyName: "hr_compliance_access_logs_employee_id_fkey"
            columns: ["employee_id"]
            isOneToOne: false
            referencedRelation: "employees"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "hr_compliance_access_logs_employee_id_fkey"
            columns: ["employee_id"]
            isOneToOne: false
            referencedRelation: "worker_stats"
            referencedColumns: ["id"]
          },
        ]
      }
      hr_data_retention_policies: {
        Row: {
          created_at: string
          enforcement_action: string
          id: string
          is_active: boolean
          notes: string | null
          retention_days: number
          table_name: string
          updated_at: string
        }
        Insert: {
          created_at?: string
          enforcement_action: string
          id?: string
          is_active?: boolean
          notes?: string | null
          retention_days: number
          table_name: string
          updated_at?: string
        }
        Update: {
          created_at?: string
          enforcement_action?: string
          id?: string
          is_active?: boolean
          notes?: string | null
          retention_days?: number
          table_name?: string
          updated_at?: string
        }
        Relationships: []
      }
      hr_documents: {
        Row: {
          created_at: string
          created_by: string | null
          doc_type: Database["public"]["Enums"]["hr_document_type"]
          employee_id: string
          expires_on: string | null
          file_url: string | null
          id: string
          issue_date: string | null
          issuer: string | null
          notes: string | null
          remind_on: string | null
          reminder_days_before: number
          status: Database["public"]["Enums"]["hr_document_status"]
          title: string
          updated_at: string
        }
        Insert: {
          created_at?: string
          created_by?: string | null
          doc_type?: Database["public"]["Enums"]["hr_document_type"]
          employee_id: string
          expires_on?: string | null
          file_url?: string | null
          id?: string
          issue_date?: string | null
          issuer?: string | null
          notes?: string | null
          remind_on?: string | null
          reminder_days_before?: number
          status?: Database["public"]["Enums"]["hr_document_status"]
          title: string
          updated_at?: string
        }
        Update: {
          created_at?: string
          created_by?: string | null
          doc_type?: Database["public"]["Enums"]["hr_document_type"]
          employee_id?: string
          expires_on?: string | null
          file_url?: string | null
          id?: string
          issue_date?: string | null
          issuer?: string | null
          notes?: string | null
          remind_on?: string | null
          reminder_days_before?: number
          status?: Database["public"]["Enums"]["hr_document_status"]
          title?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "hr_documents_employee_id_fkey"
            columns: ["employee_id"]
            isOneToOne: false
            referencedRelation: "employees"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "hr_documents_employee_id_fkey"
            columns: ["employee_id"]
            isOneToOne: false
            referencedRelation: "worker_stats"
            referencedColumns: ["id"]
          },
        ]
      }
      hr_sensitive_audit_log: {
        Row: {
          action: string
          changed_at: string
          changed_by: string | null
          changed_fields: string[]
          employee_id: string | null
          id: string
          new_data: Json | null
          old_data: Json | null
          record_id: string | null
          table_name: string
        }
        Insert: {
          action: string
          changed_at?: string
          changed_by?: string | null
          changed_fields?: string[]
          employee_id?: string | null
          id?: string
          new_data?: Json | null
          old_data?: Json | null
          record_id?: string | null
          table_name: string
        }
        Update: {
          action?: string
          changed_at?: string
          changed_by?: string | null
          changed_fields?: string[]
          employee_id?: string | null
          id?: string
          new_data?: Json | null
          old_data?: Json | null
          record_id?: string | null
          table_name?: string
        }
        Relationships: [
          {
            foreignKeyName: "hr_sensitive_audit_log_employee_id_fkey"
            columns: ["employee_id"]
            isOneToOne: false
            referencedRelation: "employees"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "hr_sensitive_audit_log_employee_id_fkey"
            columns: ["employee_id"]
            isOneToOne: false
            referencedRelation: "worker_stats"
            referencedColumns: ["id"]
          },
        ]
      }
      incentive_rules: {
        Row: {
          amount: number
          calculation_formula: string | null
          created_at: string
          created_by: string | null
          currency_code: string
          description: string | null
          effective_from: string
          effective_to: string | null
          id: string
          incentive_type: Database["public"]["Enums"]["incentive_rule_type"]
          is_active: boolean
          name: string
          updated_at: string
        }
        Insert: {
          amount?: number
          calculation_formula?: string | null
          created_at?: string
          created_by?: string | null
          currency_code?: string
          description?: string | null
          effective_from?: string
          effective_to?: string | null
          id?: string
          incentive_type?: Database["public"]["Enums"]["incentive_rule_type"]
          is_active?: boolean
          name: string
          updated_at?: string
        }
        Update: {
          amount?: number
          calculation_formula?: string | null
          created_at?: string
          created_by?: string | null
          currency_code?: string
          description?: string | null
          effective_from?: string
          effective_to?: string | null
          id?: string
          incentive_type?: Database["public"]["Enums"]["incentive_rule_type"]
          is_active?: boolean
          name?: string
          updated_at?: string
        }
        Relationships: []
      }
      integration_connectors: {
        Row: {
          config: Json
          created_at: string
          created_by: string | null
          id: string
          last_error: string | null
          last_sync_at: string | null
          name: string
          provider: string
          status: Database["public"]["Enums"]["integration_status"]
          updated_at: string
        }
        Insert: {
          config?: Json
          created_at?: string
          created_by?: string | null
          id?: string
          last_error?: string | null
          last_sync_at?: string | null
          name: string
          provider: string
          status?: Database["public"]["Enums"]["integration_status"]
          updated_at?: string
        }
        Update: {
          config?: Json
          created_at?: string
          created_by?: string | null
          id?: string
          last_error?: string | null
          last_sync_at?: string | null
          name?: string
          provider?: string
          status?: Database["public"]["Enums"]["integration_status"]
          updated_at?: string
        }
        Relationships: []
      }
      inventory: {
        Row: {
          cost_per_unit: number
          created_at: string | null
          id: string
          item_name: string
          quantity: number
          updated_at: string | null
        }
        Insert: {
          cost_per_unit?: number
          created_at?: string | null
          id?: string
          item_name: string
          quantity?: number
          updated_at?: string | null
        }
        Update: {
          cost_per_unit?: number
          created_at?: string | null
          id?: string
          item_name?: string
          quantity?: number
          updated_at?: string | null
        }
        Relationships: []
      }
      inventory_items: {
        Row: {
          barcode_value: string | null
          category: Database["public"]["Enums"]["inventory_item_category"]
          created_at: string
          estimated_unit_cost: number
          grammage_gsm: number | null
          id: string
          is_active: boolean
          is_certification_required: boolean
          min_stock: number
          name: string
          notes: string | null
          qr_value: string | null
          sheet_height_cm: number | null
          sheet_width_cm: number | null
          sheets_per_package: number | null
          sku: string
          unit: string
          updated_at: string
        }
        Insert: {
          barcode_value?: string | null
          category: Database["public"]["Enums"]["inventory_item_category"]
          created_at?: string
          estimated_unit_cost?: number
          grammage_gsm?: number | null
          id?: string
          is_active?: boolean
          is_certification_required?: boolean
          min_stock?: number
          name: string
          notes?: string | null
          qr_value?: string | null
          sheet_height_cm?: number | null
          sheet_width_cm?: number | null
          sheets_per_package?: number | null
          sku: string
          unit?: string
          updated_at?: string
        }
        Update: {
          barcode_value?: string | null
          category?: Database["public"]["Enums"]["inventory_item_category"]
          created_at?: string
          estimated_unit_cost?: number
          grammage_gsm?: number | null
          id?: string
          is_active?: boolean
          is_certification_required?: boolean
          min_stock?: number
          name?: string
          notes?: string | null
          qr_value?: string | null
          sheet_height_cm?: number | null
          sheet_width_cm?: number | null
          sheets_per_package?: number | null
          sku?: string
          unit?: string
          updated_at?: string
        }
        Relationships: []
      }
      inventory_lots: {
        Row: {
          blocked_at: string | null
          blocked_by: string | null
          blocked_reason: string | null
          cert_override_by: string | null
          cert_override_reason: string | null
          certification_code: string | null
          certification_expires_on: string | null
          created_at: string
          id: string
          item_id: string
          lot_number: string
          purchase_id: string | null
          qr_printed_at: string | null
          quantity_available: number
          quantity_received: number
          received_by: string | null
          received_date: string
          supplier_name: string | null
          unit_cost: number
          variance_reason: string | null
        }
        Insert: {
          blocked_at?: string | null
          blocked_by?: string | null
          blocked_reason?: string | null
          cert_override_by?: string | null
          cert_override_reason?: string | null
          certification_code?: string | null
          certification_expires_on?: string | null
          created_at?: string
          id?: string
          item_id: string
          lot_number: string
          purchase_id?: string | null
          qr_printed_at?: string | null
          quantity_available: number
          quantity_received: number
          received_by?: string | null
          received_date?: string
          supplier_name?: string | null
          unit_cost?: number
          variance_reason?: string | null
        }
        Update: {
          blocked_at?: string | null
          blocked_by?: string | null
          blocked_reason?: string | null
          cert_override_by?: string | null
          cert_override_reason?: string | null
          certification_code?: string | null
          certification_expires_on?: string | null
          created_at?: string
          id?: string
          item_id?: string
          lot_number?: string
          purchase_id?: string | null
          qr_printed_at?: string | null
          quantity_available?: number
          quantity_received?: number
          received_by?: string | null
          received_date?: string
          supplier_name?: string | null
          unit_cost?: number
          variance_reason?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "inventory_lots_item_id_fkey"
            columns: ["item_id"]
            isOneToOne: false
            referencedRelation: "inventory_items"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "inventory_lots_item_id_fkey"
            columns: ["item_id"]
            isOneToOne: false
            referencedRelation: "inventory_items_stock_v"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "inventory_lots_item_id_fkey"
            columns: ["item_id"]
            isOneToOne: false
            referencedRelation: "inventory_low_stock_alerts_v"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "inventory_lots_item_id_fkey"
            columns: ["item_id"]
            isOneToOne: false
            referencedRelation: "material_cost_v"
            referencedColumns: ["item_id"]
          },
          {
            foreignKeyName: "inventory_lots_purchase_id_fkey"
            columns: ["purchase_id"]
            isOneToOne: false
            referencedRelation: "machine_parts_on_order_v"
            referencedColumns: ["purchase_id"]
          },
          {
            foreignKeyName: "inventory_lots_purchase_id_fkey"
            columns: ["purchase_id"]
            isOneToOne: false
            referencedRelation: "oc_billing"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "inventory_lots_purchase_id_fkey"
            columns: ["purchase_id"]
            isOneToOne: false
            referencedRelation: "oc_conciliacion"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "inventory_lots_purchase_id_fkey"
            columns: ["purchase_id"]
            isOneToOne: false
            referencedRelation: "purchases"
            referencedColumns: ["id"]
          },
        ]
      }
      inventory_stock_transactions: {
        Row: {
          authorized_deviation: boolean
          created_at: string
          created_by: string | null
          deviation_reason: string | null
          id: string
          item_id: string
          lot_id: string | null
          notes: string | null
          quantity: number
          reference_code: string | null
          tx_type: Database["public"]["Enums"]["inventory_tx_type"]
          unit_cost: number | null
          work_order_id: string | null
        }
        Insert: {
          authorized_deviation?: boolean
          created_at?: string
          created_by?: string | null
          deviation_reason?: string | null
          id?: string
          item_id: string
          lot_id?: string | null
          notes?: string | null
          quantity: number
          reference_code?: string | null
          tx_type: Database["public"]["Enums"]["inventory_tx_type"]
          unit_cost?: number | null
          work_order_id?: string | null
        }
        Update: {
          authorized_deviation?: boolean
          created_at?: string
          created_by?: string | null
          deviation_reason?: string | null
          id?: string
          item_id?: string
          lot_id?: string | null
          notes?: string | null
          quantity?: number
          reference_code?: string | null
          tx_type?: Database["public"]["Enums"]["inventory_tx_type"]
          unit_cost?: number | null
          work_order_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "inventory_stock_transactions_item_id_fkey"
            columns: ["item_id"]
            isOneToOne: false
            referencedRelation: "inventory_items"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "inventory_stock_transactions_item_id_fkey"
            columns: ["item_id"]
            isOneToOne: false
            referencedRelation: "inventory_items_stock_v"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "inventory_stock_transactions_item_id_fkey"
            columns: ["item_id"]
            isOneToOne: false
            referencedRelation: "inventory_low_stock_alerts_v"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "inventory_stock_transactions_item_id_fkey"
            columns: ["item_id"]
            isOneToOne: false
            referencedRelation: "material_cost_v"
            referencedColumns: ["item_id"]
          },
          {
            foreignKeyName: "inventory_stock_transactions_lot_id_fkey"
            columns: ["lot_id"]
            isOneToOne: false
            referencedRelation: "inventory_lots"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "inventory_stock_transactions_work_order_id_fkey"
            columns: ["work_order_id"]
            isOneToOne: false
            referencedRelation: "ot_certificacion"
            referencedColumns: ["ot_id"]
          },
          {
            foreignKeyName: "inventory_stock_transactions_work_order_id_fkey"
            columns: ["work_order_id"]
            isOneToOne: false
            referencedRelation: "ot_compras_estado"
            referencedColumns: ["ot_id"]
          },
          {
            foreignKeyName: "inventory_stock_transactions_work_order_id_fkey"
            columns: ["work_order_id"]
            isOneToOne: false
            referencedRelation: "ot_cost_summary"
            referencedColumns: ["ot_id"]
          },
          {
            foreignKeyName: "inventory_stock_transactions_work_order_id_fkey"
            columns: ["work_order_id"]
            isOneToOne: false
            referencedRelation: "ot_fulfillment"
            referencedColumns: ["ot_id"]
          },
          {
            foreignKeyName: "inventory_stock_transactions_work_order_id_fkey"
            columns: ["work_order_id"]
            isOneToOne: false
            referencedRelation: "ots"
            referencedColumns: ["id"]
          },
        ]
      }
      jobs: {
        Row: {
          assigned_employee_id: string | null
          assigned_machine_id: string | null
          created_at: string | null
          created_by: string | null
          description: string
          id: string
          status: Database["public"]["Enums"]["job_status"]
          updated_at: string | null
        }
        Insert: {
          assigned_employee_id?: string | null
          assigned_machine_id?: string | null
          created_at?: string | null
          created_by?: string | null
          description: string
          id?: string
          status?: Database["public"]["Enums"]["job_status"]
          updated_at?: string | null
        }
        Update: {
          assigned_employee_id?: string | null
          assigned_machine_id?: string | null
          created_at?: string | null
          created_by?: string | null
          description?: string
          id?: string
          status?: Database["public"]["Enums"]["job_status"]
          updated_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "jobs_assigned_employee_id_fkey"
            columns: ["assigned_employee_id"]
            isOneToOne: false
            referencedRelation: "employees"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "jobs_assigned_employee_id_fkey"
            columns: ["assigned_employee_id"]
            isOneToOne: false
            referencedRelation: "worker_stats"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "jobs_assigned_machine_id_fkey"
            columns: ["assigned_machine_id"]
            isOneToOne: false
            referencedRelation: "machines"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "jobs_assigned_machine_id_fkey"
            columns: ["assigned_machine_id"]
            isOneToOne: false
            referencedRelation: "planta_live"
            referencedColumns: ["machine_id"]
          },
          {
            foreignKeyName: "jobs_assigned_machine_id_fkey"
            columns: ["assigned_machine_id"]
            isOneToOne: false
            referencedRelation: "planta_live"
            referencedColumns: ["workstation_id"]
          },
        ]
      }
      leave_balances: {
        Row: {
          accrual_rate_per_month: number
          accrued_hours: number
          as_of: string
          balance_hours: number
          balance_year: number | null
          carry_over_hours: number
          created_at: string
          employee_id: string
          id: string
          last_accrued_on: string | null
          leave_type: Database["public"]["Enums"]["hr_leave_type"]
          max_balance_hours: number
          notes: string | null
          updated_at: string
          used_hours: number
        }
        Insert: {
          accrual_rate_per_month?: number
          accrued_hours?: number
          as_of?: string
          balance_hours?: number
          balance_year?: number | null
          carry_over_hours?: number
          created_at?: string
          employee_id: string
          id?: string
          last_accrued_on?: string | null
          leave_type: Database["public"]["Enums"]["hr_leave_type"]
          max_balance_hours?: number
          notes?: string | null
          updated_at?: string
          used_hours?: number
        }
        Update: {
          accrual_rate_per_month?: number
          accrued_hours?: number
          as_of?: string
          balance_hours?: number
          balance_year?: number | null
          carry_over_hours?: number
          created_at?: string
          employee_id?: string
          id?: string
          last_accrued_on?: string | null
          leave_type?: Database["public"]["Enums"]["hr_leave_type"]
          max_balance_hours?: number
          notes?: string | null
          updated_at?: string
          used_hours?: number
        }
        Relationships: [
          {
            foreignKeyName: "leave_balances_employee_id_fkey"
            columns: ["employee_id"]
            isOneToOne: false
            referencedRelation: "employees"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "leave_balances_employee_id_fkey"
            columns: ["employee_id"]
            isOneToOne: false
            referencedRelation: "worker_stats"
            referencedColumns: ["id"]
          },
        ]
      }
      leave_policies: {
        Row: {
          accrual_rate_per_month: number
          created_at: string
          description: string | null
          id: string
          initial_balance_hours: number
          is_active: boolean
          leave_type: Database["public"]["Enums"]["hr_leave_type"]
          max_balance_hours: number
          name: string
          updated_at: string
        }
        Insert: {
          accrual_rate_per_month?: number
          created_at?: string
          description?: string | null
          id?: string
          initial_balance_hours?: number
          is_active?: boolean
          leave_type: Database["public"]["Enums"]["hr_leave_type"]
          max_balance_hours?: number
          name: string
          updated_at?: string
        }
        Update: {
          accrual_rate_per_month?: number
          created_at?: string
          description?: string | null
          id?: string
          initial_balance_hours?: number
          is_active?: boolean
          leave_type?: Database["public"]["Enums"]["hr_leave_type"]
          max_balance_hours?: number
          name?: string
          updated_at?: string
        }
        Relationships: []
      }
      leave_requests: {
        Row: {
          approved_at: string | null
          approved_by: string | null
          created_at: string
          employee_id: string
          end_date: string
          hours_requested: number
          id: string
          leave_type: Database["public"]["Enums"]["hr_leave_type"]
          reason: string | null
          requested_by: string | null
          review_notes: string | null
          start_date: string
          status: Database["public"]["Enums"]["leave_request_status"]
          updated_at: string
        }
        Insert: {
          approved_at?: string | null
          approved_by?: string | null
          created_at?: string
          employee_id: string
          end_date: string
          hours_requested?: number
          id?: string
          leave_type: Database["public"]["Enums"]["hr_leave_type"]
          reason?: string | null
          requested_by?: string | null
          review_notes?: string | null
          start_date: string
          status?: Database["public"]["Enums"]["leave_request_status"]
          updated_at?: string
        }
        Update: {
          approved_at?: string | null
          approved_by?: string | null
          created_at?: string
          employee_id?: string
          end_date?: string
          hours_requested?: number
          id?: string
          leave_type?: Database["public"]["Enums"]["hr_leave_type"]
          reason?: string | null
          requested_by?: string | null
          review_notes?: string | null
          start_date?: string
          status?: Database["public"]["Enums"]["leave_request_status"]
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
          {
            foreignKeyName: "leave_requests_employee_id_fkey"
            columns: ["employee_id"]
            isOneToOne: false
            referencedRelation: "worker_stats"
            referencedColumns: ["id"]
          },
        ]
      }
      machine_cost_entries: {
        Row: {
          created_at: string
          energy_cost: number | null
          energy_kwh: number | null
          id: string
          machine_id: string
          maintenance_cost: number | null
          notes: string | null
          other_cost: number | null
          period_month: string
          recorded_by: string | null
          supplies_cost: number | null
        }
        Insert: {
          created_at?: string
          energy_cost?: number | null
          energy_kwh?: number | null
          id?: string
          machine_id: string
          maintenance_cost?: number | null
          notes?: string | null
          other_cost?: number | null
          period_month: string
          recorded_by?: string | null
          supplies_cost?: number | null
        }
        Update: {
          created_at?: string
          energy_cost?: number | null
          energy_kwh?: number | null
          id?: string
          machine_id?: string
          maintenance_cost?: number | null
          notes?: string | null
          other_cost?: number | null
          period_month?: string
          recorded_by?: string | null
          supplies_cost?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "machine_cost_entries_machine_id_fkey"
            columns: ["machine_id"]
            isOneToOne: false
            referencedRelation: "machines"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "machine_cost_entries_machine_id_fkey"
            columns: ["machine_id"]
            isOneToOne: false
            referencedRelation: "planta_live"
            referencedColumns: ["machine_id"]
          },
          {
            foreignKeyName: "machine_cost_entries_machine_id_fkey"
            columns: ["machine_id"]
            isOneToOne: false
            referencedRelation: "planta_live"
            referencedColumns: ["workstation_id"]
          },
        ]
      }
      machine_costs: {
        Row: {
          created_at: string | null
          energy_cost: number | null
          id: string
          labor_cost: number | null
          machine_id: string
          maintenance_cost: number | null
          month: string
          notes: string | null
          outsourcing_cost: number | null
          revenue_generated: number | null
          spare_parts_cost: number | null
          total_operating_cost: number | null
          updated_at: string | null
        }
        Insert: {
          created_at?: string | null
          energy_cost?: number | null
          id?: string
          labor_cost?: number | null
          machine_id: string
          maintenance_cost?: number | null
          month: string
          notes?: string | null
          outsourcing_cost?: number | null
          revenue_generated?: number | null
          spare_parts_cost?: number | null
          total_operating_cost?: number | null
          updated_at?: string | null
        }
        Update: {
          created_at?: string | null
          energy_cost?: number | null
          id?: string
          labor_cost?: number | null
          machine_id?: string
          maintenance_cost?: number | null
          month?: string
          notes?: string | null
          outsourcing_cost?: number | null
          revenue_generated?: number | null
          spare_parts_cost?: number | null
          total_operating_cost?: number | null
          updated_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "machine_costs_machine_id_fkey"
            columns: ["machine_id"]
            isOneToOne: false
            referencedRelation: "machines"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "machine_costs_machine_id_fkey"
            columns: ["machine_id"]
            isOneToOne: false
            referencedRelation: "planta_live"
            referencedColumns: ["machine_id"]
          },
          {
            foreignKeyName: "machine_costs_machine_id_fkey"
            columns: ["machine_id"]
            isOneToOne: false
            referencedRelation: "planta_live"
            referencedColumns: ["workstation_id"]
          },
        ]
      }
      machine_downtime_logs: {
        Row: {
          created_at: string | null
          duration_hours: number | null
          end_time: string | null
          id: string
          impact_description: string | null
          machine_id: string
          notes: string | null
          reason: string
          start_time: string
          updated_at: string | null
        }
        Insert: {
          created_at?: string | null
          duration_hours?: number | null
          end_time?: string | null
          id?: string
          impact_description?: string | null
          machine_id: string
          notes?: string | null
          reason: string
          start_time: string
          updated_at?: string | null
        }
        Update: {
          created_at?: string | null
          duration_hours?: number | null
          end_time?: string | null
          id?: string
          impact_description?: string | null
          machine_id?: string
          notes?: string | null
          reason?: string
          start_time?: string
          updated_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "machine_downtime_logs_machine_id_fkey"
            columns: ["machine_id"]
            isOneToOne: false
            referencedRelation: "machines"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "machine_downtime_logs_machine_id_fkey"
            columns: ["machine_id"]
            isOneToOne: false
            referencedRelation: "planta_live"
            referencedColumns: ["machine_id"]
          },
          {
            foreignKeyName: "machine_downtime_logs_machine_id_fkey"
            columns: ["machine_id"]
            isOneToOne: false
            referencedRelation: "planta_live"
            referencedColumns: ["workstation_id"]
          },
        ]
      }
      machine_parts: {
        Row: {
          created_at: string
          criticality: string
          expected_life_usage: number | null
          id: string
          inventory_item_id: string | null
          is_active: boolean
          is_imported: boolean
          last_replaced_at: string | null
          last_replaced_usage: number | null
          lead_time_days: number | null
          machine_id: string
          min_stock: number
          name: string
          notes: string | null
          part_number: string | null
          position: string | null
          preferred_supplier: string | null
          quantity_installed: number
          supplier_part_ref: string | null
          system_id: string
          unit_cost: number | null
          updated_at: string
        }
        Insert: {
          created_at?: string
          criticality?: string
          expected_life_usage?: number | null
          id?: string
          inventory_item_id?: string | null
          is_active?: boolean
          is_imported?: boolean
          last_replaced_at?: string | null
          last_replaced_usage?: number | null
          lead_time_days?: number | null
          machine_id: string
          min_stock?: number
          name: string
          notes?: string | null
          part_number?: string | null
          position?: string | null
          preferred_supplier?: string | null
          quantity_installed?: number
          supplier_part_ref?: string | null
          system_id: string
          unit_cost?: number | null
          updated_at?: string
        }
        Update: {
          created_at?: string
          criticality?: string
          expected_life_usage?: number | null
          id?: string
          inventory_item_id?: string | null
          is_active?: boolean
          is_imported?: boolean
          last_replaced_at?: string | null
          last_replaced_usage?: number | null
          lead_time_days?: number | null
          machine_id?: string
          min_stock?: number
          name?: string
          notes?: string | null
          part_number?: string | null
          position?: string | null
          preferred_supplier?: string | null
          quantity_installed?: number
          supplier_part_ref?: string | null
          system_id?: string
          unit_cost?: number | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "machine_parts_inventory_item_id_fkey"
            columns: ["inventory_item_id"]
            isOneToOne: false
            referencedRelation: "inventory_items"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "machine_parts_inventory_item_id_fkey"
            columns: ["inventory_item_id"]
            isOneToOne: false
            referencedRelation: "inventory_items_stock_v"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "machine_parts_inventory_item_id_fkey"
            columns: ["inventory_item_id"]
            isOneToOne: false
            referencedRelation: "inventory_low_stock_alerts_v"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "machine_parts_inventory_item_id_fkey"
            columns: ["inventory_item_id"]
            isOneToOne: false
            referencedRelation: "material_cost_v"
            referencedColumns: ["item_id"]
          },
          {
            foreignKeyName: "machine_parts_machine_id_fkey"
            columns: ["machine_id"]
            isOneToOne: false
            referencedRelation: "machines"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "machine_parts_machine_id_fkey"
            columns: ["machine_id"]
            isOneToOne: false
            referencedRelation: "planta_live"
            referencedColumns: ["machine_id"]
          },
          {
            foreignKeyName: "machine_parts_machine_id_fkey"
            columns: ["machine_id"]
            isOneToOne: false
            referencedRelation: "planta_live"
            referencedColumns: ["workstation_id"]
          },
          {
            foreignKeyName: "machine_parts_system_id_fkey"
            columns: ["system_id"]
            isOneToOne: false
            referencedRelation: "machine_systems"
            referencedColumns: ["id"]
          },
        ]
      }
      machine_skill_requirements: {
        Row: {
          created_at: string
          description: string | null
          id: string
          is_critical: boolean
          machine_id: string
          min_proficiency: number
          notes: string | null
          requires_certification: boolean
          skill_id: string
          supervised_hours_required: number | null
          updated_at: string
        }
        Insert: {
          created_at?: string
          description?: string | null
          id?: string
          is_critical?: boolean
          machine_id: string
          min_proficiency?: number
          notes?: string | null
          requires_certification?: boolean
          skill_id: string
          supervised_hours_required?: number | null
          updated_at?: string
        }
        Update: {
          created_at?: string
          description?: string | null
          id?: string
          is_critical?: boolean
          machine_id?: string
          min_proficiency?: number
          notes?: string | null
          requires_certification?: boolean
          skill_id?: string
          supervised_hours_required?: number | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "machine_skill_requirements_machine_id_fkey"
            columns: ["machine_id"]
            isOneToOne: false
            referencedRelation: "machines"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "machine_skill_requirements_machine_id_fkey"
            columns: ["machine_id"]
            isOneToOne: false
            referencedRelation: "planta_live"
            referencedColumns: ["machine_id"]
          },
          {
            foreignKeyName: "machine_skill_requirements_machine_id_fkey"
            columns: ["machine_id"]
            isOneToOne: false
            referencedRelation: "planta_live"
            referencedColumns: ["workstation_id"]
          },
          {
            foreignKeyName: "machine_skill_requirements_skill_id_fkey"
            columns: ["skill_id"]
            isOneToOne: false
            referencedRelation: "skills"
            referencedColumns: ["id"]
          },
        ]
      }
      machine_supply_requirements: {
        Row: {
          consumption_rate: number
          created_at: string
          id: string
          inventory_item_id: string
          is_critical: boolean
          machine_id: string
          notes: string | null
          rate_unit: string
          updated_at: string
        }
        Insert: {
          consumption_rate?: number
          created_at?: string
          id?: string
          inventory_item_id: string
          is_critical?: boolean
          machine_id: string
          notes?: string | null
          rate_unit?: string
          updated_at?: string
        }
        Update: {
          consumption_rate?: number
          created_at?: string
          id?: string
          inventory_item_id?: string
          is_critical?: boolean
          machine_id?: string
          notes?: string | null
          rate_unit?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "machine_supply_requirements_inventory_item_id_fkey"
            columns: ["inventory_item_id"]
            isOneToOne: false
            referencedRelation: "inventory_items"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "machine_supply_requirements_inventory_item_id_fkey"
            columns: ["inventory_item_id"]
            isOneToOne: false
            referencedRelation: "inventory_items_stock_v"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "machine_supply_requirements_inventory_item_id_fkey"
            columns: ["inventory_item_id"]
            isOneToOne: false
            referencedRelation: "inventory_low_stock_alerts_v"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "machine_supply_requirements_inventory_item_id_fkey"
            columns: ["inventory_item_id"]
            isOneToOne: false
            referencedRelation: "material_cost_v"
            referencedColumns: ["item_id"]
          },
          {
            foreignKeyName: "machine_supply_requirements_machine_id_fkey"
            columns: ["machine_id"]
            isOneToOne: false
            referencedRelation: "machines"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "machine_supply_requirements_machine_id_fkey"
            columns: ["machine_id"]
            isOneToOne: false
            referencedRelation: "planta_live"
            referencedColumns: ["machine_id"]
          },
          {
            foreignKeyName: "machine_supply_requirements_machine_id_fkey"
            columns: ["machine_id"]
            isOneToOne: false
            referencedRelation: "planta_live"
            referencedColumns: ["workstation_id"]
          },
        ]
      }
      machine_systems: {
        Row: {
          applies_to: Database["public"]["Enums"]["machine_type"][] | null
          code: string
          created_at: string
          description: string | null
          id: string
          is_active: boolean
          name: string
          sort_order: number
        }
        Insert: {
          applies_to?: Database["public"]["Enums"]["machine_type"][] | null
          code: string
          created_at?: string
          description?: string | null
          id?: string
          is_active?: boolean
          name: string
          sort_order?: number
        }
        Update: {
          applies_to?: Database["public"]["Enums"]["machine_type"][] | null
          code?: string
          created_at?: string
          description?: string | null
          id?: string
          is_active?: boolean
          name?: string
          sort_order?: number
        }
        Relationships: []
      }
      machine_training_paths: {
        Row: {
          created_at: string
          description: string | null
          estimated_hours: number | null
          id: string
          is_active: boolean
          machine_id: string
          mentor_employee_id: string | null
          requires_evidence: boolean
          skill_id: string | null
          step_order: number
          target_proficiency: number | null
          title: string
          training_article_id: string | null
          updated_at: string
        }
        Insert: {
          created_at?: string
          description?: string | null
          estimated_hours?: number | null
          id?: string
          is_active?: boolean
          machine_id: string
          mentor_employee_id?: string | null
          requires_evidence?: boolean
          skill_id?: string | null
          step_order?: number
          target_proficiency?: number | null
          title: string
          training_article_id?: string | null
          updated_at?: string
        }
        Update: {
          created_at?: string
          description?: string | null
          estimated_hours?: number | null
          id?: string
          is_active?: boolean
          machine_id?: string
          mentor_employee_id?: string | null
          requires_evidence?: boolean
          skill_id?: string | null
          step_order?: number
          target_proficiency?: number | null
          title?: string
          training_article_id?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "machine_training_paths_machine_id_fkey"
            columns: ["machine_id"]
            isOneToOne: false
            referencedRelation: "machines"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "machine_training_paths_machine_id_fkey"
            columns: ["machine_id"]
            isOneToOne: false
            referencedRelation: "planta_live"
            referencedColumns: ["machine_id"]
          },
          {
            foreignKeyName: "machine_training_paths_machine_id_fkey"
            columns: ["machine_id"]
            isOneToOne: false
            referencedRelation: "planta_live"
            referencedColumns: ["workstation_id"]
          },
          {
            foreignKeyName: "machine_training_paths_mentor_employee_id_fkey"
            columns: ["mentor_employee_id"]
            isOneToOne: false
            referencedRelation: "employees"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "machine_training_paths_mentor_employee_id_fkey"
            columns: ["mentor_employee_id"]
            isOneToOne: false
            referencedRelation: "worker_stats"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "machine_training_paths_skill_id_fkey"
            columns: ["skill_id"]
            isOneToOne: false
            referencedRelation: "skills"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "machine_training_paths_training_article_id_fkey"
            columns: ["training_article_id"]
            isOneToOne: false
            referencedRelation: "training_articles"
            referencedColumns: ["id"]
          },
        ]
      }
      machine_training_progress: {
        Row: {
          completed_at: string | null
          created_at: string
          employee_id: string
          evidence_url: string | null
          hours_logged: number
          id: string
          notes: string | null
          path_id: string
          started_at: string | null
          status: string
          updated_at: string
          validated_at: string | null
          validated_by: string | null
        }
        Insert: {
          completed_at?: string | null
          created_at?: string
          employee_id: string
          evidence_url?: string | null
          hours_logged?: number
          id?: string
          notes?: string | null
          path_id: string
          started_at?: string | null
          status?: string
          updated_at?: string
          validated_at?: string | null
          validated_by?: string | null
        }
        Update: {
          completed_at?: string | null
          created_at?: string
          employee_id?: string
          evidence_url?: string | null
          hours_logged?: number
          id?: string
          notes?: string | null
          path_id?: string
          started_at?: string | null
          status?: string
          updated_at?: string
          validated_at?: string | null
          validated_by?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "machine_training_progress_employee_id_fkey"
            columns: ["employee_id"]
            isOneToOne: false
            referencedRelation: "employees"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "machine_training_progress_employee_id_fkey"
            columns: ["employee_id"]
            isOneToOne: false
            referencedRelation: "worker_stats"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "machine_training_progress_path_id_fkey"
            columns: ["path_id"]
            isOneToOne: false
            referencedRelation: "machine_training_paths"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "machine_training_progress_validated_by_fkey"
            columns: ["validated_by"]
            isOneToOne: false
            referencedRelation: "employees"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "machine_training_progress_validated_by_fkey"
            columns: ["validated_by"]
            isOneToOne: false
            referencedRelation: "worker_stats"
            referencedColumns: ["id"]
          },
        ]
      }
      machine_usage_readings: {
        Row: {
          created_at: string
          id: string
          machine_id: string
          notes: string | null
          read_at: string
          reading: number
          recorded_by: string | null
          source: string
          unit: Database["public"]["Enums"]["machine_usage_unit"]
        }
        Insert: {
          created_at?: string
          id?: string
          machine_id: string
          notes?: string | null
          read_at?: string
          reading: number
          recorded_by?: string | null
          source?: string
          unit: Database["public"]["Enums"]["machine_usage_unit"]
        }
        Update: {
          created_at?: string
          id?: string
          machine_id?: string
          notes?: string | null
          read_at?: string
          reading?: number
          recorded_by?: string | null
          source?: string
          unit?: Database["public"]["Enums"]["machine_usage_unit"]
        }
        Relationships: [
          {
            foreignKeyName: "machine_usage_readings_machine_id_fkey"
            columns: ["machine_id"]
            isOneToOne: false
            referencedRelation: "machines"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "machine_usage_readings_machine_id_fkey"
            columns: ["machine_id"]
            isOneToOne: false
            referencedRelation: "planta_live"
            referencedColumns: ["machine_id"]
          },
          {
            foreignKeyName: "machine_usage_readings_machine_id_fkey"
            columns: ["machine_id"]
            isOneToOne: false
            referencedRelation: "planta_live"
            referencedColumns: ["workstation_id"]
          },
        ]
      }
      machines: {
        Row: {
          brand: string | null
          colors: number | null
          created_at: string | null
          depreciation_monthly: number | null
          description: string | null
          energy_cost_per_hr: number | null
          id: string
          is_active: boolean
          location: string | null
          maintenance_cost_monthly: number | null
          max_print_height_mm: number | null
          max_print_width_mm: number | null
          max_workers: number
          min_qualified_operators: number
          model: string | null
          name: string
          nominal_speed_sheets_hr: number | null
          optimal_speed_sheets_hr: number | null
          photo_url: string | null
          power_kw: number | null
          serial_number: string | null
          status: Database["public"]["Enums"]["machine_status"]
          type: Database["public"]["Enums"]["machine_type"]
          updated_at: string | null
          usage_counter: number
          usage_counter_updated_at: string | null
          usage_unit: Database["public"]["Enums"]["machine_usage_unit"]
          year_manufactured: number | null
        }
        Insert: {
          brand?: string | null
          colors?: number | null
          created_at?: string | null
          depreciation_monthly?: number | null
          description?: string | null
          energy_cost_per_hr?: number | null
          id?: string
          is_active?: boolean
          location?: string | null
          maintenance_cost_monthly?: number | null
          max_print_height_mm?: number | null
          max_print_width_mm?: number | null
          max_workers?: number
          min_qualified_operators?: number
          model?: string | null
          name: string
          nominal_speed_sheets_hr?: number | null
          optimal_speed_sheets_hr?: number | null
          photo_url?: string | null
          power_kw?: number | null
          serial_number?: string | null
          status?: Database["public"]["Enums"]["machine_status"]
          type: Database["public"]["Enums"]["machine_type"]
          updated_at?: string | null
          usage_counter?: number
          usage_counter_updated_at?: string | null
          usage_unit?: Database["public"]["Enums"]["machine_usage_unit"]
          year_manufactured?: number | null
        }
        Update: {
          brand?: string | null
          colors?: number | null
          created_at?: string | null
          depreciation_monthly?: number | null
          description?: string | null
          energy_cost_per_hr?: number | null
          id?: string
          is_active?: boolean
          location?: string | null
          maintenance_cost_monthly?: number | null
          max_print_height_mm?: number | null
          max_print_width_mm?: number | null
          max_workers?: number
          min_qualified_operators?: number
          model?: string | null
          name?: string
          nominal_speed_sheets_hr?: number | null
          optimal_speed_sheets_hr?: number | null
          photo_url?: string | null
          power_kw?: number | null
          serial_number?: string | null
          status?: Database["public"]["Enums"]["machine_status"]
          type?: Database["public"]["Enums"]["machine_type"]
          updated_at?: string | null
          usage_counter?: number
          usage_counter_updated_at?: string | null
          usage_unit?: Database["public"]["Enums"]["machine_usage_unit"]
          year_manufactured?: number | null
        }
        Relationships: []
      }
      maintenance_alerts: {
        Row: {
          alert_type: string
          created_at: string | null
          description: string | null
          id: string
          is_resolved: boolean | null
          machine_id: string
          resolved_at: string | null
          severity: string
          title: string
          updated_at: string | null
        }
        Insert: {
          alert_type: string
          created_at?: string | null
          description?: string | null
          id?: string
          is_resolved?: boolean | null
          machine_id: string
          resolved_at?: string | null
          severity: string
          title: string
          updated_at?: string | null
        }
        Update: {
          alert_type?: string
          created_at?: string | null
          description?: string | null
          id?: string
          is_resolved?: boolean | null
          machine_id?: string
          resolved_at?: string | null
          severity?: string
          title?: string
          updated_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "maintenance_alerts_machine_id_fkey"
            columns: ["machine_id"]
            isOneToOne: false
            referencedRelation: "machines"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "maintenance_alerts_machine_id_fkey"
            columns: ["machine_id"]
            isOneToOne: false
            referencedRelation: "planta_live"
            referencedColumns: ["machine_id"]
          },
          {
            foreignKeyName: "maintenance_alerts_machine_id_fkey"
            columns: ["machine_id"]
            isOneToOne: false
            referencedRelation: "planta_live"
            referencedColumns: ["workstation_id"]
          },
        ]
      }
      maintenance_checklists: {
        Row: {
          created_at: string | null
          created_by: string | null
          description: string | null
          frequency: string
          id: string
          items: Json
          machine_id: string | null
          machine_type: string
          maintenance_type: string | null
          name: string
          total_estimated_time: number
          updated_at: string | null
        }
        Insert: {
          created_at?: string | null
          created_by?: string | null
          description?: string | null
          frequency: string
          id?: string
          items?: Json
          machine_id?: string | null
          machine_type: string
          maintenance_type?: string | null
          name: string
          total_estimated_time?: number
          updated_at?: string | null
        }
        Update: {
          created_at?: string | null
          created_by?: string | null
          description?: string | null
          frequency?: string
          id?: string
          items?: Json
          machine_id?: string | null
          machine_type?: string
          maintenance_type?: string | null
          name?: string
          total_estimated_time?: number
          updated_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "maintenance_checklists_machine_id_fkey"
            columns: ["machine_id"]
            isOneToOne: false
            referencedRelation: "machines"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "maintenance_checklists_machine_id_fkey"
            columns: ["machine_id"]
            isOneToOne: false
            referencedRelation: "planta_live"
            referencedColumns: ["machine_id"]
          },
          {
            foreignKeyName: "maintenance_checklists_machine_id_fkey"
            columns: ["machine_id"]
            isOneToOne: false
            referencedRelation: "planta_live"
            referencedColumns: ["workstation_id"]
          },
        ]
      }
      maintenance_logs: {
        Row: {
          actual_duration_hours: number | null
          cost: number | null
          created_at: string | null
          description: string | null
          end_date: string | null
          id: string
          issues_found: string | null
          machine_id: string
          maintenance_type: Database["public"]["Enums"]["maintenance_type"]
          notes: string | null
          parts_replaced: string | null
          schedule_id: string | null
          start_date: string
          status: Database["public"]["Enums"]["maintenance_status"]
          technician_name: string
          updated_at: string | null
        }
        Insert: {
          actual_duration_hours?: number | null
          cost?: number | null
          created_at?: string | null
          description?: string | null
          end_date?: string | null
          id?: string
          issues_found?: string | null
          machine_id: string
          maintenance_type: Database["public"]["Enums"]["maintenance_type"]
          notes?: string | null
          parts_replaced?: string | null
          schedule_id?: string | null
          start_date: string
          status?: Database["public"]["Enums"]["maintenance_status"]
          technician_name: string
          updated_at?: string | null
        }
        Update: {
          actual_duration_hours?: number | null
          cost?: number | null
          created_at?: string | null
          description?: string | null
          end_date?: string | null
          id?: string
          issues_found?: string | null
          machine_id?: string
          maintenance_type?: Database["public"]["Enums"]["maintenance_type"]
          notes?: string | null
          parts_replaced?: string | null
          schedule_id?: string | null
          start_date?: string
          status?: Database["public"]["Enums"]["maintenance_status"]
          technician_name?: string
          updated_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "maintenance_logs_machine_id_fkey"
            columns: ["machine_id"]
            isOneToOne: false
            referencedRelation: "machines"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "maintenance_logs_machine_id_fkey"
            columns: ["machine_id"]
            isOneToOne: false
            referencedRelation: "planta_live"
            referencedColumns: ["machine_id"]
          },
          {
            foreignKeyName: "maintenance_logs_machine_id_fkey"
            columns: ["machine_id"]
            isOneToOne: false
            referencedRelation: "planta_live"
            referencedColumns: ["workstation_id"]
          },
          {
            foreignKeyName: "maintenance_logs_schedule_id_fkey"
            columns: ["schedule_id"]
            isOneToOne: false
            referencedRelation: "maintenance_schedules"
            referencedColumns: ["id"]
          },
        ]
      }
      maintenance_programs: {
        Row: {
          created_at: string
          description: string | null
          id: string
          is_active: boolean
          machine_id: string | null
          machine_model: string
          manual_source: string | null
          name: string
          source_language: string
          updated_at: string
        }
        Insert: {
          created_at?: string
          description?: string | null
          id?: string
          is_active?: boolean
          machine_id?: string | null
          machine_model: string
          manual_source?: string | null
          name: string
          source_language?: string
          updated_at?: string
        }
        Update: {
          created_at?: string
          description?: string | null
          id?: string
          is_active?: boolean
          machine_id?: string | null
          machine_model?: string
          manual_source?: string | null
          name?: string
          source_language?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "maintenance_programs_machine_id_fkey"
            columns: ["machine_id"]
            isOneToOne: false
            referencedRelation: "machines"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "maintenance_programs_machine_id_fkey"
            columns: ["machine_id"]
            isOneToOne: false
            referencedRelation: "planta_live"
            referencedColumns: ["machine_id"]
          },
          {
            foreignKeyName: "maintenance_programs_machine_id_fkey"
            columns: ["machine_id"]
            isOneToOne: false
            referencedRelation: "planta_live"
            referencedColumns: ["workstation_id"]
          },
        ]
      }
      maintenance_schedules: {
        Row: {
          created_at: string | null
          description: string | null
          estimated_duration_hours: number | null
          frequency_days: number
          frequency_usage: number | null
          id: string
          last_maintenance_date: string | null
          last_maintenance_usage: number | null
          machine_id: string
          maintenance_type: Database["public"]["Enums"]["maintenance_type"]
          next_maintenance_date: string
          status: Database["public"]["Enums"]["maintenance_status"]
          system_id: string | null
          updated_at: string | null
        }
        Insert: {
          created_at?: string | null
          description?: string | null
          estimated_duration_hours?: number | null
          frequency_days?: number
          frequency_usage?: number | null
          id?: string
          last_maintenance_date?: string | null
          last_maintenance_usage?: number | null
          machine_id: string
          maintenance_type: Database["public"]["Enums"]["maintenance_type"]
          next_maintenance_date: string
          status?: Database["public"]["Enums"]["maintenance_status"]
          system_id?: string | null
          updated_at?: string | null
        }
        Update: {
          created_at?: string | null
          description?: string | null
          estimated_duration_hours?: number | null
          frequency_days?: number
          frequency_usage?: number | null
          id?: string
          last_maintenance_date?: string | null
          last_maintenance_usage?: number | null
          machine_id?: string
          maintenance_type?: Database["public"]["Enums"]["maintenance_type"]
          next_maintenance_date?: string
          status?: Database["public"]["Enums"]["maintenance_status"]
          system_id?: string | null
          updated_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "maintenance_schedules_machine_id_fkey"
            columns: ["machine_id"]
            isOneToOne: false
            referencedRelation: "machines"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "maintenance_schedules_machine_id_fkey"
            columns: ["machine_id"]
            isOneToOne: false
            referencedRelation: "planta_live"
            referencedColumns: ["machine_id"]
          },
          {
            foreignKeyName: "maintenance_schedules_machine_id_fkey"
            columns: ["machine_id"]
            isOneToOne: false
            referencedRelation: "planta_live"
            referencedColumns: ["workstation_id"]
          },
          {
            foreignKeyName: "maintenance_schedules_system_id_fkey"
            columns: ["system_id"]
            isOneToOne: false
            referencedRelation: "machine_systems"
            referencedColumns: ["id"]
          },
        ]
      }
      maintenance_task_completions: {
        Row: {
          completed: boolean | null
          completed_at: string | null
          completed_by: string | null
          created_at: string | null
          id: string
          notes: string | null
          task_id: string
          time_spent_minutes: number | null
          work_order_id: string
        }
        Insert: {
          completed?: boolean | null
          completed_at?: string | null
          completed_by?: string | null
          created_at?: string | null
          id?: string
          notes?: string | null
          task_id: string
          time_spent_minutes?: number | null
          work_order_id: string
        }
        Update: {
          completed?: boolean | null
          completed_at?: string | null
          completed_by?: string | null
          created_at?: string | null
          id?: string
          notes?: string | null
          task_id?: string
          time_spent_minutes?: number | null
          work_order_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "maintenance_task_completions_task_id_fkey"
            columns: ["task_id"]
            isOneToOne: false
            referencedRelation: "maintenance_tasks"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "maintenance_task_completions_work_order_id_fkey"
            columns: ["work_order_id"]
            isOneToOne: false
            referencedRelation: "maintenance_work_orders"
            referencedColumns: ["id"]
          },
        ]
      }
      maintenance_tasks: {
        Row: {
          checklist_id: string
          created_at: string | null
          description: string
          estimated_minutes: number | null
          id: string
          notes: string | null
          requires_parts: boolean | null
          task_number: number
        }
        Insert: {
          checklist_id: string
          created_at?: string | null
          description: string
          estimated_minutes?: number | null
          id?: string
          notes?: string | null
          requires_parts?: boolean | null
          task_number: number
        }
        Update: {
          checklist_id?: string
          created_at?: string | null
          description?: string
          estimated_minutes?: number | null
          id?: string
          notes?: string | null
          requires_parts?: boolean | null
          task_number?: number
        }
        Relationships: [
          {
            foreignKeyName: "maintenance_tasks_checklist_id_fkey"
            columns: ["checklist_id"]
            isOneToOne: false
            referencedRelation: "maintenance_checklists"
            referencedColumns: ["id"]
          },
        ]
      }
      maintenance_work_orders: {
        Row: {
          assigned_to: string | null
          checklist_id: string | null
          completed_at: string | null
          created_at: string | null
          created_by: string | null
          fault_description: string | null
          id: string
          machine_id: string
          notes: string | null
          ot_id: string | null
          part_id: string | null
          priority: number | null
          scheduled_date: string
          started_at: string | null
          status: string
          system_id: string | null
          title: string | null
          total_time_minutes: number | null
          usage_at_creation: number | null
          work_order_type: string
        }
        Insert: {
          assigned_to?: string | null
          checklist_id?: string | null
          completed_at?: string | null
          created_at?: string | null
          created_by?: string | null
          fault_description?: string | null
          id?: string
          machine_id: string
          notes?: string | null
          ot_id?: string | null
          part_id?: string | null
          priority?: number | null
          scheduled_date: string
          started_at?: string | null
          status?: string
          system_id?: string | null
          title?: string | null
          total_time_minutes?: number | null
          usage_at_creation?: number | null
          work_order_type?: string
        }
        Update: {
          assigned_to?: string | null
          checklist_id?: string | null
          completed_at?: string | null
          created_at?: string | null
          created_by?: string | null
          fault_description?: string | null
          id?: string
          machine_id?: string
          notes?: string | null
          ot_id?: string | null
          part_id?: string | null
          priority?: number | null
          scheduled_date?: string
          started_at?: string | null
          status?: string
          system_id?: string | null
          title?: string | null
          total_time_minutes?: number | null
          usage_at_creation?: number | null
          work_order_type?: string
        }
        Relationships: [
          {
            foreignKeyName: "maintenance_work_orders_assigned_to_fkey"
            columns: ["assigned_to"]
            isOneToOne: false
            referencedRelation: "employees"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "maintenance_work_orders_assigned_to_fkey"
            columns: ["assigned_to"]
            isOneToOne: false
            referencedRelation: "worker_stats"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "maintenance_work_orders_checklist_id_fkey"
            columns: ["checklist_id"]
            isOneToOne: false
            referencedRelation: "maintenance_checklists"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "maintenance_work_orders_machine_id_fkey"
            columns: ["machine_id"]
            isOneToOne: false
            referencedRelation: "machines"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "maintenance_work_orders_machine_id_fkey"
            columns: ["machine_id"]
            isOneToOne: false
            referencedRelation: "planta_live"
            referencedColumns: ["machine_id"]
          },
          {
            foreignKeyName: "maintenance_work_orders_machine_id_fkey"
            columns: ["machine_id"]
            isOneToOne: false
            referencedRelation: "planta_live"
            referencedColumns: ["workstation_id"]
          },
          {
            foreignKeyName: "maintenance_work_orders_ot_id_fkey"
            columns: ["ot_id"]
            isOneToOne: false
            referencedRelation: "ot_certificacion"
            referencedColumns: ["ot_id"]
          },
          {
            foreignKeyName: "maintenance_work_orders_ot_id_fkey"
            columns: ["ot_id"]
            isOneToOne: false
            referencedRelation: "ot_compras_estado"
            referencedColumns: ["ot_id"]
          },
          {
            foreignKeyName: "maintenance_work_orders_ot_id_fkey"
            columns: ["ot_id"]
            isOneToOne: false
            referencedRelation: "ot_cost_summary"
            referencedColumns: ["ot_id"]
          },
          {
            foreignKeyName: "maintenance_work_orders_ot_id_fkey"
            columns: ["ot_id"]
            isOneToOne: false
            referencedRelation: "ot_fulfillment"
            referencedColumns: ["ot_id"]
          },
          {
            foreignKeyName: "maintenance_work_orders_ot_id_fkey"
            columns: ["ot_id"]
            isOneToOne: false
            referencedRelation: "ots"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "maintenance_work_orders_part_id_fkey"
            columns: ["part_id"]
            isOneToOne: false
            referencedRelation: "machine_parts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "maintenance_work_orders_part_id_fkey"
            columns: ["part_id"]
            isOneToOne: false
            referencedRelation: "machine_parts_health_v"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "maintenance_work_orders_system_id_fkey"
            columns: ["system_id"]
            isOneToOne: false
            referencedRelation: "machine_systems"
            referencedColumns: ["id"]
          },
        ]
      }
      notifications: {
        Row: {
          created_at: string
          id: string
          is_read: boolean
          message: string | null
          metadata: Json
          read_at: string | null
          resource_id: string | null
          resource_type: string | null
          title: string
          type: Database["public"]["Enums"]["notification_type"]
          user_id: string
        }
        Insert: {
          created_at?: string
          id?: string
          is_read?: boolean
          message?: string | null
          metadata?: Json
          read_at?: string | null
          resource_id?: string | null
          resource_type?: string | null
          title: string
          type: Database["public"]["Enums"]["notification_type"]
          user_id: string
        }
        Update: {
          created_at?: string
          id?: string
          is_read?: boolean
          message?: string | null
          metadata?: Json
          read_at?: string | null
          resource_id?: string | null
          resource_type?: string | null
          title?: string
          type?: Database["public"]["Enums"]["notification_type"]
          user_id?: string
        }
        Relationships: []
      }
      ot_approvals: {
        Row: {
          approver_email: string | null
          approver_id: string | null
          approver_name: string | null
          approver_role: string | null
          comments: string | null
          confirmed_via: string | null
          created_at: string
          decided_at: string | null
          decision: string | null
          file_sha256: string | null
          id: string
          ot_id: string
          proofed_on: string | null
          recorded_by: string | null
          reject_reason: string | null
          requested_by: string | null
          resolved_at: string | null
          round: number
          source_ip: unknown
          status: Database["public"]["Enums"]["ot_approval_status"]
          vb_id: string | null
        }
        Insert: {
          approver_email?: string | null
          approver_id?: string | null
          approver_name?: string | null
          approver_role?: string | null
          comments?: string | null
          confirmed_via?: string | null
          created_at?: string
          decided_at?: string | null
          decision?: string | null
          file_sha256?: string | null
          id?: string
          ot_id: string
          proofed_on?: string | null
          recorded_by?: string | null
          reject_reason?: string | null
          requested_by?: string | null
          resolved_at?: string | null
          round?: number
          source_ip?: unknown
          status?: Database["public"]["Enums"]["ot_approval_status"]
          vb_id?: string | null
        }
        Update: {
          approver_email?: string | null
          approver_id?: string | null
          approver_name?: string | null
          approver_role?: string | null
          comments?: string | null
          confirmed_via?: string | null
          created_at?: string
          decided_at?: string | null
          decision?: string | null
          file_sha256?: string | null
          id?: string
          ot_id?: string
          proofed_on?: string | null
          recorded_by?: string | null
          reject_reason?: string | null
          requested_by?: string | null
          resolved_at?: string | null
          round?: number
          source_ip?: unknown
          status?: Database["public"]["Enums"]["ot_approval_status"]
          vb_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "ot_approvals_ot_id_fkey"
            columns: ["ot_id"]
            isOneToOne: false
            referencedRelation: "ot_certificacion"
            referencedColumns: ["ot_id"]
          },
          {
            foreignKeyName: "ot_approvals_ot_id_fkey"
            columns: ["ot_id"]
            isOneToOne: false
            referencedRelation: "ot_compras_estado"
            referencedColumns: ["ot_id"]
          },
          {
            foreignKeyName: "ot_approvals_ot_id_fkey"
            columns: ["ot_id"]
            isOneToOne: false
            referencedRelation: "ot_cost_summary"
            referencedColumns: ["ot_id"]
          },
          {
            foreignKeyName: "ot_approvals_ot_id_fkey"
            columns: ["ot_id"]
            isOneToOne: false
            referencedRelation: "ot_fulfillment"
            referencedColumns: ["ot_id"]
          },
          {
            foreignKeyName: "ot_approvals_ot_id_fkey"
            columns: ["ot_id"]
            isOneToOne: false
            referencedRelation: "ots"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "ot_approvals_vb_id_fkey"
            columns: ["vb_id"]
            isOneToOne: false
            referencedRelation: "vistos_buenos"
            referencedColumns: ["id"]
          },
        ]
      }
      ot_attachments: {
        Row: {
          created_at: string
          draft_id: string | null
          file_size: number | null
          filename: string
          id: string
          mime_type: string | null
          ot_id: string | null
          storage_path: string
          uploaded_by: string | null
          vb_id: string | null
        }
        Insert: {
          created_at?: string
          draft_id?: string | null
          file_size?: number | null
          filename: string
          id?: string
          mime_type?: string | null
          ot_id?: string | null
          storage_path: string
          uploaded_by?: string | null
          vb_id?: string | null
        }
        Update: {
          created_at?: string
          draft_id?: string | null
          file_size?: number | null
          filename?: string
          id?: string
          mime_type?: string | null
          ot_id?: string | null
          storage_path?: string
          uploaded_by?: string | null
          vb_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "ot_attachments_draft_id_fkey"
            columns: ["draft_id"]
            isOneToOne: false
            referencedRelation: "ot_drafts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "ot_attachments_ot_id_fkey"
            columns: ["ot_id"]
            isOneToOne: false
            referencedRelation: "ot_certificacion"
            referencedColumns: ["ot_id"]
          },
          {
            foreignKeyName: "ot_attachments_ot_id_fkey"
            columns: ["ot_id"]
            isOneToOne: false
            referencedRelation: "ot_compras_estado"
            referencedColumns: ["ot_id"]
          },
          {
            foreignKeyName: "ot_attachments_ot_id_fkey"
            columns: ["ot_id"]
            isOneToOne: false
            referencedRelation: "ot_cost_summary"
            referencedColumns: ["ot_id"]
          },
          {
            foreignKeyName: "ot_attachments_ot_id_fkey"
            columns: ["ot_id"]
            isOneToOne: false
            referencedRelation: "ot_fulfillment"
            referencedColumns: ["ot_id"]
          },
          {
            foreignKeyName: "ot_attachments_ot_id_fkey"
            columns: ["ot_id"]
            isOneToOne: false
            referencedRelation: "ots"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "ot_attachments_vb_id_fkey"
            columns: ["vb_id"]
            isOneToOne: false
            referencedRelation: "vistos_buenos"
            referencedColumns: ["id"]
          },
        ]
      }
      ot_cost_lines: {
        Row: {
          approved_by: string | null
          category: Database["public"]["Enums"]["cost_line_category"]
          created_at: string
          description: string
          id: string
          kind: Database["public"]["Enums"]["cost_line_kind"]
          notes: string | null
          occurred_at: string
          ot_id: string
          quantity: number
          recorded_by: string | null
          ref_id: string | null
          ref_type: string | null
          source: string
          total: number | null
          unit: string
          unit_cost: number
        }
        Insert: {
          approved_by?: string | null
          category?: Database["public"]["Enums"]["cost_line_category"]
          created_at?: string
          description: string
          id?: string
          kind: Database["public"]["Enums"]["cost_line_kind"]
          notes?: string | null
          occurred_at?: string
          ot_id: string
          quantity?: number
          recorded_by?: string | null
          ref_id?: string | null
          ref_type?: string | null
          source?: string
          total?: number | null
          unit?: string
          unit_cost?: number
        }
        Update: {
          approved_by?: string | null
          category?: Database["public"]["Enums"]["cost_line_category"]
          created_at?: string
          description?: string
          id?: string
          kind?: Database["public"]["Enums"]["cost_line_kind"]
          notes?: string | null
          occurred_at?: string
          ot_id?: string
          quantity?: number
          recorded_by?: string | null
          ref_id?: string | null
          ref_type?: string | null
          source?: string
          total?: number | null
          unit?: string
          unit_cost?: number
        }
        Relationships: [
          {
            foreignKeyName: "ot_cost_lines_ot_id_fkey"
            columns: ["ot_id"]
            isOneToOne: false
            referencedRelation: "ot_certificacion"
            referencedColumns: ["ot_id"]
          },
          {
            foreignKeyName: "ot_cost_lines_ot_id_fkey"
            columns: ["ot_id"]
            isOneToOne: false
            referencedRelation: "ot_compras_estado"
            referencedColumns: ["ot_id"]
          },
          {
            foreignKeyName: "ot_cost_lines_ot_id_fkey"
            columns: ["ot_id"]
            isOneToOne: false
            referencedRelation: "ot_cost_summary"
            referencedColumns: ["ot_id"]
          },
          {
            foreignKeyName: "ot_cost_lines_ot_id_fkey"
            columns: ["ot_id"]
            isOneToOne: false
            referencedRelation: "ot_fulfillment"
            referencedColumns: ["ot_id"]
          },
          {
            foreignKeyName: "ot_cost_lines_ot_id_fkey"
            columns: ["ot_id"]
            isOneToOne: false
            referencedRelation: "ots"
            referencedColumns: ["id"]
          },
        ]
      }
      ot_drafts: {
        Row: {
          created_at: string
          form_data: Json
          id: string
          step: number
          title: string | null
          updated_at: string
          user_id: string
        }
        Insert: {
          created_at?: string
          form_data?: Json
          id?: string
          step?: number
          title?: string | null
          updated_at?: string
          user_id: string
        }
        Update: {
          created_at?: string
          form_data?: Json
          id?: string
          step?: number
          title?: string | null
          updated_at?: string
          user_id?: string
        }
        Relationships: []
      }
      ot_financials: {
        Row: {
          created_at: string
          energy_cost: number | null
          hours_spent: number | null
          id: string
          labor_cost: number | null
          machine_cost: number | null
          material_cost: number | null
          notes: string | null
          ot_id: string
          outsourcing_cost: number | null
          overhead_cost: number | null
          profit: number | null
          revenue: number | null
          total_cost: number | null
          updated_at: string
        }
        Insert: {
          created_at?: string
          energy_cost?: number | null
          hours_spent?: number | null
          id?: string
          labor_cost?: number | null
          machine_cost?: number | null
          material_cost?: number | null
          notes?: string | null
          ot_id: string
          outsourcing_cost?: number | null
          overhead_cost?: number | null
          profit?: number | null
          revenue?: number | null
          total_cost?: number | null
          updated_at?: string
        }
        Update: {
          created_at?: string
          energy_cost?: number | null
          hours_spent?: number | null
          id?: string
          labor_cost?: number | null
          machine_cost?: number | null
          material_cost?: number | null
          notes?: string | null
          ot_id?: string
          outsourcing_cost?: number | null
          overhead_cost?: number | null
          profit?: number | null
          revenue?: number | null
          total_cost?: number | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "ot_financials_ot_id_fkey"
            columns: ["ot_id"]
            isOneToOne: false
            referencedRelation: "ot_certificacion"
            referencedColumns: ["ot_id"]
          },
          {
            foreignKeyName: "ot_financials_ot_id_fkey"
            columns: ["ot_id"]
            isOneToOne: false
            referencedRelation: "ot_compras_estado"
            referencedColumns: ["ot_id"]
          },
          {
            foreignKeyName: "ot_financials_ot_id_fkey"
            columns: ["ot_id"]
            isOneToOne: false
            referencedRelation: "ot_cost_summary"
            referencedColumns: ["ot_id"]
          },
          {
            foreignKeyName: "ot_financials_ot_id_fkey"
            columns: ["ot_id"]
            isOneToOne: false
            referencedRelation: "ot_fulfillment"
            referencedColumns: ["ot_id"]
          },
          {
            foreignKeyName: "ot_financials_ot_id_fkey"
            columns: ["ot_id"]
            isOneToOne: false
            referencedRelation: "ots"
            referencedColumns: ["id"]
          },
        ]
      }
      ot_machine_schedule: {
        Row: {
          actual_end: string | null
          actual_hours: number | null
          actual_start: string | null
          calc_sheets: number | null
          created_at: string
          created_by: string | null
          estimated_hours: number | null
          hours_override: number | null
          id: string
          machine_id: string
          notes: string | null
          ot_id: string
          paper_type_label: string | null
          scheduled_end: string | null
          scheduled_start: string | null
          sheet_height_cm: number | null
          sheet_width_cm: number | null
          sort_order: number
          updated_at: string
        }
        Insert: {
          actual_end?: string | null
          actual_hours?: number | null
          actual_start?: string | null
          calc_sheets?: number | null
          created_at?: string
          created_by?: string | null
          estimated_hours?: number | null
          hours_override?: number | null
          id?: string
          machine_id: string
          notes?: string | null
          ot_id: string
          paper_type_label?: string | null
          scheduled_end?: string | null
          scheduled_start?: string | null
          sheet_height_cm?: number | null
          sheet_width_cm?: number | null
          sort_order?: number
          updated_at?: string
        }
        Update: {
          actual_end?: string | null
          actual_hours?: number | null
          actual_start?: string | null
          calc_sheets?: number | null
          created_at?: string
          created_by?: string | null
          estimated_hours?: number | null
          hours_override?: number | null
          id?: string
          machine_id?: string
          notes?: string | null
          ot_id?: string
          paper_type_label?: string | null
          scheduled_end?: string | null
          scheduled_start?: string | null
          sheet_height_cm?: number | null
          sheet_width_cm?: number | null
          sort_order?: number
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "ot_machine_schedule_machine_id_fkey"
            columns: ["machine_id"]
            isOneToOne: false
            referencedRelation: "machines"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "ot_machine_schedule_machine_id_fkey"
            columns: ["machine_id"]
            isOneToOne: false
            referencedRelation: "planta_live"
            referencedColumns: ["machine_id"]
          },
          {
            foreignKeyName: "ot_machine_schedule_machine_id_fkey"
            columns: ["machine_id"]
            isOneToOne: false
            referencedRelation: "planta_live"
            referencedColumns: ["workstation_id"]
          },
          {
            foreignKeyName: "ot_machine_schedule_ot_id_fkey"
            columns: ["ot_id"]
            isOneToOne: false
            referencedRelation: "ot_certificacion"
            referencedColumns: ["ot_id"]
          },
          {
            foreignKeyName: "ot_machine_schedule_ot_id_fkey"
            columns: ["ot_id"]
            isOneToOne: false
            referencedRelation: "ot_compras_estado"
            referencedColumns: ["ot_id"]
          },
          {
            foreignKeyName: "ot_machine_schedule_ot_id_fkey"
            columns: ["ot_id"]
            isOneToOne: false
            referencedRelation: "ot_cost_summary"
            referencedColumns: ["ot_id"]
          },
          {
            foreignKeyName: "ot_machine_schedule_ot_id_fkey"
            columns: ["ot_id"]
            isOneToOne: false
            referencedRelation: "ot_fulfillment"
            referencedColumns: ["ot_id"]
          },
          {
            foreignKeyName: "ot_machine_schedule_ot_id_fkey"
            columns: ["ot_id"]
            isOneToOne: false
            referencedRelation: "ots"
            referencedColumns: ["id"]
          },
        ]
      }
      ot_operations: {
        Row: {
          category: Database["public"]["Enums"]["ot_operation_category"]
          created_at: string
          id: string
          name: string
          ot_id: string
          quantity: number
          sort_order: number
          total_cost: number | null
          unit: string
          unit_cost: number
          updated_at: string
        }
        Insert: {
          category: Database["public"]["Enums"]["ot_operation_category"]
          created_at?: string
          id?: string
          name: string
          ot_id: string
          quantity?: number
          sort_order?: number
          total_cost?: number | null
          unit?: string
          unit_cost?: number
          updated_at?: string
        }
        Update: {
          category?: Database["public"]["Enums"]["ot_operation_category"]
          created_at?: string
          id?: string
          name?: string
          ot_id?: string
          quantity?: number
          sort_order?: number
          total_cost?: number | null
          unit?: string
          unit_cost?: number
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "ot_operations_ot_id_fkey"
            columns: ["ot_id"]
            isOneToOne: false
            referencedRelation: "ot_certificacion"
            referencedColumns: ["ot_id"]
          },
          {
            foreignKeyName: "ot_operations_ot_id_fkey"
            columns: ["ot_id"]
            isOneToOne: false
            referencedRelation: "ot_compras_estado"
            referencedColumns: ["ot_id"]
          },
          {
            foreignKeyName: "ot_operations_ot_id_fkey"
            columns: ["ot_id"]
            isOneToOne: false
            referencedRelation: "ot_cost_summary"
            referencedColumns: ["ot_id"]
          },
          {
            foreignKeyName: "ot_operations_ot_id_fkey"
            columns: ["ot_id"]
            isOneToOne: false
            referencedRelation: "ot_fulfillment"
            referencedColumns: ["ot_id"]
          },
          {
            foreignKeyName: "ot_operations_ot_id_fkey"
            columns: ["ot_id"]
            isOneToOne: false
            referencedRelation: "ots"
            referencedColumns: ["id"]
          },
        ]
      }
      ot_real_costs: {
        Row: {
          category: string
          created_at: string
          description: string
          id: string
          notes: string | null
          operation_code: string
          ot_id: string
          quantity: number
          recorded_by: string | null
          total_cost: number | null
          unit: string
          unit_cost: number
          updated_at: string
          workflow_step: string
        }
        Insert: {
          category?: string
          created_at?: string
          description: string
          id?: string
          notes?: string | null
          operation_code: string
          ot_id: string
          quantity?: number
          recorded_by?: string | null
          total_cost?: number | null
          unit?: string
          unit_cost?: number
          updated_at?: string
          workflow_step: string
        }
        Update: {
          category?: string
          created_at?: string
          description?: string
          id?: string
          notes?: string | null
          operation_code?: string
          ot_id?: string
          quantity?: number
          recorded_by?: string | null
          total_cost?: number | null
          unit?: string
          unit_cost?: number
          updated_at?: string
          workflow_step?: string
        }
        Relationships: [
          {
            foreignKeyName: "ot_real_costs_ot_id_fkey"
            columns: ["ot_id"]
            isOneToOne: false
            referencedRelation: "ot_certificacion"
            referencedColumns: ["ot_id"]
          },
          {
            foreignKeyName: "ot_real_costs_ot_id_fkey"
            columns: ["ot_id"]
            isOneToOne: false
            referencedRelation: "ot_compras_estado"
            referencedColumns: ["ot_id"]
          },
          {
            foreignKeyName: "ot_real_costs_ot_id_fkey"
            columns: ["ot_id"]
            isOneToOne: false
            referencedRelation: "ot_cost_summary"
            referencedColumns: ["ot_id"]
          },
          {
            foreignKeyName: "ot_real_costs_ot_id_fkey"
            columns: ["ot_id"]
            isOneToOne: false
            referencedRelation: "ot_fulfillment"
            referencedColumns: ["ot_id"]
          },
          {
            foreignKeyName: "ot_real_costs_ot_id_fkey"
            columns: ["ot_id"]
            isOneToOne: false
            referencedRelation: "ots"
            referencedColumns: ["id"]
          },
        ]
      }
      ot_requirements: {
        Row: {
          created_at: string
          description: string
          id: string
          item_id: string | null
          kind: string
          lot_id: string | null
          notes: string | null
          ot_id: string
          purchase_id: string | null
          quantity: number | null
          resolved_at: string | null
          resolved_by: string | null
          source: string
          status: string
          unit: string | null
          updated_at: string
        }
        Insert: {
          created_at?: string
          description: string
          id?: string
          item_id?: string | null
          kind: string
          lot_id?: string | null
          notes?: string | null
          ot_id: string
          purchase_id?: string | null
          quantity?: number | null
          resolved_at?: string | null
          resolved_by?: string | null
          source?: string
          status?: string
          unit?: string | null
          updated_at?: string
        }
        Update: {
          created_at?: string
          description?: string
          id?: string
          item_id?: string | null
          kind?: string
          lot_id?: string | null
          notes?: string | null
          ot_id?: string
          purchase_id?: string | null
          quantity?: number | null
          resolved_at?: string | null
          resolved_by?: string | null
          source?: string
          status?: string
          unit?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "ot_requirements_item_id_fkey"
            columns: ["item_id"]
            isOneToOne: false
            referencedRelation: "inventory_items"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "ot_requirements_item_id_fkey"
            columns: ["item_id"]
            isOneToOne: false
            referencedRelation: "inventory_items_stock_v"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "ot_requirements_item_id_fkey"
            columns: ["item_id"]
            isOneToOne: false
            referencedRelation: "inventory_low_stock_alerts_v"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "ot_requirements_item_id_fkey"
            columns: ["item_id"]
            isOneToOne: false
            referencedRelation: "material_cost_v"
            referencedColumns: ["item_id"]
          },
          {
            foreignKeyName: "ot_requirements_lot_id_fkey"
            columns: ["lot_id"]
            isOneToOne: false
            referencedRelation: "inventory_lots"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "ot_requirements_ot_id_fkey"
            columns: ["ot_id"]
            isOneToOne: false
            referencedRelation: "ot_certificacion"
            referencedColumns: ["ot_id"]
          },
          {
            foreignKeyName: "ot_requirements_ot_id_fkey"
            columns: ["ot_id"]
            isOneToOne: false
            referencedRelation: "ot_compras_estado"
            referencedColumns: ["ot_id"]
          },
          {
            foreignKeyName: "ot_requirements_ot_id_fkey"
            columns: ["ot_id"]
            isOneToOne: false
            referencedRelation: "ot_cost_summary"
            referencedColumns: ["ot_id"]
          },
          {
            foreignKeyName: "ot_requirements_ot_id_fkey"
            columns: ["ot_id"]
            isOneToOne: false
            referencedRelation: "ot_fulfillment"
            referencedColumns: ["ot_id"]
          },
          {
            foreignKeyName: "ot_requirements_ot_id_fkey"
            columns: ["ot_id"]
            isOneToOne: false
            referencedRelation: "ots"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "ot_requirements_purchase_id_fkey"
            columns: ["purchase_id"]
            isOneToOne: false
            referencedRelation: "machine_parts_on_order_v"
            referencedColumns: ["purchase_id"]
          },
          {
            foreignKeyName: "ot_requirements_purchase_id_fkey"
            columns: ["purchase_id"]
            isOneToOne: false
            referencedRelation: "oc_billing"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "ot_requirements_purchase_id_fkey"
            columns: ["purchase_id"]
            isOneToOne: false
            referencedRelation: "oc_conciliacion"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "ot_requirements_purchase_id_fkey"
            columns: ["purchase_id"]
            isOneToOne: false
            referencedRelation: "purchases"
            referencedColumns: ["id"]
          },
        ]
      }
      ot_state_transitions: {
        Row: {
          changed_by: string | null
          created_at: string
          from_status: Database["public"]["Enums"]["ot_status"] | null
          id: string
          metadata: Json
          ot_id: string
          reason: string | null
          to_status: Database["public"]["Enums"]["ot_status"]
        }
        Insert: {
          changed_by?: string | null
          created_at?: string
          from_status?: Database["public"]["Enums"]["ot_status"] | null
          id?: string
          metadata?: Json
          ot_id: string
          reason?: string | null
          to_status: Database["public"]["Enums"]["ot_status"]
        }
        Update: {
          changed_by?: string | null
          created_at?: string
          from_status?: Database["public"]["Enums"]["ot_status"] | null
          id?: string
          metadata?: Json
          ot_id?: string
          reason?: string | null
          to_status?: Database["public"]["Enums"]["ot_status"]
        }
        Relationships: [
          {
            foreignKeyName: "ot_state_transitions_ot_id_fkey"
            columns: ["ot_id"]
            isOneToOne: false
            referencedRelation: "ot_certificacion"
            referencedColumns: ["ot_id"]
          },
          {
            foreignKeyName: "ot_state_transitions_ot_id_fkey"
            columns: ["ot_id"]
            isOneToOne: false
            referencedRelation: "ot_compras_estado"
            referencedColumns: ["ot_id"]
          },
          {
            foreignKeyName: "ot_state_transitions_ot_id_fkey"
            columns: ["ot_id"]
            isOneToOne: false
            referencedRelation: "ot_cost_summary"
            referencedColumns: ["ot_id"]
          },
          {
            foreignKeyName: "ot_state_transitions_ot_id_fkey"
            columns: ["ot_id"]
            isOneToOne: false
            referencedRelation: "ot_fulfillment"
            referencedColumns: ["ot_id"]
          },
          {
            foreignKeyName: "ot_state_transitions_ot_id_fkey"
            columns: ["ot_id"]
            isOneToOne: false
            referencedRelation: "ots"
            referencedColumns: ["id"]
          },
        ]
      }
      ot_status_history: {
        Row: {
          changed_by: string | null
          changed_by_role: string | null
          created_at: string
          from_status: Database["public"]["Enums"]["ot_status"] | null
          id: string
          metadata: Json
          ot_id: string
          reason: string | null
          rollback: boolean
          to_status: Database["public"]["Enums"]["ot_status"]
        }
        Insert: {
          changed_by?: string | null
          changed_by_role?: string | null
          created_at?: string
          from_status?: Database["public"]["Enums"]["ot_status"] | null
          id?: string
          metadata?: Json
          ot_id: string
          reason?: string | null
          rollback?: boolean
          to_status: Database["public"]["Enums"]["ot_status"]
        }
        Update: {
          changed_by?: string | null
          changed_by_role?: string | null
          created_at?: string
          from_status?: Database["public"]["Enums"]["ot_status"] | null
          id?: string
          metadata?: Json
          ot_id?: string
          reason?: string | null
          rollback?: boolean
          to_status?: Database["public"]["Enums"]["ot_status"]
        }
        Relationships: [
          {
            foreignKeyName: "ot_status_history_ot_id_fkey"
            columns: ["ot_id"]
            isOneToOne: false
            referencedRelation: "ot_certificacion"
            referencedColumns: ["ot_id"]
          },
          {
            foreignKeyName: "ot_status_history_ot_id_fkey"
            columns: ["ot_id"]
            isOneToOne: false
            referencedRelation: "ot_compras_estado"
            referencedColumns: ["ot_id"]
          },
          {
            foreignKeyName: "ot_status_history_ot_id_fkey"
            columns: ["ot_id"]
            isOneToOne: false
            referencedRelation: "ot_cost_summary"
            referencedColumns: ["ot_id"]
          },
          {
            foreignKeyName: "ot_status_history_ot_id_fkey"
            columns: ["ot_id"]
            isOneToOne: false
            referencedRelation: "ot_fulfillment"
            referencedColumns: ["ot_id"]
          },
          {
            foreignKeyName: "ot_status_history_ot_id_fkey"
            columns: ["ot_id"]
            isOneToOne: false
            referencedRelation: "ots"
            referencedColumns: ["id"]
          },
        ]
      }
      ot_templates: {
        Row: {
          color_back: Database["public"]["Enums"]["ot_color_mode"] | null
          color_front: Database["public"]["Enums"]["ot_color_mode"] | null
          commission_pct: number | null
          created_at: string
          created_by: string | null
          default_operations: Json | null
          description: string | null
          finishes: Json | null
          grammage_gsm: number | null
          height_cm: number | null
          id: string
          increment_pct: number | null
          is_active: boolean
          margin_pct: number | null
          name: string
          product_type: Database["public"]["Enums"]["ot_product_type"] | null
          substrate_type:
            | Database["public"]["Enums"]["ot_substrate_type"]
            | null
          updated_at: string
          width_cm: number | null
        }
        Insert: {
          color_back?: Database["public"]["Enums"]["ot_color_mode"] | null
          color_front?: Database["public"]["Enums"]["ot_color_mode"] | null
          commission_pct?: number | null
          created_at?: string
          created_by?: string | null
          default_operations?: Json | null
          description?: string | null
          finishes?: Json | null
          grammage_gsm?: number | null
          height_cm?: number | null
          id?: string
          increment_pct?: number | null
          is_active?: boolean
          margin_pct?: number | null
          name: string
          product_type?: Database["public"]["Enums"]["ot_product_type"] | null
          substrate_type?:
            | Database["public"]["Enums"]["ot_substrate_type"]
            | null
          updated_at?: string
          width_cm?: number | null
        }
        Update: {
          color_back?: Database["public"]["Enums"]["ot_color_mode"] | null
          color_front?: Database["public"]["Enums"]["ot_color_mode"] | null
          commission_pct?: number | null
          created_at?: string
          created_by?: string | null
          default_operations?: Json | null
          description?: string | null
          finishes?: Json | null
          grammage_gsm?: number | null
          height_cm?: number | null
          id?: string
          increment_pct?: number | null
          is_active?: boolean
          margin_pct?: number | null
          name?: string
          product_type?: Database["public"]["Enums"]["ot_product_type"] | null
          substrate_type?:
            | Database["public"]["Enums"]["ot_substrate_type"]
            | null
          updated_at?: string
          width_cm?: number | null
        }
        Relationships: []
      }
      ots: {
        Row: {
          assigned_machine_id: string | null
          calc_finish_hours: number | null
          calc_ink_kg: number | null
          calc_plates: number | null
          calc_print_hours: number | null
          calc_sheets: number | null
          calc_substrate_kg: number | null
          cliche_code: string | null
          client_id: string | null
          client_name: string
          color_back: Database["public"]["Enums"]["ot_color_mode"] | null
          color_front: Database["public"]["Enums"]["ot_color_mode"] | null
          commission_amount: number | null
          commission_pct: number | null
          completed_at: string | null
          created_at: string
          created_by: string | null
          deadline: string | null
          description: string | null
          die_code: string | null
          die_id: string | null
          die_source: string | null
          finish_barniz: boolean
          finish_hot_stamping: boolean
          finish_laminado: boolean
          finish_numeracion: boolean
          finish_pegado: boolean
          finish_perforado: boolean
          finish_plegado: boolean
          finish_relieve: boolean
          finish_troquelado: boolean
          finish_uv_localizado: boolean
          flag_ord: boolean
          flag_paper_arrived: boolean
          flag_plan: boolean
          flag_pro: boolean
          flag_vbp: boolean
          grammage_gsm: number | null
          height_cm: number | null
          id: string
          increment_amount: number | null
          increment_pct: number | null
          ink_coverage: string | null
          is_partial: boolean
          lamination_type: string | null
          margin_amount: number | null
          margin_pct: number | null
          notes: string | null
          ot_number: string
          pantone_colors: string[] | null
          priority: number
          priority_level: Database["public"]["Enums"]["ot_priority_level"]
          proceso_actual: string | null
          product_image_url: string | null
          product_name: string | null
          product_type: Database["public"]["Enums"]["ot_product_type"] | null
          production_detail: Json | null
          quantity: number
          relieve_matrix_code: string | null
          salesman_id: string | null
          share_token: string
          sin_arte: boolean
          split_group_id: string | null
          split_label: string | null
          status: Database["public"]["Enums"]["ot_status"]
          substrate_brand: string | null
          substrate_supplier: string | null
          substrate_type:
            | Database["public"]["Enums"]["ot_substrate_type"]
            | null
          subtotal: number | null
          template_id: string | null
          total_price: number | null
          unit_price: number | null
          updated_at: string
          vb_id: string | null
          width_cm: number | null
        }
        Insert: {
          assigned_machine_id?: string | null
          calc_finish_hours?: number | null
          calc_ink_kg?: number | null
          calc_plates?: number | null
          calc_print_hours?: number | null
          calc_sheets?: number | null
          calc_substrate_kg?: number | null
          cliche_code?: string | null
          client_id?: string | null
          client_name: string
          color_back?: Database["public"]["Enums"]["ot_color_mode"] | null
          color_front?: Database["public"]["Enums"]["ot_color_mode"] | null
          commission_amount?: number | null
          commission_pct?: number | null
          completed_at?: string | null
          created_at?: string
          created_by?: string | null
          deadline?: string | null
          description?: string | null
          die_code?: string | null
          die_id?: string | null
          die_source?: string | null
          finish_barniz?: boolean
          finish_hot_stamping?: boolean
          finish_laminado?: boolean
          finish_numeracion?: boolean
          finish_pegado?: boolean
          finish_perforado?: boolean
          finish_plegado?: boolean
          finish_relieve?: boolean
          finish_troquelado?: boolean
          finish_uv_localizado?: boolean
          flag_ord?: boolean
          flag_paper_arrived?: boolean
          flag_plan?: boolean
          flag_pro?: boolean
          flag_vbp?: boolean
          grammage_gsm?: number | null
          height_cm?: number | null
          id?: string
          increment_amount?: number | null
          increment_pct?: number | null
          ink_coverage?: string | null
          is_partial?: boolean
          lamination_type?: string | null
          margin_amount?: number | null
          margin_pct?: number | null
          notes?: string | null
          ot_number: string
          pantone_colors?: string[] | null
          priority?: number
          priority_level?: Database["public"]["Enums"]["ot_priority_level"]
          proceso_actual?: string | null
          product_image_url?: string | null
          product_name?: string | null
          product_type?: Database["public"]["Enums"]["ot_product_type"] | null
          production_detail?: Json | null
          quantity?: number
          relieve_matrix_code?: string | null
          salesman_id?: string | null
          share_token?: string
          sin_arte?: boolean
          split_group_id?: string | null
          split_label?: string | null
          status?: Database["public"]["Enums"]["ot_status"]
          substrate_brand?: string | null
          substrate_supplier?: string | null
          substrate_type?:
            | Database["public"]["Enums"]["ot_substrate_type"]
            | null
          subtotal?: number | null
          template_id?: string | null
          total_price?: number | null
          unit_price?: number | null
          updated_at?: string
          vb_id?: string | null
          width_cm?: number | null
        }
        Update: {
          assigned_machine_id?: string | null
          calc_finish_hours?: number | null
          calc_ink_kg?: number | null
          calc_plates?: number | null
          calc_print_hours?: number | null
          calc_sheets?: number | null
          calc_substrate_kg?: number | null
          cliche_code?: string | null
          client_id?: string | null
          client_name?: string
          color_back?: Database["public"]["Enums"]["ot_color_mode"] | null
          color_front?: Database["public"]["Enums"]["ot_color_mode"] | null
          commission_amount?: number | null
          commission_pct?: number | null
          completed_at?: string | null
          created_at?: string
          created_by?: string | null
          deadline?: string | null
          description?: string | null
          die_code?: string | null
          die_id?: string | null
          die_source?: string | null
          finish_barniz?: boolean
          finish_hot_stamping?: boolean
          finish_laminado?: boolean
          finish_numeracion?: boolean
          finish_pegado?: boolean
          finish_perforado?: boolean
          finish_plegado?: boolean
          finish_relieve?: boolean
          finish_troquelado?: boolean
          finish_uv_localizado?: boolean
          flag_ord?: boolean
          flag_paper_arrived?: boolean
          flag_plan?: boolean
          flag_pro?: boolean
          flag_vbp?: boolean
          grammage_gsm?: number | null
          height_cm?: number | null
          id?: string
          increment_amount?: number | null
          increment_pct?: number | null
          ink_coverage?: string | null
          is_partial?: boolean
          lamination_type?: string | null
          margin_amount?: number | null
          margin_pct?: number | null
          notes?: string | null
          ot_number?: string
          pantone_colors?: string[] | null
          priority?: number
          priority_level?: Database["public"]["Enums"]["ot_priority_level"]
          proceso_actual?: string | null
          product_image_url?: string | null
          product_name?: string | null
          product_type?: Database["public"]["Enums"]["ot_product_type"] | null
          production_detail?: Json | null
          quantity?: number
          relieve_matrix_code?: string | null
          salesman_id?: string | null
          share_token?: string
          sin_arte?: boolean
          split_group_id?: string | null
          split_label?: string | null
          status?: Database["public"]["Enums"]["ot_status"]
          substrate_brand?: string | null
          substrate_supplier?: string | null
          substrate_type?:
            | Database["public"]["Enums"]["ot_substrate_type"]
            | null
          subtotal?: number | null
          template_id?: string | null
          total_price?: number | null
          unit_price?: number | null
          updated_at?: string
          vb_id?: string | null
          width_cm?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "ots_assigned_machine_id_fkey"
            columns: ["assigned_machine_id"]
            isOneToOne: false
            referencedRelation: "machines"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "ots_assigned_machine_id_fkey"
            columns: ["assigned_machine_id"]
            isOneToOne: false
            referencedRelation: "planta_live"
            referencedColumns: ["machine_id"]
          },
          {
            foreignKeyName: "ots_assigned_machine_id_fkey"
            columns: ["assigned_machine_id"]
            isOneToOne: false
            referencedRelation: "planta_live"
            referencedColumns: ["workstation_id"]
          },
          {
            foreignKeyName: "ots_client_id_fkey"
            columns: ["client_id"]
            isOneToOne: false
            referencedRelation: "clients"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "ots_die_id_fkey"
            columns: ["die_id"]
            isOneToOne: false
            referencedRelation: "dies"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "ots_salesman_id_fkey"
            columns: ["salesman_id"]
            isOneToOne: false
            referencedRelation: "employees"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "ots_salesman_id_fkey"
            columns: ["salesman_id"]
            isOneToOne: false
            referencedRelation: "worker_stats"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "ots_template_id_fkey"
            columns: ["template_id"]
            isOneToOne: false
            referencedRelation: "ot_templates"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "ots_vb_id_fkey"
            columns: ["vb_id"]
            isOneToOne: false
            referencedRelation: "vistos_buenos"
            referencedColumns: ["id"]
          },
        ]
      }
      permission_templates: {
        Row: {
          created_at: string
          created_by: string | null
          department: string | null
          id: string
          is_active: boolean
          name: string
          permissions: Json
          role: Database["public"]["Enums"]["app_role"] | null
          updated_at: string
        }
        Insert: {
          created_at?: string
          created_by?: string | null
          department?: string | null
          id?: string
          is_active?: boolean
          name: string
          permissions?: Json
          role?: Database["public"]["Enums"]["app_role"] | null
          updated_at?: string
        }
        Update: {
          created_at?: string
          created_by?: string | null
          department?: string | null
          id?: string
          is_active?: boolean
          name?: string
          permissions?: Json
          role?: Database["public"]["Enums"]["app_role"] | null
          updated_at?: string
        }
        Relationships: []
      }
      program_task_logs: {
        Row: {
          completed: boolean
          completed_at: string | null
          completed_by: string | null
          created_at: string
          day_of_week: number
          id: string
          notes: string | null
          program_id: string
          task_id: string
          week_start: string
        }
        Insert: {
          completed?: boolean
          completed_at?: string | null
          completed_by?: string | null
          created_at?: string
          day_of_week: number
          id?: string
          notes?: string | null
          program_id: string
          task_id: string
          week_start: string
        }
        Update: {
          completed?: boolean
          completed_at?: string | null
          completed_by?: string | null
          created_at?: string
          day_of_week?: number
          id?: string
          notes?: string | null
          program_id?: string
          task_id?: string
          week_start?: string
        }
        Relationships: [
          {
            foreignKeyName: "program_task_logs_completed_by_fkey"
            columns: ["completed_by"]
            isOneToOne: false
            referencedRelation: "employees"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "program_task_logs_completed_by_fkey"
            columns: ["completed_by"]
            isOneToOne: false
            referencedRelation: "worker_stats"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "program_task_logs_program_id_fkey"
            columns: ["program_id"]
            isOneToOne: false
            referencedRelation: "maintenance_programs"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "program_task_logs_task_id_fkey"
            columns: ["task_id"]
            isOneToOne: false
            referencedRelation: "program_tasks"
            referencedColumns: ["id"]
          },
        ]
      }
      program_tasks: {
        Row: {
          action_type: Database["public"]["Enums"]["task_action"]
          created_at: string
          description: string
          estimated_minutes: number | null
          frequency: Database["public"]["Enums"]["task_frequency"]
          id: string
          is_active: boolean
          notes: string | null
          program_id: string
          section: string | null
          sort_order: number
          source: string | null
          subsection: string | null
          task_number: number | null
        }
        Insert: {
          action_type?: Database["public"]["Enums"]["task_action"]
          created_at?: string
          description: string
          estimated_minutes?: number | null
          frequency: Database["public"]["Enums"]["task_frequency"]
          id?: string
          is_active?: boolean
          notes?: string | null
          program_id: string
          section?: string | null
          sort_order?: number
          source?: string | null
          subsection?: string | null
          task_number?: number | null
        }
        Update: {
          action_type?: Database["public"]["Enums"]["task_action"]
          created_at?: string
          description?: string
          estimated_minutes?: number | null
          frequency?: Database["public"]["Enums"]["task_frequency"]
          id?: string
          is_active?: boolean
          notes?: string | null
          program_id?: string
          section?: string | null
          sort_order?: number
          source?: string | null
          subsection?: string | null
          task_number?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "program_tasks_program_id_fkey"
            columns: ["program_id"]
            isOneToOne: false
            referencedRelation: "maintenance_programs"
            referencedColumns: ["id"]
          },
        ]
      }
      purchase_invoices: {
        Row: {
          amount: number
          created_at: string
          id: string
          invoice_date: string
          invoice_number: string
          issuer_rut: string | null
          match_notes: string | null
          match_status: string | null
          matched_at: string | null
          net: number | null
          notes: string | null
          purchase_id: string
          recorded_by: string | null
          status: Database["public"]["Enums"]["factura_compra_status"]
          updated_at: string
          vat: number | null
        }
        Insert: {
          amount?: number
          created_at?: string
          id?: string
          invoice_date?: string
          invoice_number: string
          issuer_rut?: string | null
          match_notes?: string | null
          match_status?: string | null
          matched_at?: string | null
          net?: number | null
          notes?: string | null
          purchase_id: string
          recorded_by?: string | null
          status?: Database["public"]["Enums"]["factura_compra_status"]
          updated_at?: string
          vat?: number | null
        }
        Update: {
          amount?: number
          created_at?: string
          id?: string
          invoice_date?: string
          invoice_number?: string
          issuer_rut?: string | null
          match_notes?: string | null
          match_status?: string | null
          matched_at?: string | null
          net?: number | null
          notes?: string | null
          purchase_id?: string
          recorded_by?: string | null
          status?: Database["public"]["Enums"]["factura_compra_status"]
          updated_at?: string
          vat?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "purchase_invoices_purchase_id_fkey"
            columns: ["purchase_id"]
            isOneToOne: false
            referencedRelation: "machine_parts_on_order_v"
            referencedColumns: ["purchase_id"]
          },
          {
            foreignKeyName: "purchase_invoices_purchase_id_fkey"
            columns: ["purchase_id"]
            isOneToOne: false
            referencedRelation: "oc_billing"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "purchase_invoices_purchase_id_fkey"
            columns: ["purchase_id"]
            isOneToOne: false
            referencedRelation: "oc_conciliacion"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "purchase_invoices_purchase_id_fkey"
            columns: ["purchase_id"]
            isOneToOne: false
            referencedRelation: "purchases"
            referencedColumns: ["id"]
          },
        ]
      }
      purchase_items: {
        Row: {
          created_at: string
          description: string | null
          id: string
          item_id: string | null
          lot_id: string | null
          machine_part_id: string | null
          purchase_id: string
          quantity: number
          unit_cost: number | null
        }
        Insert: {
          created_at?: string
          description?: string | null
          id?: string
          item_id?: string | null
          lot_id?: string | null
          machine_part_id?: string | null
          purchase_id: string
          quantity?: number
          unit_cost?: number | null
        }
        Update: {
          created_at?: string
          description?: string | null
          id?: string
          item_id?: string | null
          lot_id?: string | null
          machine_part_id?: string | null
          purchase_id?: string
          quantity?: number
          unit_cost?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "purchase_items_item_id_fkey"
            columns: ["item_id"]
            isOneToOne: false
            referencedRelation: "inventory_items"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "purchase_items_item_id_fkey"
            columns: ["item_id"]
            isOneToOne: false
            referencedRelation: "inventory_items_stock_v"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "purchase_items_item_id_fkey"
            columns: ["item_id"]
            isOneToOne: false
            referencedRelation: "inventory_low_stock_alerts_v"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "purchase_items_item_id_fkey"
            columns: ["item_id"]
            isOneToOne: false
            referencedRelation: "material_cost_v"
            referencedColumns: ["item_id"]
          },
          {
            foreignKeyName: "purchase_items_lot_id_fkey"
            columns: ["lot_id"]
            isOneToOne: false
            referencedRelation: "inventory_lots"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "purchase_items_machine_part_id_fkey"
            columns: ["machine_part_id"]
            isOneToOne: false
            referencedRelation: "machine_parts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "purchase_items_machine_part_id_fkey"
            columns: ["machine_part_id"]
            isOneToOne: false
            referencedRelation: "machine_parts_health_v"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "purchase_items_purchase_id_fkey"
            columns: ["purchase_id"]
            isOneToOne: false
            referencedRelation: "machine_parts_on_order_v"
            referencedColumns: ["purchase_id"]
          },
          {
            foreignKeyName: "purchase_items_purchase_id_fkey"
            columns: ["purchase_id"]
            isOneToOne: false
            referencedRelation: "oc_billing"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "purchase_items_purchase_id_fkey"
            columns: ["purchase_id"]
            isOneToOne: false
            referencedRelation: "oc_conciliacion"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "purchase_items_purchase_id_fkey"
            columns: ["purchase_id"]
            isOneToOne: false
            referencedRelation: "purchases"
            referencedColumns: ["id"]
          },
        ]
      }
      purchases: {
        Row: {
          certification_details: string | null
          created_at: string | null
          expected_date: string | null
          id: string
          issued_at: string | null
          issued_by: string | null
          notes: string | null
          oc_number: string | null
          ot_id: string | null
          purchase_date: string
          status: Database["public"]["Enums"]["oc_status"]
          supplier: string
          supplier_giro: string | null
          supplier_rut: string | null
          total_cost: number
          updated_at: string | null
          voided_at: string | null
          voided_by: string | null
          voided_reason: string | null
        }
        Insert: {
          certification_details?: string | null
          created_at?: string | null
          expected_date?: string | null
          id?: string
          issued_at?: string | null
          issued_by?: string | null
          notes?: string | null
          oc_number?: string | null
          ot_id?: string | null
          purchase_date: string
          status?: Database["public"]["Enums"]["oc_status"]
          supplier: string
          supplier_giro?: string | null
          supplier_rut?: string | null
          total_cost?: number
          updated_at?: string | null
          voided_at?: string | null
          voided_by?: string | null
          voided_reason?: string | null
        }
        Update: {
          certification_details?: string | null
          created_at?: string | null
          expected_date?: string | null
          id?: string
          issued_at?: string | null
          issued_by?: string | null
          notes?: string | null
          oc_number?: string | null
          ot_id?: string | null
          purchase_date?: string
          status?: Database["public"]["Enums"]["oc_status"]
          supplier?: string
          supplier_giro?: string | null
          supplier_rut?: string | null
          total_cost?: number
          updated_at?: string | null
          voided_at?: string | null
          voided_by?: string | null
          voided_reason?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "purchases_ot_id_fkey"
            columns: ["ot_id"]
            isOneToOne: false
            referencedRelation: "ot_certificacion"
            referencedColumns: ["ot_id"]
          },
          {
            foreignKeyName: "purchases_ot_id_fkey"
            columns: ["ot_id"]
            isOneToOne: false
            referencedRelation: "ot_compras_estado"
            referencedColumns: ["ot_id"]
          },
          {
            foreignKeyName: "purchases_ot_id_fkey"
            columns: ["ot_id"]
            isOneToOne: false
            referencedRelation: "ot_cost_summary"
            referencedColumns: ["ot_id"]
          },
          {
            foreignKeyName: "purchases_ot_id_fkey"
            columns: ["ot_id"]
            isOneToOne: false
            referencedRelation: "ot_fulfillment"
            referencedColumns: ["ot_id"]
          },
          {
            foreignKeyName: "purchases_ot_id_fkey"
            columns: ["ot_id"]
            isOneToOne: false
            referencedRelation: "ots"
            referencedColumns: ["id"]
          },
        ]
      }
      reporting_exports: {
        Row: {
          completed_at: string | null
          created_at: string
          error_message: string | null
          file_path: string | null
          filters: Json
          format: string
          id: string
          report_type: string
          requested_by: string
          status: Database["public"]["Enums"]["report_export_status"]
        }
        Insert: {
          completed_at?: string | null
          created_at?: string
          error_message?: string | null
          file_path?: string | null
          filters?: Json
          format?: string
          id?: string
          report_type: string
          requested_by: string
          status?: Database["public"]["Enums"]["report_export_status"]
        }
        Update: {
          completed_at?: string | null
          created_at?: string
          error_message?: string | null
          file_path?: string | null
          filters?: Json
          format?: string
          id?: string
          report_type?: string
          requested_by?: string
          status?: Database["public"]["Enums"]["report_export_status"]
        }
        Relationships: []
      }
      reporting_snapshots: {
        Row: {
          created_at: string
          generated_by: string | null
          id: string
          metrics: Json
          snapshot_date: string
        }
        Insert: {
          created_at?: string
          generated_by?: string | null
          id?: string
          metrics?: Json
          snapshot_date: string
        }
        Update: {
          created_at?: string
          generated_by?: string | null
          id?: string
          metrics?: Json
          snapshot_date?: string
        }
        Relationships: []
      }
      roster_workers: {
        Row: {
          created_at: string | null
          employee_id: string | null
          id: string
          roster_id: string
        }
        Insert: {
          created_at?: string | null
          employee_id?: string | null
          id?: string
          roster_id: string
        }
        Update: {
          created_at?: string | null
          employee_id?: string | null
          id?: string
          roster_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "roster_workers_employee_id_fkey"
            columns: ["employee_id"]
            isOneToOne: false
            referencedRelation: "employees"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "roster_workers_employee_id_fkey"
            columns: ["employee_id"]
            isOneToOne: false
            referencedRelation: "worker_stats"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "roster_workers_roster_id_fkey"
            columns: ["roster_id"]
            isOneToOne: false
            referencedRelation: "rosters"
            referencedColumns: ["id"]
          },
        ]
      }
      rosters: {
        Row: {
          created_at: string | null
          created_by: string | null
          department: string | null
          id: string
          name: string
          updated_at: string | null
        }
        Insert: {
          created_at?: string | null
          created_by?: string | null
          department?: string | null
          id?: string
          name: string
          updated_at?: string | null
        }
        Update: {
          created_at?: string | null
          created_by?: string | null
          department?: string | null
          id?: string
          name?: string
          updated_at?: string | null
        }
        Relationships: []
      }
      sales_invoices: {
        Row: {
          client_id: string | null
          client_name: string | null
          created_at: string
          due_date: string | null
          id: string
          invoice_number: string
          issued_date: string
          net_amount: number
          notes: string | null
          ot_id: string | null
          paid_date: string | null
          status: Database["public"]["Enums"]["sales_invoice_status"]
          tax_amount: number
          total_amount: number
          updated_at: string
        }
        Insert: {
          client_id?: string | null
          client_name?: string | null
          created_at?: string
          due_date?: string | null
          id?: string
          invoice_number?: string
          issued_date?: string
          net_amount?: number
          notes?: string | null
          ot_id?: string | null
          paid_date?: string | null
          status?: Database["public"]["Enums"]["sales_invoice_status"]
          tax_amount?: number
          total_amount?: number
          updated_at?: string
        }
        Update: {
          client_id?: string | null
          client_name?: string | null
          created_at?: string
          due_date?: string | null
          id?: string
          invoice_number?: string
          issued_date?: string
          net_amount?: number
          notes?: string | null
          ot_id?: string | null
          paid_date?: string | null
          status?: Database["public"]["Enums"]["sales_invoice_status"]
          tax_amount?: number
          total_amount?: number
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "sales_invoices_client_id_fkey"
            columns: ["client_id"]
            isOneToOne: false
            referencedRelation: "clients"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "sales_invoices_ot_id_fkey"
            columns: ["ot_id"]
            isOneToOne: false
            referencedRelation: "ot_certificacion"
            referencedColumns: ["ot_id"]
          },
          {
            foreignKeyName: "sales_invoices_ot_id_fkey"
            columns: ["ot_id"]
            isOneToOne: false
            referencedRelation: "ot_compras_estado"
            referencedColumns: ["ot_id"]
          },
          {
            foreignKeyName: "sales_invoices_ot_id_fkey"
            columns: ["ot_id"]
            isOneToOne: false
            referencedRelation: "ot_cost_summary"
            referencedColumns: ["ot_id"]
          },
          {
            foreignKeyName: "sales_invoices_ot_id_fkey"
            columns: ["ot_id"]
            isOneToOne: false
            referencedRelation: "ot_fulfillment"
            referencedColumns: ["ot_id"]
          },
          {
            foreignKeyName: "sales_invoices_ot_id_fkey"
            columns: ["ot_id"]
            isOneToOne: false
            referencedRelation: "ots"
            referencedColumns: ["id"]
          },
        ]
      }
      saved_searches: {
        Row: {
          created_at: string
          domain: string
          filters: Json
          id: string
          is_default: boolean
          name: string
          updated_at: string
          user_id: string
        }
        Insert: {
          created_at?: string
          domain: string
          filters?: Json
          id?: string
          is_default?: boolean
          name: string
          updated_at?: string
          user_id: string
        }
        Update: {
          created_at?: string
          domain?: string
          filters?: Json
          id?: string
          is_default?: boolean
          name?: string
          updated_at?: string
          user_id?: string
        }
        Relationships: []
      }
      scheduling_cost_models: {
        Row: {
          cost_weight: number
          created_at: string
          id: string
          is_active: boolean
          maximum_hourly_rate: number | null
          minimum_hourly_rate: number | null
          name: string
          night_shift_multiplier: number | null
          overtime_multiplier_100: number | null
          overtime_multiplier_50: number | null
          prefer_lower_cost: boolean
          rating_weight: number
          rounding_increment: number
          skill_weight: number
          updated_at: string
          weekend_multiplier: number | null
        }
        Insert: {
          cost_weight?: number
          created_at?: string
          id?: string
          is_active?: boolean
          maximum_hourly_rate?: number | null
          minimum_hourly_rate?: number | null
          name: string
          night_shift_multiplier?: number | null
          overtime_multiplier_100?: number | null
          overtime_multiplier_50?: number | null
          prefer_lower_cost?: boolean
          rating_weight?: number
          rounding_increment?: number
          skill_weight?: number
          updated_at?: string
          weekend_multiplier?: number | null
        }
        Update: {
          cost_weight?: number
          created_at?: string
          id?: string
          is_active?: boolean
          maximum_hourly_rate?: number | null
          minimum_hourly_rate?: number | null
          name?: string
          night_shift_multiplier?: number | null
          overtime_multiplier_100?: number | null
          overtime_multiplier_50?: number | null
          prefer_lower_cost?: boolean
          rating_weight?: number
          rounding_increment?: number
          skill_weight?: number
          updated_at?: string
          weekend_multiplier?: number | null
        }
        Relationships: []
      }
      shifts: {
        Row: {
          created_at: string | null
          end_time: string
          id: string
          is_night_shift: boolean
          name: string
          start_time: string
        }
        Insert: {
          created_at?: string | null
          end_time: string
          id?: string
          is_night_shift?: boolean
          name: string
          start_time: string
        }
        Update: {
          created_at?: string | null
          end_time?: string
          id?: string
          is_night_shift?: boolean
          name?: string
          start_time?: string
        }
        Relationships: []
      }
      skill_dependencies: {
        Row: {
          created_at: string
          description: string | null
          id: string
          is_hard_requirement: boolean
          min_proficiency_required: number
          required_skill_id: string
          skill_id: string
          updated_at: string
        }
        Insert: {
          created_at?: string
          description?: string | null
          id?: string
          is_hard_requirement?: boolean
          min_proficiency_required?: number
          required_skill_id: string
          skill_id: string
          updated_at?: string
        }
        Update: {
          created_at?: string
          description?: string | null
          id?: string
          is_hard_requirement?: boolean
          min_proficiency_required?: number
          required_skill_id?: string
          skill_id?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "skill_dependencies_not_self"
            columns: ["required_skill_id"]
            isOneToOne: false
            referencedRelation: "skills"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "skill_dependencies_required_skill_id_fkey"
            columns: ["required_skill_id"]
            isOneToOne: false
            referencedRelation: "skills"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "skill_dependencies_skill_id_fkey"
            columns: ["skill_id"]
            isOneToOne: false
            referencedRelation: "skills"
            referencedColumns: ["id"]
          },
        ]
      }
      skill_proficiency_levels: {
        Row: {
          can_certify: boolean
          created_at: string
          description: string
          id: string
          level: number
          min_hours_required: number | null
          skill_id: string
          title: string
          updated_at: string
        }
        Insert: {
          can_certify?: boolean
          created_at?: string
          description: string
          id?: string
          level: number
          min_hours_required?: number | null
          skill_id: string
          title: string
          updated_at?: string
        }
        Update: {
          can_certify?: boolean
          created_at?: string
          description?: string
          id?: string
          level?: number
          min_hours_required?: number | null
          skill_id?: string
          title?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "skill_proficiency_levels_skill_id_fkey"
            columns: ["skill_id"]
            isOneToOne: false
            referencedRelation: "skills"
            referencedColumns: ["id"]
          },
        ]
      }
      skills: {
        Row: {
          category: string | null
          certification_validity_months: number | null
          code: string
          created_at: string | null
          description: string | null
          display_order: number | null
          icon_name: string | null
          id: string
          is_active: boolean | null
          is_certification_required: boolean
          name: string
          parent_skill_id: string | null
          position_x: number | null
          position_y: number | null
          proficiency_description: Json | null
          skill_tree_type: Database["public"]["Enums"]["skill_tree_type"]
        }
        Insert: {
          category?: string | null
          certification_validity_months?: number | null
          code: string
          created_at?: string | null
          description?: string | null
          display_order?: number | null
          icon_name?: string | null
          id?: string
          is_active?: boolean | null
          is_certification_required?: boolean
          name: string
          parent_skill_id?: string | null
          position_x?: number | null
          position_y?: number | null
          proficiency_description?: Json | null
          skill_tree_type?: Database["public"]["Enums"]["skill_tree_type"]
        }
        Update: {
          category?: string | null
          certification_validity_months?: number | null
          code?: string
          created_at?: string | null
          description?: string | null
          display_order?: number | null
          icon_name?: string | null
          id?: string
          is_active?: boolean | null
          is_certification_required?: boolean
          name?: string
          parent_skill_id?: string | null
          position_x?: number | null
          position_y?: number | null
          proficiency_description?: Json | null
          skill_tree_type?: Database["public"]["Enums"]["skill_tree_type"]
        }
        Relationships: [
          {
            foreignKeyName: "skills_parent_skill_id_fkey"
            columns: ["parent_skill_id"]
            isOneToOne: false
            referencedRelation: "skills"
            referencedColumns: ["id"]
          },
        ]
      }
      supplier_categories: {
        Row: {
          created_at: string
          id: string
          kind: string | null
          name: string
        }
        Insert: {
          created_at?: string
          id?: string
          kind?: string | null
          name: string
        }
        Update: {
          created_at?: string
          id?: string
          kind?: string | null
          name?: string
        }
        Relationships: []
      }
      supplier_profiles: {
        Row: {
          category_ids: string[]
          certifications: Json
          created_at: string
          email: string | null
          giro: string | null
          id: string
          notes: string | null
          phone: string | null
          rut: string | null
          supplier_name: string
          updated_at: string
        }
        Insert: {
          category_ids?: string[]
          certifications?: Json
          created_at?: string
          email?: string | null
          giro?: string | null
          id?: string
          notes?: string | null
          phone?: string | null
          rut?: string | null
          supplier_name: string
          updated_at?: string
        }
        Update: {
          category_ids?: string[]
          certifications?: Json
          created_at?: string
          email?: string | null
          giro?: string | null
          id?: string
          notes?: string | null
          phone?: string | null
          rut?: string | null
          supplier_name?: string
          updated_at?: string
        }
        Relationships: []
      }
      task_logs: {
        Row: {
          created_at: string | null
          employee_id: string | null
          id: string
          job_id: string | null
          notes: string | null
          ot_id: string | null
          performance_rating: number
          task_type: Database["public"]["Enums"]["task_type"]
          time_spent_minutes: number
        }
        Insert: {
          created_at?: string | null
          employee_id?: string | null
          id?: string
          job_id?: string | null
          notes?: string | null
          ot_id?: string | null
          performance_rating?: number
          task_type: Database["public"]["Enums"]["task_type"]
          time_spent_minutes?: number
        }
        Update: {
          created_at?: string | null
          employee_id?: string | null
          id?: string
          job_id?: string | null
          notes?: string | null
          ot_id?: string | null
          performance_rating?: number
          task_type?: Database["public"]["Enums"]["task_type"]
          time_spent_minutes?: number
        }
        Relationships: [
          {
            foreignKeyName: "task_logs_employee_id_fkey"
            columns: ["employee_id"]
            isOneToOne: false
            referencedRelation: "employees"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "task_logs_employee_id_fkey"
            columns: ["employee_id"]
            isOneToOne: false
            referencedRelation: "worker_stats"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "task_logs_job_id_fkey"
            columns: ["job_id"]
            isOneToOne: false
            referencedRelation: "jobs"
            referencedColumns: ["id"]
          },
        ]
      }
      training_articles: {
        Row: {
          category: string | null
          content_md: string
          created_at: string
          created_by: string | null
          id: string
          is_published: boolean
          slug: string
          tags: Json
          title: string
          updated_at: string
          updated_by: string | null
        }
        Insert: {
          category?: string | null
          content_md: string
          created_at?: string
          created_by?: string | null
          id?: string
          is_published?: boolean
          slug: string
          tags?: Json
          title: string
          updated_at?: string
          updated_by?: string | null
        }
        Update: {
          category?: string | null
          content_md?: string
          created_at?: string
          created_by?: string | null
          id?: string
          is_published?: boolean
          slug?: string
          tags?: Json
          title?: string
          updated_at?: string
          updated_by?: string | null
        }
        Relationships: []
      }
      user_roles: {
        Row: {
          created_at: string | null
          department: string | null
          id: string
          manager_domain: string | null
          role: Database["public"]["Enums"]["app_role"]
          user_id: string
        }
        Insert: {
          created_at?: string | null
          department?: string | null
          id?: string
          manager_domain?: string | null
          role: Database["public"]["Enums"]["app_role"]
          user_id: string
        }
        Update: {
          created_at?: string | null
          department?: string | null
          id?: string
          manager_domain?: string | null
          role?: Database["public"]["Enums"]["app_role"]
          user_id?: string
        }
        Relationships: []
      }
      users: {
        Row: {
          created_at: string
          email: string
          id: string
          name: string
          updated_at: string
        }
        Insert: {
          created_at: string
          email: string
          id: string
          name: string
          updated_at: string
        }
        Update: {
          created_at?: string
          email?: string
          id?: string
          name?: string
          updated_at?: string
        }
        Relationships: []
      }
      vistos_buenos: {
        Row: {
          client_id: string | null
          client_name: string | null
          color_back: string | null
          color_front: string | null
          created_at: string
          deadline: string | null
          estimate_lines: Json | null
          finishes: Json | null
          floor_price: number
          grammage_gsm: number | null
          height_cm: number | null
          id: string
          ink_coverage: string | null
          margin_pct: number
          markup_pct: number
          notes: string | null
          ot_id: string | null
          pantone_colors: string[] | null
          pdf_url: string | null
          press_id: string | null
          priority_level: string | null
          product_name: string | null
          product_type: string | null
          quantity: number | null
          rush_surcharge_pct: number
          salesman_id: string | null
          signature_url: string | null
          signed_at: string | null
          signed_by_name: string | null
          status: Database["public"]["Enums"]["vb_status"]
          substrate_type: string | null
          subtotal_cost: number
          total_price: number
          unit_price: number
          updated_at: string
          valid_until: string | null
          width_cm: number | null
        }
        Insert: {
          client_id?: string | null
          client_name?: string | null
          color_back?: string | null
          color_front?: string | null
          created_at?: string
          deadline?: string | null
          estimate_lines?: Json | null
          finishes?: Json | null
          floor_price?: number
          grammage_gsm?: number | null
          height_cm?: number | null
          id?: string
          ink_coverage?: string | null
          margin_pct?: number
          markup_pct?: number
          notes?: string | null
          ot_id?: string | null
          pantone_colors?: string[] | null
          pdf_url?: string | null
          press_id?: string | null
          priority_level?: string | null
          product_name?: string | null
          product_type?: string | null
          quantity?: number | null
          rush_surcharge_pct?: number
          salesman_id?: string | null
          signature_url?: string | null
          signed_at?: string | null
          signed_by_name?: string | null
          status?: Database["public"]["Enums"]["vb_status"]
          substrate_type?: string | null
          subtotal_cost?: number
          total_price?: number
          unit_price?: number
          updated_at?: string
          valid_until?: string | null
          width_cm?: number | null
        }
        Update: {
          client_id?: string | null
          client_name?: string | null
          color_back?: string | null
          color_front?: string | null
          created_at?: string
          deadline?: string | null
          estimate_lines?: Json | null
          finishes?: Json | null
          floor_price?: number
          grammage_gsm?: number | null
          height_cm?: number | null
          id?: string
          ink_coverage?: string | null
          margin_pct?: number
          markup_pct?: number
          notes?: string | null
          ot_id?: string | null
          pantone_colors?: string[] | null
          pdf_url?: string | null
          press_id?: string | null
          priority_level?: string | null
          product_name?: string | null
          product_type?: string | null
          quantity?: number | null
          rush_surcharge_pct?: number
          salesman_id?: string | null
          signature_url?: string | null
          signed_at?: string | null
          signed_by_name?: string | null
          status?: Database["public"]["Enums"]["vb_status"]
          substrate_type?: string | null
          subtotal_cost?: number
          total_price?: number
          unit_price?: number
          updated_at?: string
          valid_until?: string | null
          width_cm?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "vistos_buenos_client_id_fkey"
            columns: ["client_id"]
            isOneToOne: false
            referencedRelation: "clients"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "vistos_buenos_ot_id_fkey"
            columns: ["ot_id"]
            isOneToOne: false
            referencedRelation: "ot_certificacion"
            referencedColumns: ["ot_id"]
          },
          {
            foreignKeyName: "vistos_buenos_ot_id_fkey"
            columns: ["ot_id"]
            isOneToOne: false
            referencedRelation: "ot_compras_estado"
            referencedColumns: ["ot_id"]
          },
          {
            foreignKeyName: "vistos_buenos_ot_id_fkey"
            columns: ["ot_id"]
            isOneToOne: false
            referencedRelation: "ot_cost_summary"
            referencedColumns: ["ot_id"]
          },
          {
            foreignKeyName: "vistos_buenos_ot_id_fkey"
            columns: ["ot_id"]
            isOneToOne: false
            referencedRelation: "ot_fulfillment"
            referencedColumns: ["ot_id"]
          },
          {
            foreignKeyName: "vistos_buenos_ot_id_fkey"
            columns: ["ot_id"]
            isOneToOne: false
            referencedRelation: "ots"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "vistos_buenos_press_id_fkey"
            columns: ["press_id"]
            isOneToOne: false
            referencedRelation: "machines"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "vistos_buenos_press_id_fkey"
            columns: ["press_id"]
            isOneToOne: false
            referencedRelation: "planta_live"
            referencedColumns: ["machine_id"]
          },
          {
            foreignKeyName: "vistos_buenos_press_id_fkey"
            columns: ["press_id"]
            isOneToOne: false
            referencedRelation: "planta_live"
            referencedColumns: ["workstation_id"]
          },
          {
            foreignKeyName: "vistos_buenos_salesman_id_fkey"
            columns: ["salesman_id"]
            isOneToOne: false
            referencedRelation: "employees"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "vistos_buenos_salesman_id_fkey"
            columns: ["salesman_id"]
            isOneToOne: false
            referencedRelation: "worker_stats"
            referencedColumns: ["id"]
          },
        ]
      }
      week_plan_snapshot_lines: {
        Row: {
          client_name: string | null
          color_back: string | null
          color_front: string | null
          created_at: string
          flag_ord: boolean
          flag_paper_arrived: boolean
          flag_plan: boolean
          flag_pro: boolean
          flag_vbp: boolean
          hours_planned: number | null
          id: string
          machine_id: string | null
          notes: string | null
          ot_id: string | null
          ot_number: string | null
          product_label: string | null
          quantity: number | null
          scheduled_date: string
          scheduled_end: string | null
          scheduled_start: string | null
          slot_id: string | null
          snapshot_id: string
          sort_order: number
        }
        Insert: {
          client_name?: string | null
          color_back?: string | null
          color_front?: string | null
          created_at?: string
          flag_ord?: boolean
          flag_paper_arrived?: boolean
          flag_plan?: boolean
          flag_pro?: boolean
          flag_vbp?: boolean
          hours_planned?: number | null
          id?: string
          machine_id?: string | null
          notes?: string | null
          ot_id?: string | null
          ot_number?: string | null
          product_label?: string | null
          quantity?: number | null
          scheduled_date: string
          scheduled_end?: string | null
          scheduled_start?: string | null
          slot_id?: string | null
          snapshot_id: string
          sort_order?: number
        }
        Update: {
          client_name?: string | null
          color_back?: string | null
          color_front?: string | null
          created_at?: string
          flag_ord?: boolean
          flag_paper_arrived?: boolean
          flag_plan?: boolean
          flag_pro?: boolean
          flag_vbp?: boolean
          hours_planned?: number | null
          id?: string
          machine_id?: string | null
          notes?: string | null
          ot_id?: string | null
          ot_number?: string | null
          product_label?: string | null
          quantity?: number | null
          scheduled_date?: string
          scheduled_end?: string | null
          scheduled_start?: string | null
          slot_id?: string | null
          snapshot_id?: string
          sort_order?: number
        }
        Relationships: [
          {
            foreignKeyName: "week_plan_snapshot_lines_machine_id_fkey"
            columns: ["machine_id"]
            isOneToOne: false
            referencedRelation: "machines"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "week_plan_snapshot_lines_machine_id_fkey"
            columns: ["machine_id"]
            isOneToOne: false
            referencedRelation: "planta_live"
            referencedColumns: ["machine_id"]
          },
          {
            foreignKeyName: "week_plan_snapshot_lines_machine_id_fkey"
            columns: ["machine_id"]
            isOneToOne: false
            referencedRelation: "planta_live"
            referencedColumns: ["workstation_id"]
          },
          {
            foreignKeyName: "week_plan_snapshot_lines_ot_id_fkey"
            columns: ["ot_id"]
            isOneToOne: false
            referencedRelation: "ot_certificacion"
            referencedColumns: ["ot_id"]
          },
          {
            foreignKeyName: "week_plan_snapshot_lines_ot_id_fkey"
            columns: ["ot_id"]
            isOneToOne: false
            referencedRelation: "ot_compras_estado"
            referencedColumns: ["ot_id"]
          },
          {
            foreignKeyName: "week_plan_snapshot_lines_ot_id_fkey"
            columns: ["ot_id"]
            isOneToOne: false
            referencedRelation: "ot_cost_summary"
            referencedColumns: ["ot_id"]
          },
          {
            foreignKeyName: "week_plan_snapshot_lines_ot_id_fkey"
            columns: ["ot_id"]
            isOneToOne: false
            referencedRelation: "ot_fulfillment"
            referencedColumns: ["ot_id"]
          },
          {
            foreignKeyName: "week_plan_snapshot_lines_ot_id_fkey"
            columns: ["ot_id"]
            isOneToOne: false
            referencedRelation: "ots"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "week_plan_snapshot_lines_slot_id_fkey"
            columns: ["slot_id"]
            isOneToOne: false
            referencedRelation: "ot_machine_schedule"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "week_plan_snapshot_lines_snapshot_id_fkey"
            columns: ["snapshot_id"]
            isOneToOne: false
            referencedRelation: "week_plan_snapshots"
            referencedColumns: ["id"]
          },
        ]
      }
      week_plan_snapshots: {
        Row: {
          created_at: string
          created_by: string | null
          id: string
          notes: string | null
          published_at: string | null
          published_by: string | null
          status: string
          version: number
          week_end: string
          week_start: string
        }
        Insert: {
          created_at?: string
          created_by?: string | null
          id?: string
          notes?: string | null
          published_at?: string | null
          published_by?: string | null
          status?: string
          version: number
          week_end: string
          week_start: string
        }
        Update: {
          created_at?: string
          created_by?: string | null
          id?: string
          notes?: string | null
          published_at?: string | null
          published_by?: string | null
          status?: string
          version?: number
          week_end?: string
          week_start?: string
        }
        Relationships: []
      }
      whatsapp_production_logs: {
        Row: {
          corrected_costs: Json | null
          corrected_data: Json | null
          created_at: string
          elapsed_minutes: number | null
          fed_to_system: boolean
          id: string
          inferred_costs: Json | null
          message_timestamp: string
          message_type: Database["public"]["Enums"]["whatsapp_message_type"]
          operator_employee_id: string | null
          operator_name: string | null
          operator_phone: string
          ot_id: string | null
          ot_number: string
          parsed_data: Json | null
          raw_message: string
          review_comments: string | null
          review_status: Database["public"]["Enums"]["whatsapp_review_status"]
          reviewed_at: string | null
          reviewed_by: string | null
          start_log_id: string | null
          updated_at: string
        }
        Insert: {
          corrected_costs?: Json | null
          corrected_data?: Json | null
          created_at?: string
          elapsed_minutes?: number | null
          fed_to_system?: boolean
          id?: string
          inferred_costs?: Json | null
          message_timestamp?: string
          message_type?: Database["public"]["Enums"]["whatsapp_message_type"]
          operator_employee_id?: string | null
          operator_name?: string | null
          operator_phone: string
          ot_id?: string | null
          ot_number: string
          parsed_data?: Json | null
          raw_message: string
          review_comments?: string | null
          review_status?: Database["public"]["Enums"]["whatsapp_review_status"]
          reviewed_at?: string | null
          reviewed_by?: string | null
          start_log_id?: string | null
          updated_at?: string
        }
        Update: {
          corrected_costs?: Json | null
          corrected_data?: Json | null
          created_at?: string
          elapsed_minutes?: number | null
          fed_to_system?: boolean
          id?: string
          inferred_costs?: Json | null
          message_timestamp?: string
          message_type?: Database["public"]["Enums"]["whatsapp_message_type"]
          operator_employee_id?: string | null
          operator_name?: string | null
          operator_phone?: string
          ot_id?: string | null
          ot_number?: string
          parsed_data?: Json | null
          raw_message?: string
          review_comments?: string | null
          review_status?: Database["public"]["Enums"]["whatsapp_review_status"]
          reviewed_at?: string | null
          reviewed_by?: string | null
          start_log_id?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "whatsapp_production_logs_operator_employee_id_fkey"
            columns: ["operator_employee_id"]
            isOneToOne: false
            referencedRelation: "employees"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "whatsapp_production_logs_operator_employee_id_fkey"
            columns: ["operator_employee_id"]
            isOneToOne: false
            referencedRelation: "worker_stats"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "whatsapp_production_logs_ot_id_fkey"
            columns: ["ot_id"]
            isOneToOne: false
            referencedRelation: "ot_certificacion"
            referencedColumns: ["ot_id"]
          },
          {
            foreignKeyName: "whatsapp_production_logs_ot_id_fkey"
            columns: ["ot_id"]
            isOneToOne: false
            referencedRelation: "ot_compras_estado"
            referencedColumns: ["ot_id"]
          },
          {
            foreignKeyName: "whatsapp_production_logs_ot_id_fkey"
            columns: ["ot_id"]
            isOneToOne: false
            referencedRelation: "ot_cost_summary"
            referencedColumns: ["ot_id"]
          },
          {
            foreignKeyName: "whatsapp_production_logs_ot_id_fkey"
            columns: ["ot_id"]
            isOneToOne: false
            referencedRelation: "ot_fulfillment"
            referencedColumns: ["ot_id"]
          },
          {
            foreignKeyName: "whatsapp_production_logs_ot_id_fkey"
            columns: ["ot_id"]
            isOneToOne: false
            referencedRelation: "ots"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "whatsapp_production_logs_start_log_id_fkey"
            columns: ["start_log_id"]
            isOneToOne: false
            referencedRelation: "whatsapp_active_sessions"
            referencedColumns: ["start_id"]
          },
          {
            foreignKeyName: "whatsapp_production_logs_start_log_id_fkey"
            columns: ["start_log_id"]
            isOneToOne: false
            referencedRelation: "whatsapp_pending_reviews"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "whatsapp_production_logs_start_log_id_fkey"
            columns: ["start_log_id"]
            isOneToOne: false
            referencedRelation: "whatsapp_production_logs"
            referencedColumns: ["id"]
          },
        ]
      }
      whatsapp_warehouse_logs: {
        Row: {
          action_type: Database["public"]["Enums"]["warehouse_action_type"]
          corrected_quantity: number | null
          corrected_unit_cost: number | null
          created_at: string
          fed_to_inventory: boolean
          id: string
          inventory_tx_id: string | null
          item_id: string | null
          item_name: string | null
          item_sku: string | null
          lot_id: string | null
          message_timestamp: string
          operator_employee_id: string | null
          operator_name: string | null
          operator_phone: string
          ot_id: string | null
          ot_number: string | null
          parsed_data: Json | null
          quantity: number | null
          raw_message: string
          review_comments: string | null
          review_status: Database["public"]["Enums"]["warehouse_review_status"]
          reviewed_at: string | null
          reviewed_by: string | null
          scanned_value: string
          supplier_name: string | null
          unit: string | null
          unit_cost: number | null
          updated_at: string
        }
        Insert: {
          action_type?: Database["public"]["Enums"]["warehouse_action_type"]
          corrected_quantity?: number | null
          corrected_unit_cost?: number | null
          created_at?: string
          fed_to_inventory?: boolean
          id?: string
          inventory_tx_id?: string | null
          item_id?: string | null
          item_name?: string | null
          item_sku?: string | null
          lot_id?: string | null
          message_timestamp?: string
          operator_employee_id?: string | null
          operator_name?: string | null
          operator_phone: string
          ot_id?: string | null
          ot_number?: string | null
          parsed_data?: Json | null
          quantity?: number | null
          raw_message: string
          review_comments?: string | null
          review_status?: Database["public"]["Enums"]["warehouse_review_status"]
          reviewed_at?: string | null
          reviewed_by?: string | null
          scanned_value?: string
          supplier_name?: string | null
          unit?: string | null
          unit_cost?: number | null
          updated_at?: string
        }
        Update: {
          action_type?: Database["public"]["Enums"]["warehouse_action_type"]
          corrected_quantity?: number | null
          corrected_unit_cost?: number | null
          created_at?: string
          fed_to_inventory?: boolean
          id?: string
          inventory_tx_id?: string | null
          item_id?: string | null
          item_name?: string | null
          item_sku?: string | null
          lot_id?: string | null
          message_timestamp?: string
          operator_employee_id?: string | null
          operator_name?: string | null
          operator_phone?: string
          ot_id?: string | null
          ot_number?: string | null
          parsed_data?: Json | null
          quantity?: number | null
          raw_message?: string
          review_comments?: string | null
          review_status?: Database["public"]["Enums"]["warehouse_review_status"]
          reviewed_at?: string | null
          reviewed_by?: string | null
          scanned_value?: string
          supplier_name?: string | null
          unit?: string | null
          unit_cost?: number | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "whatsapp_warehouse_logs_inventory_tx_id_fkey"
            columns: ["inventory_tx_id"]
            isOneToOne: false
            referencedRelation: "inventory_stock_transactions"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "whatsapp_warehouse_logs_inventory_tx_id_fkey"
            columns: ["inventory_tx_id"]
            isOneToOne: false
            referencedRelation: "inventory_stock_transactions_v"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "whatsapp_warehouse_logs_item_id_fkey"
            columns: ["item_id"]
            isOneToOne: false
            referencedRelation: "inventory_items"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "whatsapp_warehouse_logs_item_id_fkey"
            columns: ["item_id"]
            isOneToOne: false
            referencedRelation: "inventory_items_stock_v"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "whatsapp_warehouse_logs_item_id_fkey"
            columns: ["item_id"]
            isOneToOne: false
            referencedRelation: "inventory_low_stock_alerts_v"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "whatsapp_warehouse_logs_item_id_fkey"
            columns: ["item_id"]
            isOneToOne: false
            referencedRelation: "material_cost_v"
            referencedColumns: ["item_id"]
          },
          {
            foreignKeyName: "whatsapp_warehouse_logs_lot_id_fkey"
            columns: ["lot_id"]
            isOneToOne: false
            referencedRelation: "inventory_lots"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "whatsapp_warehouse_logs_operator_employee_id_fkey"
            columns: ["operator_employee_id"]
            isOneToOne: false
            referencedRelation: "employees"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "whatsapp_warehouse_logs_operator_employee_id_fkey"
            columns: ["operator_employee_id"]
            isOneToOne: false
            referencedRelation: "worker_stats"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "whatsapp_warehouse_logs_ot_id_fkey"
            columns: ["ot_id"]
            isOneToOne: false
            referencedRelation: "ot_certificacion"
            referencedColumns: ["ot_id"]
          },
          {
            foreignKeyName: "whatsapp_warehouse_logs_ot_id_fkey"
            columns: ["ot_id"]
            isOneToOne: false
            referencedRelation: "ot_compras_estado"
            referencedColumns: ["ot_id"]
          },
          {
            foreignKeyName: "whatsapp_warehouse_logs_ot_id_fkey"
            columns: ["ot_id"]
            isOneToOne: false
            referencedRelation: "ot_cost_summary"
            referencedColumns: ["ot_id"]
          },
          {
            foreignKeyName: "whatsapp_warehouse_logs_ot_id_fkey"
            columns: ["ot_id"]
            isOneToOne: false
            referencedRelation: "ot_fulfillment"
            referencedColumns: ["ot_id"]
          },
          {
            foreignKeyName: "whatsapp_warehouse_logs_ot_id_fkey"
            columns: ["ot_id"]
            isOneToOne: false
            referencedRelation: "ots"
            referencedColumns: ["id"]
          },
        ]
      }
      worker_assignments: {
        Row: {
          created_at: string | null
          date: string
          employee_id: string
          hours_worked: number
          id: string
          machine_id: string
          ot_id: string | null
          role: string
          shift_id: string
          updated_at: string | null
        }
        Insert: {
          created_at?: string | null
          date?: string
          employee_id: string
          hours_worked?: number
          id?: string
          machine_id: string
          ot_id?: string | null
          role: string
          shift_id: string
          updated_at?: string | null
        }
        Update: {
          created_at?: string | null
          date?: string
          employee_id?: string
          hours_worked?: number
          id?: string
          machine_id?: string
          ot_id?: string | null
          role?: string
          shift_id?: string
          updated_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "worker_assignments_employee_id_fkey"
            columns: ["employee_id"]
            isOneToOne: false
            referencedRelation: "employees"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "worker_assignments_employee_id_fkey"
            columns: ["employee_id"]
            isOneToOne: false
            referencedRelation: "worker_stats"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "worker_assignments_machine_id_fkey"
            columns: ["machine_id"]
            isOneToOne: false
            referencedRelation: "machines"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "worker_assignments_machine_id_fkey"
            columns: ["machine_id"]
            isOneToOne: false
            referencedRelation: "planta_live"
            referencedColumns: ["machine_id"]
          },
          {
            foreignKeyName: "worker_assignments_machine_id_fkey"
            columns: ["machine_id"]
            isOneToOne: false
            referencedRelation: "planta_live"
            referencedColumns: ["workstation_id"]
          },
          {
            foreignKeyName: "worker_assignments_ot_id_fkey"
            columns: ["ot_id"]
            isOneToOne: false
            referencedRelation: "ot_certificacion"
            referencedColumns: ["ot_id"]
          },
          {
            foreignKeyName: "worker_assignments_ot_id_fkey"
            columns: ["ot_id"]
            isOneToOne: false
            referencedRelation: "ot_compras_estado"
            referencedColumns: ["ot_id"]
          },
          {
            foreignKeyName: "worker_assignments_ot_id_fkey"
            columns: ["ot_id"]
            isOneToOne: false
            referencedRelation: "ot_cost_summary"
            referencedColumns: ["ot_id"]
          },
          {
            foreignKeyName: "worker_assignments_ot_id_fkey"
            columns: ["ot_id"]
            isOneToOne: false
            referencedRelation: "ot_fulfillment"
            referencedColumns: ["ot_id"]
          },
          {
            foreignKeyName: "worker_assignments_ot_id_fkey"
            columns: ["ot_id"]
            isOneToOne: false
            referencedRelation: "ots"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "worker_assignments_shift_id_fkey"
            columns: ["shift_id"]
            isOneToOne: false
            referencedRelation: "shifts"
            referencedColumns: ["id"]
          },
        ]
      }
    }
    Views: {
      capture_feed: {
        Row: {
          applied: boolean | null
          channel: Database["public"]["Enums"]["capture_channel"] | null
          created_at: string | null
          domain: Database["public"]["Enums"]["capture_domain"] | null
          event_type: string | null
          id: string | null
          item_id: string | null
          message_timestamp: string | null
          operator_name: string | null
          operator_phone: string | null
          ot_id: string | null
          ot_number: string | null
          quantity: number | null
          raw_message: string | null
          reviewed_at: string | null
          reviewed_by: string | null
          status: Database["public"]["Enums"]["capture_status"] | null
          unit: string | null
          unit_cost: number | null
        }
        Insert: {
          applied?: boolean | null
          channel?: Database["public"]["Enums"]["capture_channel"] | null
          created_at?: string | null
          domain?: Database["public"]["Enums"]["capture_domain"] | null
          event_type?: string | null
          id?: string | null
          item_id?: string | null
          message_timestamp?: string | null
          operator_name?: string | null
          operator_phone?: string | null
          ot_id?: string | null
          ot_number?: string | null
          quantity?: number | null
          raw_message?: string | null
          reviewed_at?: string | null
          reviewed_by?: string | null
          status?: Database["public"]["Enums"]["capture_status"] | null
          unit?: string | null
          unit_cost?: number | null
        }
        Update: {
          applied?: boolean | null
          channel?: Database["public"]["Enums"]["capture_channel"] | null
          created_at?: string | null
          domain?: Database["public"]["Enums"]["capture_domain"] | null
          event_type?: string | null
          id?: string | null
          item_id?: string | null
          message_timestamp?: string | null
          operator_name?: string | null
          operator_phone?: string | null
          ot_id?: string | null
          ot_number?: string | null
          quantity?: number | null
          raw_message?: string | null
          reviewed_at?: string | null
          reviewed_by?: string | null
          status?: Database["public"]["Enums"]["capture_status"] | null
          unit?: string | null
          unit_cost?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "capture_events_item_id_fkey"
            columns: ["item_id"]
            isOneToOne: false
            referencedRelation: "inventory_items"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "capture_events_item_id_fkey"
            columns: ["item_id"]
            isOneToOne: false
            referencedRelation: "inventory_items_stock_v"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "capture_events_item_id_fkey"
            columns: ["item_id"]
            isOneToOne: false
            referencedRelation: "inventory_low_stock_alerts_v"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "capture_events_item_id_fkey"
            columns: ["item_id"]
            isOneToOne: false
            referencedRelation: "material_cost_v"
            referencedColumns: ["item_id"]
          },
          {
            foreignKeyName: "capture_events_ot_id_fkey"
            columns: ["ot_id"]
            isOneToOne: false
            referencedRelation: "ot_certificacion"
            referencedColumns: ["ot_id"]
          },
          {
            foreignKeyName: "capture_events_ot_id_fkey"
            columns: ["ot_id"]
            isOneToOne: false
            referencedRelation: "ot_compras_estado"
            referencedColumns: ["ot_id"]
          },
          {
            foreignKeyName: "capture_events_ot_id_fkey"
            columns: ["ot_id"]
            isOneToOne: false
            referencedRelation: "ot_cost_summary"
            referencedColumns: ["ot_id"]
          },
          {
            foreignKeyName: "capture_events_ot_id_fkey"
            columns: ["ot_id"]
            isOneToOne: false
            referencedRelation: "ot_fulfillment"
            referencedColumns: ["ot_id"]
          },
          {
            foreignKeyName: "capture_events_ot_id_fkey"
            columns: ["ot_id"]
            isOneToOne: false
            referencedRelation: "ots"
            referencedColumns: ["id"]
          },
        ]
      }
      inventory_items_stock_v: {
        Row: {
          barcode_value: string | null
          category:
            | Database["public"]["Enums"]["inventory_item_category"]
            | null
          created_at: string | null
          current_stock: number | null
          estimated_unit_cost: number | null
          id: string | null
          is_active: boolean | null
          is_certification_required: boolean | null
          min_stock: number | null
          name: string | null
          notes: string | null
          qr_value: string | null
          sku: string | null
          unit: string | null
          updated_at: string | null
          weighted_unit_cost: number | null
        }
        Relationships: []
      }
      inventory_low_stock_alerts_v: {
        Row: {
          category:
            | Database["public"]["Enums"]["inventory_item_category"]
            | null
          current_stock: number | null
          id: string | null
          min_stock: number | null
          name: string | null
          severity: string | null
          shortage: number | null
          sku: string | null
          unit: string | null
          weighted_unit_cost: number | null
        }
        Relationships: []
      }
      inventory_stock_transactions_v: {
        Row: {
          category:
            | Database["public"]["Enums"]["inventory_item_category"]
            | null
          certification_code: string | null
          certification_expires_on: string | null
          client_name: string | null
          created_at: string | null
          created_by: string | null
          estimated_total_cost: number | null
          id: string | null
          item_id: string | null
          item_name: string | null
          lot_id: string | null
          lot_number: string | null
          notes: string | null
          ot_number: string | null
          quantity: number | null
          reference_code: string | null
          sku: string | null
          tx_type: Database["public"]["Enums"]["inventory_tx_type"] | null
          unit: string | null
          unit_cost: number | null
          work_order_id: string | null
        }
        Relationships: [
          {
            foreignKeyName: "inventory_stock_transactions_item_id_fkey"
            columns: ["item_id"]
            isOneToOne: false
            referencedRelation: "inventory_items"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "inventory_stock_transactions_item_id_fkey"
            columns: ["item_id"]
            isOneToOne: false
            referencedRelation: "inventory_items_stock_v"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "inventory_stock_transactions_item_id_fkey"
            columns: ["item_id"]
            isOneToOne: false
            referencedRelation: "inventory_low_stock_alerts_v"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "inventory_stock_transactions_item_id_fkey"
            columns: ["item_id"]
            isOneToOne: false
            referencedRelation: "material_cost_v"
            referencedColumns: ["item_id"]
          },
          {
            foreignKeyName: "inventory_stock_transactions_lot_id_fkey"
            columns: ["lot_id"]
            isOneToOne: false
            referencedRelation: "inventory_lots"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "inventory_stock_transactions_work_order_id_fkey"
            columns: ["work_order_id"]
            isOneToOne: false
            referencedRelation: "ot_certificacion"
            referencedColumns: ["ot_id"]
          },
          {
            foreignKeyName: "inventory_stock_transactions_work_order_id_fkey"
            columns: ["work_order_id"]
            isOneToOne: false
            referencedRelation: "ot_compras_estado"
            referencedColumns: ["ot_id"]
          },
          {
            foreignKeyName: "inventory_stock_transactions_work_order_id_fkey"
            columns: ["work_order_id"]
            isOneToOne: false
            referencedRelation: "ot_cost_summary"
            referencedColumns: ["ot_id"]
          },
          {
            foreignKeyName: "inventory_stock_transactions_work_order_id_fkey"
            columns: ["work_order_id"]
            isOneToOne: false
            referencedRelation: "ot_fulfillment"
            referencedColumns: ["ot_id"]
          },
          {
            foreignKeyName: "inventory_stock_transactions_work_order_id_fkey"
            columns: ["work_order_id"]
            isOneToOne: false
            referencedRelation: "ots"
            referencedColumns: ["id"]
          },
        ]
      }
      machine_parts_health_v: {
        Row: {
          criticality: string | null
          expected_life_usage: number | null
          id: string | null
          inventory_item_id: string | null
          is_imported: boolean | null
          last_replaced_usage: number | null
          lead_time_days: number | null
          life_used_pct: number | null
          machine_id: string | null
          machine_name: string | null
          min_stock: number | null
          name: string | null
          part_number: string | null
          preferred_supplier: string | null
          system_code: string | null
          system_name: string | null
          usage_counter: number | null
          usage_since_replacement: number | null
          usage_unit: Database["public"]["Enums"]["machine_usage_unit"] | null
        }
        Relationships: [
          {
            foreignKeyName: "machine_parts_inventory_item_id_fkey"
            columns: ["inventory_item_id"]
            isOneToOne: false
            referencedRelation: "inventory_items"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "machine_parts_inventory_item_id_fkey"
            columns: ["inventory_item_id"]
            isOneToOne: false
            referencedRelation: "inventory_items_stock_v"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "machine_parts_inventory_item_id_fkey"
            columns: ["inventory_item_id"]
            isOneToOne: false
            referencedRelation: "inventory_low_stock_alerts_v"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "machine_parts_inventory_item_id_fkey"
            columns: ["inventory_item_id"]
            isOneToOne: false
            referencedRelation: "material_cost_v"
            referencedColumns: ["item_id"]
          },
          {
            foreignKeyName: "machine_parts_machine_id_fkey"
            columns: ["machine_id"]
            isOneToOne: false
            referencedRelation: "machines"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "machine_parts_machine_id_fkey"
            columns: ["machine_id"]
            isOneToOne: false
            referencedRelation: "planta_live"
            referencedColumns: ["machine_id"]
          },
          {
            foreignKeyName: "machine_parts_machine_id_fkey"
            columns: ["machine_id"]
            isOneToOne: false
            referencedRelation: "planta_live"
            referencedColumns: ["workstation_id"]
          },
        ]
      }
      machine_parts_on_order_v: {
        Row: {
          expected_date: string | null
          oc_number: string | null
          part_id: string | null
          purchase_date: string | null
          purchase_id: string | null
          quantity: number | null
          status: Database["public"]["Enums"]["oc_status"] | null
          supplier: string | null
          unit_cost: number | null
        }
        Relationships: [
          {
            foreignKeyName: "purchase_items_machine_part_id_fkey"
            columns: ["part_id"]
            isOneToOne: false
            referencedRelation: "machine_parts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "purchase_items_machine_part_id_fkey"
            columns: ["part_id"]
            isOneToOne: false
            referencedRelation: "machine_parts_health_v"
            referencedColumns: ["id"]
          },
        ]
      }
      machine_usage_rate_v: {
        Row: {
          desde: string | null
          dias_periodo: number | null
          hasta: string | null
          lecturas: number | null
          machine_id: string | null
          uso_periodo: number | null
          uso_por_dia: number | null
        }
        Relationships: [
          {
            foreignKeyName: "machine_usage_readings_machine_id_fkey"
            columns: ["machine_id"]
            isOneToOne: false
            referencedRelation: "machines"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "machine_usage_readings_machine_id_fkey"
            columns: ["machine_id"]
            isOneToOne: false
            referencedRelation: "planta_live"
            referencedColumns: ["machine_id"]
          },
          {
            foreignKeyName: "machine_usage_readings_machine_id_fkey"
            columns: ["machine_id"]
            isOneToOne: false
            referencedRelation: "planta_live"
            referencedColumns: ["workstation_id"]
          },
        ]
      }
      material_cost_v: {
        Row: {
          category: string | null
          estimated_unit_cost: number | null
          grammage_gsm: number | null
          item_id: string | null
          latest_cost: number | null
          latest_received: string | null
          lot_count: number | null
          name: string | null
          sheet_height_cm: number | null
          sheet_width_cm: number | null
          sheets_per_package: number | null
          sku: string | null
          total_received: number | null
          unit: string | null
          weighted_cost: number | null
        }
        Relationships: []
      }
      oc_billing: {
        Row: {
          created_at: string | null
          expected_date: string | null
          id: string | null
          invoice_count: number | null
          invoiced_total: number | null
          matched_count: number | null
          notes: string | null
          oc_number: string | null
          ot_id: string | null
          ot_number: string | null
          purchase_date: string | null
          status: Database["public"]["Enums"]["oc_status"] | null
          supplier: string | null
          supplier_rut: string | null
          total_cost: number | null
          variance: number | null
        }
        Relationships: [
          {
            foreignKeyName: "purchases_ot_id_fkey"
            columns: ["ot_id"]
            isOneToOne: false
            referencedRelation: "ot_certificacion"
            referencedColumns: ["ot_id"]
          },
          {
            foreignKeyName: "purchases_ot_id_fkey"
            columns: ["ot_id"]
            isOneToOne: false
            referencedRelation: "ot_compras_estado"
            referencedColumns: ["ot_id"]
          },
          {
            foreignKeyName: "purchases_ot_id_fkey"
            columns: ["ot_id"]
            isOneToOne: false
            referencedRelation: "ot_cost_summary"
            referencedColumns: ["ot_id"]
          },
          {
            foreignKeyName: "purchases_ot_id_fkey"
            columns: ["ot_id"]
            isOneToOne: false
            referencedRelation: "ot_fulfillment"
            referencedColumns: ["ot_id"]
          },
          {
            foreignKeyName: "purchases_ot_id_fkey"
            columns: ["ot_id"]
            isOneToOne: false
            referencedRelation: "ots"
            referencedColumns: ["id"]
          },
        ]
      }
      oc_conciliacion: {
        Row: {
          brecha_facturacion: number | null
          brecha_recepcion: number | null
          certificados_vencidos: number | null
          created_at: string | null
          expected_date: string | null
          facturado: number | null
          id: string | null
          invoice_count: number | null
          invoiced_total: number | null
          issued_at: string | null
          lotes: number | null
          matched_count: number | null
          notes: string | null
          oc_number: string | null
          ot_id: string | null
          ot_number: string | null
          pedido: number | null
          purchase_date: string | null
          recibido: number | null
          status: Database["public"]["Enums"]["oc_status"] | null
          supplier: string | null
          supplier_rut: string | null
          total_cost: number | null
          variance: number | null
        }
        Relationships: [
          {
            foreignKeyName: "purchases_ot_id_fkey"
            columns: ["ot_id"]
            isOneToOne: false
            referencedRelation: "ot_certificacion"
            referencedColumns: ["ot_id"]
          },
          {
            foreignKeyName: "purchases_ot_id_fkey"
            columns: ["ot_id"]
            isOneToOne: false
            referencedRelation: "ot_compras_estado"
            referencedColumns: ["ot_id"]
          },
          {
            foreignKeyName: "purchases_ot_id_fkey"
            columns: ["ot_id"]
            isOneToOne: false
            referencedRelation: "ot_cost_summary"
            referencedColumns: ["ot_id"]
          },
          {
            foreignKeyName: "purchases_ot_id_fkey"
            columns: ["ot_id"]
            isOneToOne: false
            referencedRelation: "ot_fulfillment"
            referencedColumns: ["ot_id"]
          },
          {
            foreignKeyName: "purchases_ot_id_fkey"
            columns: ["ot_id"]
            isOneToOne: false
            referencedRelation: "ots"
            referencedColumns: ["id"]
          },
        ]
      }
      ot_certificacion: {
        Row: {
          client_name: string | null
          lotes_con_desviacion: number | null
          lotes_consumidos: number | null
          lotes_sin_certificado: number | null
          lotes_vencidos_al_usar: number | null
          ot_id: string | null
          ot_number: string | null
          veredicto: string | null
        }
        Relationships: []
      }
      ot_compras_estado: {
        Row: {
          estado: string | null
          ot_id: string | null
          ot_number: string | null
          pendientes: number | null
          por_comprar: number | null
          por_sacar: number | null
          por_tercerizar: number | null
          requisitos: number | null
          resueltos: number | null
          status: Database["public"]["Enums"]["ot_status"] | null
        }
        Relationships: []
      }
      ot_cost_summary: {
        Row: {
          actual_cost: number | null
          client_name: string | null
          estimated_cost: number | null
          gross_margin: number | null
          labor_actual: number | null
          machine_actual: number | null
          material_actual: number | null
          ot_id: string | null
          ot_number: string | null
          other_actual: number | null
          revenue: number | null
        }
        Relationships: []
      }
      ot_fulfillment: {
        Row: {
          client_name: string | null
          dispatched_pct: number | null
          dispatched_qty: number | null
          guide_count: number | null
          invoiced_total: number | null
          ordered_qty: number | null
          ot_id: string | null
          ot_number: string | null
          paid_total: number | null
          quoted_price: number | null
          status: Database["public"]["Enums"]["ot_status"] | null
        }
        Relationships: []
      }
      planta_live: {
        Row: {
          active_ot: Json | null
          brand: string | null
          colors: number | null
          created_at: string | null
          critical_supply_alerts: number | null
          energy_cost_per_hr: number | null
          location: string | null
          machine_id: string | null
          machine_name: string | null
          machine_status: Database["public"]["Enums"]["machine_status"] | null
          machine_type: Database["public"]["Enums"]["machine_type"] | null
          max_workers: number | null
          model: string | null
          nominal_speed_sheets_hr: number | null
          optimal_speed_sheets_hr: number | null
          photo_url: string | null
          power_kw: number | null
          updated_at: string | null
          workers_assigned: Json | null
          workers_today: number | null
          workstation_id: string | null
          workstation_name: string | null
          workstation_status:
            | Database["public"]["Enums"]["machine_status"]
            | null
          workstation_type: Database["public"]["Enums"]["machine_type"] | null
        }
        Insert: {
          active_ot?: never
          brand?: string | null
          colors?: number | null
          created_at?: string | null
          critical_supply_alerts?: never
          energy_cost_per_hr?: number | null
          location?: string | null
          machine_id?: string | null
          machine_name?: string | null
          machine_status?: Database["public"]["Enums"]["machine_status"] | null
          machine_type?: Database["public"]["Enums"]["machine_type"] | null
          max_workers?: number | null
          model?: string | null
          nominal_speed_sheets_hr?: number | null
          optimal_speed_sheets_hr?: number | null
          photo_url?: string | null
          power_kw?: number | null
          updated_at?: string | null
          workers_assigned?: never
          workers_today?: never
          workstation_id?: string | null
          workstation_name?: string | null
          workstation_status?:
            | Database["public"]["Enums"]["machine_status"]
            | null
          workstation_type?: Database["public"]["Enums"]["machine_type"] | null
        }
        Update: {
          active_ot?: never
          brand?: string | null
          colors?: number | null
          created_at?: string | null
          critical_supply_alerts?: never
          energy_cost_per_hr?: number | null
          location?: string | null
          machine_id?: string | null
          machine_name?: string | null
          machine_status?: Database["public"]["Enums"]["machine_status"] | null
          machine_type?: Database["public"]["Enums"]["machine_type"] | null
          max_workers?: number | null
          model?: string | null
          nominal_speed_sheets_hr?: number | null
          optimal_speed_sheets_hr?: number | null
          photo_url?: string | null
          power_kw?: number | null
          updated_at?: string | null
          workers_assigned?: never
          workers_today?: never
          workstation_id?: string | null
          workstation_name?: string | null
          workstation_status?:
            | Database["public"]["Enums"]["machine_status"]
            | null
          workstation_type?: Database["public"]["Enums"]["machine_type"] | null
        }
        Relationships: []
      }
      whatsapp_active_sessions: {
        Row: {
          minutes_elapsed: number | null
          operator_employee_id: string | null
          operator_name: string | null
          operator_phone: string | null
          ot_id: string | null
          ot_number: string | null
          start_id: string | null
          started_at: string | null
        }
        Insert: {
          minutes_elapsed?: never
          operator_employee_id?: string | null
          operator_name?: string | null
          operator_phone?: string | null
          ot_id?: string | null
          ot_number?: string | null
          start_id?: string | null
          started_at?: string | null
        }
        Update: {
          minutes_elapsed?: never
          operator_employee_id?: string | null
          operator_name?: string | null
          operator_phone?: string | null
          ot_id?: string | null
          ot_number?: string | null
          start_id?: string | null
          started_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "whatsapp_production_logs_operator_employee_id_fkey"
            columns: ["operator_employee_id"]
            isOneToOne: false
            referencedRelation: "employees"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "whatsapp_production_logs_operator_employee_id_fkey"
            columns: ["operator_employee_id"]
            isOneToOne: false
            referencedRelation: "worker_stats"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "whatsapp_production_logs_ot_id_fkey"
            columns: ["ot_id"]
            isOneToOne: false
            referencedRelation: "ot_certificacion"
            referencedColumns: ["ot_id"]
          },
          {
            foreignKeyName: "whatsapp_production_logs_ot_id_fkey"
            columns: ["ot_id"]
            isOneToOne: false
            referencedRelation: "ot_compras_estado"
            referencedColumns: ["ot_id"]
          },
          {
            foreignKeyName: "whatsapp_production_logs_ot_id_fkey"
            columns: ["ot_id"]
            isOneToOne: false
            referencedRelation: "ot_cost_summary"
            referencedColumns: ["ot_id"]
          },
          {
            foreignKeyName: "whatsapp_production_logs_ot_id_fkey"
            columns: ["ot_id"]
            isOneToOne: false
            referencedRelation: "ot_fulfillment"
            referencedColumns: ["ot_id"]
          },
          {
            foreignKeyName: "whatsapp_production_logs_ot_id_fkey"
            columns: ["ot_id"]
            isOneToOne: false
            referencedRelation: "ots"
            referencedColumns: ["id"]
          },
        ]
      }
      whatsapp_pending_reviews: {
        Row: {
          created_at: string | null
          elapsed_minutes: number | null
          id: string | null
          inferred_costs: Json | null
          message_timestamp: string | null
          operator_employee_id: string | null
          operator_name: string | null
          operator_phone: string | null
          ot_client: string | null
          ot_id: string | null
          ot_number: string | null
          ot_product: string | null
          ot_status: Database["public"]["Enums"]["ot_status"] | null
          parsed_data: Json | null
          raw_message: string | null
          review_status:
            | Database["public"]["Enums"]["whatsapp_review_status"]
            | null
          start_log_id: string | null
          start_message: string | null
          start_timestamp: string | null
        }
        Relationships: [
          {
            foreignKeyName: "whatsapp_production_logs_operator_employee_id_fkey"
            columns: ["operator_employee_id"]
            isOneToOne: false
            referencedRelation: "employees"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "whatsapp_production_logs_operator_employee_id_fkey"
            columns: ["operator_employee_id"]
            isOneToOne: false
            referencedRelation: "worker_stats"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "whatsapp_production_logs_ot_id_fkey"
            columns: ["ot_id"]
            isOneToOne: false
            referencedRelation: "ot_certificacion"
            referencedColumns: ["ot_id"]
          },
          {
            foreignKeyName: "whatsapp_production_logs_ot_id_fkey"
            columns: ["ot_id"]
            isOneToOne: false
            referencedRelation: "ot_compras_estado"
            referencedColumns: ["ot_id"]
          },
          {
            foreignKeyName: "whatsapp_production_logs_ot_id_fkey"
            columns: ["ot_id"]
            isOneToOne: false
            referencedRelation: "ot_cost_summary"
            referencedColumns: ["ot_id"]
          },
          {
            foreignKeyName: "whatsapp_production_logs_ot_id_fkey"
            columns: ["ot_id"]
            isOneToOne: false
            referencedRelation: "ot_fulfillment"
            referencedColumns: ["ot_id"]
          },
          {
            foreignKeyName: "whatsapp_production_logs_ot_id_fkey"
            columns: ["ot_id"]
            isOneToOne: false
            referencedRelation: "ots"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "whatsapp_production_logs_start_log_id_fkey"
            columns: ["start_log_id"]
            isOneToOne: false
            referencedRelation: "whatsapp_active_sessions"
            referencedColumns: ["start_id"]
          },
          {
            foreignKeyName: "whatsapp_production_logs_start_log_id_fkey"
            columns: ["start_log_id"]
            isOneToOne: false
            referencedRelation: "whatsapp_pending_reviews"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "whatsapp_production_logs_start_log_id_fkey"
            columns: ["start_log_id"]
            isOneToOne: false
            referencedRelation: "whatsapp_production_logs"
            referencedColumns: ["id"]
          },
        ]
      }
      whatsapp_warehouse_pending_v: {
        Row: {
          action_type:
            | Database["public"]["Enums"]["warehouse_action_type"]
            | null
          created_at: string | null
          id: string | null
          inv_barcode: string | null
          inv_category:
            | Database["public"]["Enums"]["inventory_item_category"]
            | null
          inv_item_name: string | null
          item_id: string | null
          item_name: string | null
          item_sku: string | null
          lot_id: string | null
          message_timestamp: string | null
          operator_name: string | null
          operator_phone: string | null
          ot_client: string | null
          ot_number: string | null
          ot_product: string | null
          ot_status: Database["public"]["Enums"]["ot_status"] | null
          parsed_data: Json | null
          quantity: number | null
          raw_message: string | null
          review_status:
            | Database["public"]["Enums"]["warehouse_review_status"]
            | null
          scanned_value: string | null
          supplier_name: string | null
          unit: string | null
          unit_cost: number | null
        }
        Relationships: [
          {
            foreignKeyName: "whatsapp_warehouse_logs_item_id_fkey"
            columns: ["item_id"]
            isOneToOne: false
            referencedRelation: "inventory_items"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "whatsapp_warehouse_logs_item_id_fkey"
            columns: ["item_id"]
            isOneToOne: false
            referencedRelation: "inventory_items_stock_v"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "whatsapp_warehouse_logs_item_id_fkey"
            columns: ["item_id"]
            isOneToOne: false
            referencedRelation: "inventory_low_stock_alerts_v"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "whatsapp_warehouse_logs_item_id_fkey"
            columns: ["item_id"]
            isOneToOne: false
            referencedRelation: "material_cost_v"
            referencedColumns: ["item_id"]
          },
          {
            foreignKeyName: "whatsapp_warehouse_logs_lot_id_fkey"
            columns: ["lot_id"]
            isOneToOne: false
            referencedRelation: "inventory_lots"
            referencedColumns: ["id"]
          },
        ]
      }
      whatsapp_warehouse_today_v: {
        Row: {
          approved_today: number | null
          consumptions_today: number | null
          pending_reviews: number | null
          receives_today: number | null
          rejected_today: number | null
          returns_today: number | null
          total_today: number | null
        }
        Relationships: []
      }
      worker_stats: {
        Row: {
          attendance_score: number | null
          avg_rating: number | null
          avg_time_minutes: number | null
          department: string | null
          efficiency_score: number | null
          id: string | null
          lateness_minutes: number | null
          name: string | null
          overall_rating: number | null
          overtime_availability: boolean | null
          quality_score: number | null
          sheets_per_hour: number | null
          speed_score: number | null
          teamwork_rating: number | null
          total_tasks: number | null
        }
        Relationships: []
      }
    }
    Functions: {
      accrue_leave_balances: { Args: { target_date?: string }; Returns: number }
      apply_capture_event: { Args: { p_event_id: string }; Returns: string }
      calculate_monthly_payroll: {
        Args: { p_employee_id?: string; p_month?: number; p_year?: number }
        Returns: {
          assignments_count: number
          base_pay: number
          currency_code: string
          employee_id: string
          employee_name: string
          gross_pay: number
          incentives: number
          night_differential: number
          overtime_hours: number
          overtime_pay: number
          regular_hours: number
          weekend_differential: number
        }[]
      }
      calculate_payroll_for_assignment: {
        Args: {
          p_assignment_date: string
          p_employee_id: string
          p_night_hours?: number
          p_overtime_100_hours?: number
          p_overtime_50_hours?: number
          p_regular_hours?: number
          p_weekend_hours?: number
        }
        Returns: {
          base_pay: number
          currency_code: string
          hourly_rate: number
          night_differential: number
          overtime_100_pay: number
          overtime_50_pay: number
          total_pay: number
          weekend_differential: number
        }[]
      }
      calculate_payroll_for_period: {
        Args: {
          p_employee_id: string
          p_end_date: string
          p_start_date: string
        }
        Returns: {
          assignments_count: number
          breakdown: Json
          date_range: unknown
          total_overtime_hours: number
          total_pay: number
          total_regular_hours: number
        }[]
      }
      can_supervisor_view_employee: {
        Args: { p_employee_id: string; p_user_id: string }
        Returns: boolean
      }
      consumir_lote: {
        Args: {
          p_by?: string
          p_lot_id: string
          p_ot_id: string
          p_override_reason?: string
          p_quantity: number
          p_stage?: string
        }
        Returns: Json
      }
      convert_vb_to_ot: { Args: { p_vb_id: string }; Returns: string }
      emitir_oc: {
        Args: { p_issued_by: string; p_purchase_id: string }
        Returns: {
          certification_details: string | null
          created_at: string | null
          expected_date: string | null
          id: string
          issued_at: string | null
          issued_by: string | null
          notes: string | null
          oc_number: string | null
          ot_id: string | null
          purchase_date: string
          status: Database["public"]["Enums"]["oc_status"]
          supplier: string
          supplier_giro: string | null
          supplier_rut: string | null
          total_cost: number
          updated_at: string | null
          voided_at: string | null
          voided_by: string | null
          voided_reason: string | null
        }
        SetofOptions: {
          from: "*"
          to: "purchases"
          isOneToOne: true
          isSetofReturn: false
        }
      }
      enforce_hr_data_retention: {
        Args: { p_dry_run?: boolean; p_reference_time?: string }
        Returns: {
          action: string
          affected_rows: number
          table_name: string
        }[]
      }
      ensure_leave_balances_for_employee: {
        Args: { p_employee_id: string; p_year?: number }
        Returns: number
      }
      estimate_ot_hours: {
        Args: { p_machine_type?: string; p_ot_id: string }
        Returns: Json
      }
      feed_warehouse_to_inventory: { Args: { log_id: string }; Returns: string }
      feed_whatsapp_to_real_costs: {
        Args: { log_id: string }
        Returns: undefined
      }
      generar_numero_lote: { Args: never; Returns: string }
      generate_ot_number: { Args: never; Returns: string }
      get_compensation_at_date: {
        Args: { p_date?: string; p_employee_id: string }
        Returns: {
          created_at: string
          created_by: string | null
          currency_code: string
          effective_from: string
          effective_to: string | null
          employee_id: string
          hourly_rate: number
          id: string
          incentive_eligibility: boolean
          night_shift_multiplier: number
          overtime_multiplier_100: number
          overtime_multiplier_50: number
          updated_at: string
          weekend_multiplier: number
        }
        SetofOptions: {
          from: "*"
          to: "compensation_rates"
          isOneToOne: true
          isSetofReturn: false
        }
      }
      get_compensation_history: {
        Args: { p_employee_id: string }
        Returns: {
          currency_code: string
          days_active: number
          effective_from: string
          effective_to: string
          hourly_rate: number
          notes: string
          overtime_multiplier_100: number
          overtime_multiplier_50: number
          rate_change_amount: number
          rate_change_percent: number
        }[]
      }
      get_contract_at_date: {
        Args: { p_date?: string; p_employee_id: string }
        Returns: {
          base_hours_per_week: number
          contract_type: Database["public"]["Enums"]["employment_contract_type"]
          created_at: string
          created_by: string | null
          employee_id: string
          end_date: string | null
          id: string
          is_active: boolean
          max_hours_per_day: number
          max_hours_per_week: number
          minimum_rest_hours: number
          overtime_allowed: boolean
          overtime_cap_hours_per_week: number
          start_date: string
          updated_at: string
        }
        SetofOptions: {
          from: "*"
          to: "employment_contracts"
          isOneToOne: true
          isSetofReturn: false
        }
      }
      get_contract_history: {
        Args: { p_employee_id: string }
        Returns: {
          base_hours_per_week: number
          contract_type: Database["public"]["Enums"]["employment_contract_type"]
          days_active: number
          end_date: string
          is_current: boolean
          max_hours_per_week: number
          overtime_allowed: boolean
          start_date: string
        }[]
      }
      get_employee_cost_timeline: {
        Args: {
          p_employee_id: string
          p_end_date: string
          p_granularity?: string
          p_start_date: string
        }
        Returns: {
          base_hours: number
          base_pay: number
          employee_id: string
          employee_name: string
          incentive_pay: number
          night_differential: number
          night_hours: number
          ot100_hours: number
          ot100_pay: number
          ot50_hours: number
          ot50_pay: number
          overtime_premium: number
          period_end: string
          period_start: string
          total_labor_cost: number
          weekend_differential: number
          weekend_hours: number
        }[]
      }
      get_order_labor_margin: {
        Args: { p_end_date?: string; p_ot_id?: string; p_start_date?: string }
        Returns: {
          base_labor_cost: number
          client_name: string
          completion_date: string
          cost_per_hour: number
          gross_margin: number
          incentive_cost: number
          labor_hours: number
          margin_percentage: number
          night_differential: number
          order_date: string
          ot_id: string
          ot_number: string
          overtime_hours: number
          overtime_premium: number
          revenue: number
          total_cost: number
          total_labor_cost: number
          weekend_differential: number
        }[]
      }
      get_skill_tree_hierarchy: {
        Args: { p_root_skill_id?: string }
        Returns: {
          category: string
          level: number
          name: string
          parent_id: string
          skill_id: string
          tree_type: Database["public"]["Enums"]["skill_tree_type"]
        }[]
      }
      get_worker_machine_qualification: {
        Args: { p_employee_id: string; p_machine_id: string }
        Returns: {
          can_operate: boolean
          missing_skills: Json
          proficiency_score: number
        }[]
      }
      has_role: {
        Args: {
          _role: Database["public"]["Enums"]["app_role"]
          _user_id: string
        }
        Returns: boolean
      }
      has_role_name: {
        Args: { p_role_name: string; p_user_id: string }
        Returns: boolean
      }
      log_hr_compliance_access: {
        Args: {
          p_access_type?: string
          p_employee_id?: string
          p_metadata?: Json
          p_purpose?: string
          p_record_id?: string
          p_request_method?: string
          p_request_path?: string
          p_table_name: string
        }
        Returns: undefined
      }
      log_hr_sensitive_audit_event: {
        Args: {
          p_action: string
          p_employee_id: string
          p_new_data: Json
          p_old_data: Json
          p_record_id: string
          p_table_name: string
        }
        Returns: undefined
      }
      receive_oc_into_lot: {
        Args: {
          p_cert_code?: string
          p_cert_expires?: string
          p_cert_override_reason?: string
          p_item_id: string
          p_lot_number?: string
          p_purchase_id: string
          p_quantity: number
          p_recorded_by?: string
          p_unit_cost?: number
          p_variance_reason?: string
        }
        Returns: string
      }
      reemplazar_requisitos: {
        Args: {
          p_by?: string
          p_filas: Json
          p_ot_id: string
          p_visto_en?: string
        }
        Returns: Json
      }
      show_limit: { Args: never; Returns: number }
      show_trgm: { Args: { "": string }; Returns: string[] }
      split_ot: {
        Args: {
          p_advance_quantity: number
          p_ot_id: string
          p_target_status: Database["public"]["Enums"]["ot_status"]
        }
        Returns: Json
      }
      sync_purchase_ledger: {
        Args: { p_purchase_id: string }
        Returns: undefined
      }
      validate_contract_coverage: {
        Args: { p_employee_id: string; p_from_date: string; p_to_date: string }
        Returns: {
          coverage_gaps: Json
          days_expected: number
          days_with_coverage: number
          has_complete_coverage: boolean
        }[]
      }
    }
    Enums: {
      app_role:
        | "supervisor"
        | "manager"
        | "admin"
        | "technician"
        | "hr_manager"
        | "vendedor"
      bulk_job_status: "queued" | "running" | "completed" | "failed"
      capture_channel: "whatsapp" | "qr" | "manual" | "photo" | "system"
      capture_domain:
        | "production"
        | "warehouse"
        | "dispatch"
        | "receipt"
        | "other"
      capture_status:
        | "pending"
        | "approved"
        | "auto_approved"
        | "rejected"
        | "needs_revision"
      cost_line_category:
        | "material"
        | "labor"
        | "machine"
        | "finishing"
        | "outsourced"
        | "overhead"
        | "other"
      cost_line_kind: "estimate" | "committed" | "actual"
      dispatch_status: "draft" | "dispatched" | "delivered" | "cancelled"
      employee_status: "active" | "inactive" | "on_leave" | "terminated"
      employment_contract_type:
        | "full_time"
        | "part_time"
        | "temporary"
        | "contractor"
        | "intern"
      factura_compra_status: "received" | "matched" | "disputed" | "paid"
      hr_document_status: "active" | "expired" | "archived"
      hr_document_type:
        | "contract"
        | "certification"
        | "policy"
        | "training"
        | "other"
      hr_leave_type:
        | "vacation"
        | "sick"
        | "personal"
        | "maternity"
        | "paternity"
        | "unpaid"
        | "other"
      incentive_award_status: "pending" | "approved" | "paid" | "cancelled"
      incentive_rule_type:
        | "fixed_amount"
        | "percentage"
        | "free_trial"
        | "fixed_bonus"
        | "performance_bonus"
        | "attendance_bonus"
        | "overtime_bonus"
        | "penalty_adjustment"
      integration_status: "inactive" | "active" | "error"
      inventory_item_category:
        | "tool"
        | "supply"
        | "product_input"
        | "spare_part"
      inventory_tx_type:
        | "purchase"
        | "consumption"
        | "adjustment_in"
        | "adjustment_out"
        | "return_to_stock"
      job_status: "pending" | "in_progress" | "completed" | "delivered"
      leave_request_status: "pending" | "approved" | "rejected" | "cancelled"
      machine_status:
        | "idle"
        | "running"
        | "maintenance"
        | "offline"
        | "setup"
        | "breakdown"
      machine_type:
        | "offset_printer"
        | "die_cutter"
        | "guillotine"
        | "digital_printer"
        | "pre_press"
        | "manual_workshop"
        | "delivery"
        | "folder"
        | "collator"
        | "stitcher"
        | "perfect_binder"
        | "laminator"
      machine_usage_unit: "impressions" | "hours" | "kilometers" | "cycles"
      maintenance_status:
        | "scheduled"
        | "in_progress"
        | "completed"
        | "cancelled"
        | "overdue"
      maintenance_type:
        | "preventive"
        | "corrective"
        | "emergency"
        | "inspection"
        | "cleaning"
      notification_type:
        | "ot_status_changed"
        | "ot_approval_required"
        | "ot_approved"
        | "ot_rejected"
        | "report_ready"
        | "system_alert"
      oc_status:
        | "draft"
        | "sent"
        | "received"
        | "invoiced"
        | "closed"
        | "cancelled"
      ot_approval_status:
        | "pending"
        | "approved"
        | "rejected"
        | "revision_requested"
      ot_color_mode:
        | "cmyk"
        | "1_color"
        | "2_color"
        | "3_color"
        | "cmyk_pantone"
        | "sin_impresion"
      ot_operation_category:
        | "materiales"
        | "impresion"
        | "terminaciones"
        | "tercerizado"
        | "otros"
      ot_priority_level: "baja" | "normal" | "alta" | "urgente"
      ot_product_type:
        | "etiqueta"
        | "caja_display"
        | "caja_plegadiza"
        | "volante"
        | "afiche"
        | "brochure"
        | "carpeta"
        | "sobre"
        | "bolsa"
        | "otro"
      ot_status:
        | "pre_press"
        | "visto_bueno"
        | "paper_purchase"
        | "in_storage"
        | "guillotine_first_cut"
        | "offset_printing"
        | "digital_printing"
        | "die_cutting"
        | "guillotine_final_cut"
        | "workshop"
        | "outsourced"
        | "workshop_revision"
        | "ready_for_delivery"
        | "in_delivery"
        | "completed"
      ot_substrate_type:
        | "cauche"
        | "bond"
        | "couche"
        | "cartulina"
        | "kraft"
        | "adhesivo"
        | "vinilo"
        | "otro"
      report_export_status: "queued" | "processing" | "ready" | "failed"
      sales_invoice_status: "issued" | "sent" | "paid" | "cancelled"
      skill_tree_type:
        | "foundational"
        | "technical"
        | "operational"
        | "supervisory"
        | "specialized"
      task_action:
        | "clean"
        | "lubricate"
        | "check"
        | "replace"
        | "adjust"
        | "inspect"
        | "service"
        | "fill"
        | "other"
      task_frequency:
        | "daily"
        | "weekly"
        | "biweekly"
        | "monthly"
        | "quarterly"
        | "semiannual"
        | "annual"
      task_type:
        | "detachment"
        | "revision"
        | "packaging"
        | "printing"
        | "cutting"
        | "delivery"
      vb_status:
        | "draft"
        | "sent"
        | "signed"
        | "converted"
        | "rejected"
        | "expired"
      warehouse_action_type: "receive" | "use" | "return" | "check" | "unknown"
      warehouse_review_status:
        | "pending"
        | "approved"
        | "rejected"
        | "needs_revision"
        | "auto_approved"
      whatsapp_message_type: "start" | "end" | "update" | "unknown"
      whatsapp_review_status:
        | "pending"
        | "approved"
        | "rejected"
        | "needs_revision"
        | "auto_approved"
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
  graphql_public: {
    Enums: {},
  },
  public: {
    Enums: {
      app_role: [
        "supervisor",
        "manager",
        "admin",
        "technician",
        "hr_manager",
        "vendedor",
      ],
      bulk_job_status: ["queued", "running", "completed", "failed"],
      capture_channel: ["whatsapp", "qr", "manual", "photo", "system"],
      capture_domain: [
        "production",
        "warehouse",
        "dispatch",
        "receipt",
        "other",
      ],
      capture_status: [
        "pending",
        "approved",
        "auto_approved",
        "rejected",
        "needs_revision",
      ],
      cost_line_category: [
        "material",
        "labor",
        "machine",
        "finishing",
        "outsourced",
        "overhead",
        "other",
      ],
      cost_line_kind: ["estimate", "committed", "actual"],
      dispatch_status: ["draft", "dispatched", "delivered", "cancelled"],
      employee_status: ["active", "inactive", "on_leave", "terminated"],
      employment_contract_type: [
        "full_time",
        "part_time",
        "temporary",
        "contractor",
        "intern",
      ],
      factura_compra_status: ["received", "matched", "disputed", "paid"],
      hr_document_status: ["active", "expired", "archived"],
      hr_document_type: [
        "contract",
        "certification",
        "policy",
        "training",
        "other",
      ],
      hr_leave_type: [
        "vacation",
        "sick",
        "personal",
        "maternity",
        "paternity",
        "unpaid",
        "other",
      ],
      incentive_award_status: ["pending", "approved", "paid", "cancelled"],
      incentive_rule_type: [
        "fixed_amount",
        "percentage",
        "free_trial",
        "fixed_bonus",
        "performance_bonus",
        "attendance_bonus",
        "overtime_bonus",
        "penalty_adjustment",
      ],
      integration_status: ["inactive", "active", "error"],
      inventory_item_category: [
        "tool",
        "supply",
        "product_input",
        "spare_part",
      ],
      inventory_tx_type: [
        "purchase",
        "consumption",
        "adjustment_in",
        "adjustment_out",
        "return_to_stock",
      ],
      job_status: ["pending", "in_progress", "completed", "delivered"],
      leave_request_status: ["pending", "approved", "rejected", "cancelled"],
      machine_status: [
        "idle",
        "running",
        "maintenance",
        "offline",
        "setup",
        "breakdown",
      ],
      machine_type: [
        "offset_printer",
        "die_cutter",
        "guillotine",
        "digital_printer",
        "pre_press",
        "manual_workshop",
        "delivery",
        "folder",
        "collator",
        "stitcher",
        "perfect_binder",
        "laminator",
      ],
      machine_usage_unit: ["impressions", "hours", "kilometers", "cycles"],
      maintenance_status: [
        "scheduled",
        "in_progress",
        "completed",
        "cancelled",
        "overdue",
      ],
      maintenance_type: [
        "preventive",
        "corrective",
        "emergency",
        "inspection",
        "cleaning",
      ],
      notification_type: [
        "ot_status_changed",
        "ot_approval_required",
        "ot_approved",
        "ot_rejected",
        "report_ready",
        "system_alert",
      ],
      oc_status: [
        "draft",
        "sent",
        "received",
        "invoiced",
        "closed",
        "cancelled",
      ],
      ot_approval_status: [
        "pending",
        "approved",
        "rejected",
        "revision_requested",
      ],
      ot_color_mode: [
        "cmyk",
        "1_color",
        "2_color",
        "3_color",
        "cmyk_pantone",
        "sin_impresion",
      ],
      ot_operation_category: [
        "materiales",
        "impresion",
        "terminaciones",
        "tercerizado",
        "otros",
      ],
      ot_priority_level: ["baja", "normal", "alta", "urgente"],
      ot_product_type: [
        "etiqueta",
        "caja_display",
        "caja_plegadiza",
        "volante",
        "afiche",
        "brochure",
        "carpeta",
        "sobre",
        "bolsa",
        "otro",
      ],
      ot_status: [
        "pre_press",
        "visto_bueno",
        "paper_purchase",
        "in_storage",
        "guillotine_first_cut",
        "offset_printing",
        "digital_printing",
        "die_cutting",
        "guillotine_final_cut",
        "workshop",
        "outsourced",
        "workshop_revision",
        "ready_for_delivery",
        "in_delivery",
        "completed",
      ],
      ot_substrate_type: [
        "cauche",
        "bond",
        "couche",
        "cartulina",
        "kraft",
        "adhesivo",
        "vinilo",
        "otro",
      ],
      report_export_status: ["queued", "processing", "ready", "failed"],
      sales_invoice_status: ["issued", "sent", "paid", "cancelled"],
      skill_tree_type: [
        "foundational",
        "technical",
        "operational",
        "supervisory",
        "specialized",
      ],
      task_action: [
        "clean",
        "lubricate",
        "check",
        "replace",
        "adjust",
        "inspect",
        "service",
        "fill",
        "other",
      ],
      task_frequency: [
        "daily",
        "weekly",
        "biweekly",
        "monthly",
        "quarterly",
        "semiannual",
        "annual",
      ],
      task_type: [
        "detachment",
        "revision",
        "packaging",
        "printing",
        "cutting",
        "delivery",
      ],
      vb_status: [
        "draft",
        "sent",
        "signed",
        "converted",
        "rejected",
        "expired",
      ],
      warehouse_action_type: ["receive", "use", "return", "check", "unknown"],
      warehouse_review_status: [
        "pending",
        "approved",
        "rejected",
        "needs_revision",
        "auto_approved",
      ],
      whatsapp_message_type: ["start", "end", "update", "unknown"],
      whatsapp_review_status: [
        "pending",
        "approved",
        "rejected",
        "needs_revision",
        "auto_approved",
      ],
    },
  },
} as const
