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
    PostgrestVersion: "14.18"
  }
  public: {
    Tables: {
      matches: {
        Row: {
          entrants: string[]
          id: string
          match_number: number
          owner_id: string
          played_at: string
          session_id: string
          state_before: Json | null
          team_a: string[]
          team_b: string[]
          winner_side: string
        }
        Insert: {
          entrants?: string[]
          id?: string
          match_number: number
          owner_id: string
          played_at?: string
          session_id: string
          state_before?: Json | null
          team_a: string[]
          team_b: string[]
          winner_side: string
        }
        Update: {
          entrants?: string[]
          id?: string
          match_number?: number
          owner_id?: string
          played_at?: string
          session_id?: string
          state_before?: Json | null
          team_a?: string[]
          team_b?: string[]
          winner_side?: string
        }
        Relationships: [
          {
            foreignKeyName: "matches_session_id_fkey"
            columns: ["session_id"]
            isOneToOne: false
            referencedRelation: "sessions"
            referencedColumns: ["id"]
          },
        ]
      }
      players: {
        Row: {
          archived_at: string | null
          created_at: string
          id: string
          name: string
          owner_id: string
          updated_at: string
        }
        Insert: {
          archived_at?: string | null
          created_at?: string
          id?: string
          name: string
          owner_id?: string
          updated_at?: string
        }
        Update: {
          archived_at?: string | null
          created_at?: string
          id?: string
          name?: string
          owner_id?: string
          updated_at?: string
        }
        Relationships: []
      }
      profiles: {
        Row: {
          active_session_id: string | null
          avoid_rematches: boolean
          created_at: string
          display_name: string | null
          id: string
          updated_at: string
        }
        Insert: {
          active_session_id?: string | null
          avoid_rematches?: boolean
          created_at?: string
          display_name?: string | null
          id: string
          updated_at?: string
        }
        Update: {
          active_session_id?: string | null
          avoid_rematches?: boolean
          created_at?: string
          display_name?: string | null
          id?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "profiles_active_session_id_fkey"
            columns: ["active_session_id"]
            isOneToOne: false
            referencedRelation: "sessions"
            referencedColumns: ["id"]
          },
        ]
      }
      session_participants: {
        Row: {
          active: boolean
          display_name: string
          joined_at: string
          owner_id: string
          player_id: string
          session_id: string
        }
        Insert: {
          active?: boolean
          display_name: string
          joined_at?: string
          owner_id: string
          player_id: string
          session_id: string
        }
        Update: {
          active?: boolean
          display_name?: string
          joined_at?: string
          owner_id?: string
          player_id?: string
          session_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "session_participants_player_id_fkey"
            columns: ["player_id"]
            isOneToOne: false
            referencedRelation: "players"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "session_participants_session_id_fkey"
            columns: ["session_id"]
            isOneToOne: false
            referencedRelation: "sessions"
            referencedColumns: ["id"]
          },
        ]
      }
      sessions: {
        Row: {
          created_at: string
          id: string
          match_no: number
          name: string
          next_entrants: string[] | null
          owner_id: string
          reserve: string[]
          status: string
          team_a: string[]
          team_b: string[]
          updated_at: string
        }
        Insert: {
          created_at?: string
          id?: string
          match_no?: number
          name: string
          next_entrants?: string[] | null
          owner_id: string
          reserve?: string[]
          status?: string
          team_a: string[]
          team_b: string[]
          updated_at?: string
        }
        Update: {
          created_at?: string
          id?: string
          match_no?: number
          name?: string
          next_entrants?: string[] | null
          owner_id?: string
          reserve?: string[]
          status?: string
          team_a?: string[]
          team_b?: string[]
          updated_at?: string
        }
        Relationships: []
      }
      share_tokens: {
        Row: {
          created_at: string
          id: string
          owner_id: string
          revoked_at: string | null
          session_id: string
          token: string
        }
        Insert: {
          created_at?: string
          id?: string
          owner_id: string
          revoked_at?: string | null
          session_id: string
          token: string
        }
        Update: {
          created_at?: string
          id?: string
          owner_id?: string
          revoked_at?: string | null
          session_id?: string
          token?: string
        }
        Relationships: [
          {
            foreignKeyName: "share_tokens_session_id_fkey"
            columns: ["session_id"]
            isOneToOne: false
            referencedRelation: "sessions"
            referencedColumns: ["id"]
          },
        ]
      }
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      _lock_session: {
        Args: { p_session_id: string }
        Returns: {
          created_at: string
          id: string
          match_no: number
          name: string
          next_entrants: string[] | null
          owner_id: string
          reserve: string[]
          status: string
          team_a: string[]
          team_b: string[]
          updated_at: string
        }
        SetofOptions: {
          from: "*"
          to: "sessions"
          isOneToOne: true
          isSetofReturn: false
        }
      }
      _validate_session: { Args: { p_session_id: string }; Returns: undefined }
      add_session_participant: {
        Args: { p_player_id: string; p_session_id: string }
        Returns: undefined
      }
      archive_player: { Args: { p_player_id: string }; Returns: undefined }
      create_session: {
        Args: {
          p_name: string
          p_reserve: string[]
          p_team_a: string[]
          p_team_b: string[]
        }
        Returns: string
      }
      create_share_link: { Args: { p_session_id: string }; Returns: string }
      get_shared_session: { Args: { p_token: string }; Returns: Json }
      import_backup: { Args: { p_data: Json }; Returns: Json }
      record_result: {
        Args: {
          p_entrants: string[]
          p_expected_match_no: number
          p_loser_side: string
          p_session_id: string
        }
        Returns: undefined
      }
      remove_session_participant: {
        Args: {
          p_player_id: string
          p_replacement?: string
          p_session_id: string
        }
        Returns: undefined
      }
      rename_player: {
        Args: { p_name: string; p_player_id: string }
        Returns: undefined
      }
      reorder_reserve: {
        Args: { p_reserve: string[]; p_session_id: string }
        Returns: undefined
      }
      revoke_share_link: { Args: { p_session_id: string }; Returns: undefined }
      set_active_session: { Args: { p_session_id: string }; Returns: undefined }
      set_next_entrants: {
        Args: { p_entrants: string[]; p_session_id: string }
        Returns: undefined
      }
      set_session_status: {
        Args: { p_session_id: string; p_status: string }
        Returns: undefined
      }
      undo_last_match: {
        Args: { p_expected_match_no: number; p_session_id: string }
        Returns: undefined
      }
    }
    Enums: {
      [_ in never]: never
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
  TableName extends (DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
        DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])
    : never) = never,
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
  TableName extends (DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never) = never,
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
  TableName extends (DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never) = never,
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
  EnumName extends (DefaultSchemaEnumNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"]
    : never) = never,
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
  CompositeTypeName extends (PublicCompositeTypeNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"]
    : never) = never,
> = PublicCompositeTypeNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"][CompositeTypeName]
  : PublicCompositeTypeNameOrOptions extends keyof DefaultSchema["CompositeTypes"]
    ? DefaultSchema["CompositeTypes"][PublicCompositeTypeNameOrOptions]
    : never

export const Constants = {
  public: {
    Enums: {},
  },
} as const
