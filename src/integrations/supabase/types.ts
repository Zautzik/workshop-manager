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
    PostgrestVersion: "13.0.5"
  }
  public: {
    Tables: {
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
        ]
      }
      jobs: {
        Row: {
          assigned_machine_id: string | null
          created_at: string | null
          created_by: string | null
          description: string
          id: string
          status: Database["public"]["Enums"]["job_status"]
          updated_at: string | null
        }
        Insert: {
          assigned_machine_id?: string | null
          created_at?: string | null
          created_by?: string | null
          description: string
          id?: string
          status?: Database["public"]["Enums"]["job_status"]
          updated_at?: string | null
        }
        Update: {
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
            foreignKeyName: "jobs_assigned_machine_id_fkey"
            columns: ["assigned_machine_id"]
            isOneToOne: false
            referencedRelation: "machines"
            referencedColumns: ["id"]
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
        ]
      }
      machines: {
        Row: {
          created_at: string | null
          id: string
          name: string
          status: Database["public"]["Enums"]["machine_status"]
          type: Database["public"]["Enums"]["machine_type"]
          updated_at: string | null
        }
        Insert: {
          created_at?: string | null
          id?: string
          name: string
          status?: Database["public"]["Enums"]["machine_status"]
          type: Database["public"]["Enums"]["machine_type"]
          updated_at?: string | null
        }
        Update: {
          created_at?: string | null
          id?: string
          name?: string
          status?: Database["public"]["Enums"]["machine_status"]
          type?: Database["public"]["Enums"]["machine_type"]
          updated_at?: string | null
        }
        Relationships: []
      }
      maintenance_checklists: {
        Row: {
          created_at: string | null
          created_by: string | null
          description: string | null
          frequency: string
          id: string
          machine_id: string | null
          name: string
          updated_at: string | null
        }
        Insert: {
          created_at?: string | null
          created_by?: string | null
          description?: string | null
          frequency: string
          id?: string
          machine_id?: string | null
          name: string
          updated_at?: string | null
        }
        Update: {
          created_at?: string | null
          created_by?: string | null
          description?: string | null
          frequency?: string
          id?: string
          machine_id?: string | null
          name?: string
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
          checklist_id: string
          completed_at: string | null
          created_at: string | null
          created_by: string | null
          id: string
          machine_id: string
          notes: string | null
          ot_id: string | null
          priority: number | null
          scheduled_date: string
          started_at: string | null
          status: string
          total_time_minutes: number | null
        }
        Insert: {
          assigned_to?: string | null
          checklist_id: string
          completed_at?: string | null
          created_at?: string | null
          created_by?: string | null
          id?: string
          machine_id: string
          notes?: string | null
          ot_id?: string | null
          priority?: number | null
          scheduled_date: string
          started_at?: string | null
          status?: string
          total_time_minutes?: number | null
        }
        Update: {
          assigned_to?: string | null
          checklist_id?: string
          completed_at?: string | null
          created_at?: string | null
          created_by?: string | null
          id?: string
          machine_id?: string
          notes?: string | null
          ot_id?: string | null
          priority?: number | null
          scheduled_date?: string
          started_at?: string | null
          status?: string
          total_time_minutes?: number | null
        }
        Relationships: [
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
            foreignKeyName: "maintenance_work_orders_ot_id_fkey"
            columns: ["ot_id"]
            isOneToOne: false
            referencedRelation: "ots"
            referencedColumns: ["id"]
          },
        ]
      }
      ot_financials: {
        Row: {
          created_at: string | null
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
          updated_at: string | null
        }
        Insert: {
          created_at?: string | null
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
          updated_at?: string | null
        }
        Update: {
          created_at?: string | null
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
          updated_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "ot_financials_ot_id_fkey"
            columns: ["ot_id"]
            isOneToOne: true
            referencedRelation: "ots"
            referencedColumns: ["id"]
          },
        ]
      }
      ots: {
        Row: {
          client_name: string
          completed_at: string | null
          created_at: string
          current_workstation_id: string | null
          deadline: string | null
          description: string | null
          id: string
          ot_number: string
          priority: number
          quantity: number
          status: Database["public"]["Enums"]["ot_status"]
          updated_at: string
        }
        Insert: {
          client_name: string
          completed_at?: string | null
          created_at?: string
          current_workstation_id?: string | null
          deadline?: string | null
          description?: string | null
          id?: string
          ot_number: string
          priority?: number
          quantity?: number
          status?: Database["public"]["Enums"]["ot_status"]
          updated_at?: string
        }
        Update: {
          client_name?: string
          completed_at?: string | null
          created_at?: string
          current_workstation_id?: string | null
          deadline?: string | null
          description?: string | null
          id?: string
          ot_number?: string
          priority?: number
          quantity?: number
          status?: Database["public"]["Enums"]["ot_status"]
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "ots_current_workstation_id_fkey"
            columns: ["current_workstation_id"]
            isOneToOne: false
            referencedRelation: "workstations"
            referencedColumns: ["id"]
          },
        ]
      }
      roster_workers: {
        Row: {
          created_at: string | null
          id: string
          roster_id: string
          worker_id: string
        }
        Insert: {
          created_at?: string | null
          id?: string
          roster_id: string
          worker_id: string
        }
        Update: {
          created_at?: string | null
          id?: string
          roster_id?: string
          worker_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "roster_workers_roster_id_fkey"
            columns: ["roster_id"]
            isOneToOne: false
            referencedRelation: "rosters"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "roster_workers_worker_id_fkey"
            columns: ["worker_id"]
            isOneToOne: false
            referencedRelation: "worker_stats"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "roster_workers_worker_id_fkey"
            columns: ["worker_id"]
            isOneToOne: false
            referencedRelation: "workers"
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
      shifts: {
        Row: {
          created_at: string | null
          end_time: string
          id: string
          name: string
          start_time: string
        }
        Insert: {
          created_at?: string | null
          end_time: string
          id?: string
          name: string
          start_time: string
        }
        Update: {
          created_at?: string | null
          end_time?: string
          id?: string
          name?: string
          start_time?: string
        }
        Relationships: []
      }
      task_logs: {
        Row: {
          created_at: string | null
          id: string
          job_id: string | null
          notes: string | null
          ot_id: string | null
          performance_rating: number
          task_type: Database["public"]["Enums"]["task_type"]
          time_spent_minutes: number
          worker_id: string
        }
        Insert: {
          created_at?: string | null
          id?: string
          job_id?: string | null
          notes?: string | null
          ot_id?: string | null
          performance_rating?: number
          task_type: Database["public"]["Enums"]["task_type"]
          time_spent_minutes?: number
          worker_id: string
        }
        Update: {
          created_at?: string | null
          id?: string
          job_id?: string | null
          notes?: string | null
          ot_id?: string | null
          performance_rating?: number
          task_type?: Database["public"]["Enums"]["task_type"]
          time_spent_minutes?: number
          worker_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "task_logs_job_id_fkey"
            columns: ["job_id"]
            isOneToOne: false
            referencedRelation: "jobs"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "task_logs_worker_id_fkey"
            columns: ["worker_id"]
            isOneToOne: false
            referencedRelation: "worker_stats"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "task_logs_worker_id_fkey"
            columns: ["worker_id"]
            isOneToOne: false
            referencedRelation: "workers"
            referencedColumns: ["id"]
          },
        ]
      }
      user_roles: {
        Row: {
          created_at: string | null
          id: string
          role: Database["public"]["Enums"]["app_role"]
          user_id: string
        }
        Insert: {
          created_at?: string | null
          id?: string
          role: Database["public"]["Enums"]["app_role"]
          user_id: string
        }
        Update: {
          created_at?: string | null
          id?: string
          role?: Database["public"]["Enums"]["app_role"]
          user_id?: string
        }
        Relationships: []
      }
      worker_assignments: {
        Row: {
          created_at: string | null
          date: string
          id: string
          ot_id: string | null
          role: string
          shift_id: string
          updated_at: string | null
          worker_id: string
          workstation_id: string
        }
        Insert: {
          created_at?: string | null
          date?: string
          id?: string
          ot_id?: string | null
          role: string
          shift_id: string
          updated_at?: string | null
          worker_id: string
          workstation_id: string
        }
        Update: {
          created_at?: string | null
          date?: string
          id?: string
          ot_id?: string | null
          role?: string
          shift_id?: string
          updated_at?: string | null
          worker_id?: string
          workstation_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "worker_assignments_ot_id_fkey"
            columns: ["ot_id"]
            isOneToOne: false
            referencedRelation: "rosters"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "worker_assignments_shift_id_fkey"
            columns: ["shift_id"]
            isOneToOne: false
            referencedRelation: "shifts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "worker_assignments_worker_id_fkey"
            columns: ["worker_id"]
            isOneToOne: false
            referencedRelation: "worker_stats"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "worker_assignments_worker_id_fkey"
            columns: ["worker_id"]
            isOneToOne: false
            referencedRelation: "workers"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "worker_assignments_workstation_id_fkey"
            columns: ["workstation_id"]
            isOneToOne: false
            referencedRelation: "workstations"
            referencedColumns: ["id"]
          },
        ]
      }
      workers: {
        Row: {
          attendance_score: number | null
          created_at: string | null
          department: string
          id: string
          lateness_minutes: number | null
          name: string
          overall_rating: number | null
          overtime_availability: boolean | null
          quality_score: number | null
          sheets_per_hour: number | null
          speed_score: number | null
          teamwork_rating: number | null
          updated_at: string | null
        }
        Insert: {
          attendance_score?: number | null
          created_at?: string | null
          department: string
          id?: string
          lateness_minutes?: number | null
          name: string
          overall_rating?: number | null
          overtime_availability?: boolean | null
          quality_score?: number | null
          sheets_per_hour?: number | null
          speed_score?: number | null
          teamwork_rating?: number | null
          updated_at?: string | null
        }
        Update: {
          attendance_score?: number | null
          created_at?: string | null
          department?: string
          id?: string
          lateness_minutes?: number | null
          name?: string
          overall_rating?: number | null
          overtime_availability?: boolean | null
          quality_score?: number | null
          sheets_per_hour?: number | null
          speed_score?: number | null
          teamwork_rating?: number | null
          updated_at?: string | null
        }
        Relationships: []
      }
      workstations: {
        Row: {
          created_at: string | null
          id: string
          max_workers: number
          name: string
          status: string
          type: string
          updated_at: string | null
        }
        Insert: {
          created_at?: string | null
          id?: string
          max_workers?: number
          name: string
          status?: string
          type: string
          updated_at?: string | null
        }
        Update: {
          created_at?: string | null
          id?: string
          max_workers?: number
          name?: string
          status?: string
          type?: string
          updated_at?: string | null
        }
        Relationships: []
      }
    }
    Views: {
      worker_stats: {
        Row: {
          avg_rating: number | null
          avg_time_minutes: number | null
          department: string | null
          efficiency_score: number | null
          id: string | null
          name: string | null
          total_tasks: number | null
        }
        Relationships: []
      }
    }
    Functions: {
      has_role: {
        Args: {
          _role: Database["public"]["Enums"]["app_role"]
          _user_id: string
        }
        Returns: boolean
      }
      is_own_worker_record: { Args: { _worker_id: string }; Returns: boolean }
    }
    Enums: {
      app_role: "supervisor" | "manager" | "admin" | "technician"
      job_status: "pending" | "in_progress" | "completed" | "delivered"
      machine_status: "idle" | "running" | "maintenance" | "offline"
      machine_type:
        | "offset_printer"
        | "die_cutter"
        | "guillotine"
        | "digital_printer"
        | "pre_press"
        | "manual_workshop"
        | "delivery"
      ot_status:
        | "pre_press"
        | "visto_bueno"
        | "paper_purchase"
        | "paper_received"
        | "in_storage"
        | "guillotine_first_cut"
        | "offset_printing"
        | "die_cutting"
        | "guillotine_final_cut"
        | "workshop_revision"
        | "ready_for_delivery"
        | "in_delivery"
        | "completed"
      task_type:
        | "detachment"
        | "revision"
        | "packaging"
        | "printing"
        | "cutting"
        | "delivery"
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
      app_role: ["supervisor", "manager", "admin", "technician"],
      job_status: ["pending", "in_progress", "completed", "delivered"],
      machine_status: ["idle", "running", "maintenance", "offline"],
      machine_type: [
        "offset_printer",
        "die_cutter",
        "guillotine",
        "digital_printer",
        "pre_press",
        "manual_workshop",
        "delivery",
      ],
      ot_status: [
        "pre_press",
        "visto_bueno",
        "paper_purchase",
        "paper_received",
        "in_storage",
        "guillotine_first_cut",
        "offset_printing",
        "die_cutting",
        "guillotine_final_cut",
        "workshop_revision",
        "ready_for_delivery",
        "in_delivery",
        "completed",
      ],
      task_type: [
        "detachment",
        "revision",
        "packaging",
        "printing",
        "cutting",
        "delivery",
      ],
    },
  },
} as const
