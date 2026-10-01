export type Json = string | number | boolean | null | { [key: string]: Json | undefined } | Json[];

export type Database = {
  public: {
    Tables: {
      attempts: {
        Row: {
          context: Database["public"]["Enums"]["attempt_context"];
          created_at: string;
          daily_set_id: string | null;
          id: string;
          is_correct: boolean;
          question_id: string;
          selected_option_id: string | null;
          time_ms: number | null;
          used_hint: boolean;
          user_id: string;
          xp_awarded: number;
        };
        Insert: {
          context: Database["public"]["Enums"]["attempt_context"];
          created_at?: string;
          daily_set_id?: string | null;
          id?: string;
          is_correct: boolean;
          question_id: string;
          selected_option_id?: string | null;
          time_ms?: number | null;
          used_hint?: boolean;
          user_id: string;
          xp_awarded?: number;
        };
        Update: {
          context?: Database["public"]["Enums"]["attempt_context"];
          created_at?: string;
          daily_set_id?: string | null;
          id?: string;
          is_correct?: boolean;
          question_id?: string;
          selected_option_id?: string | null;
          time_ms?: number | null;
          used_hint?: boolean;
          user_id?: string;
          xp_awarded?: number;
        };
        Relationships: [
          {
            foreignKeyName: "attempts_daily_set_id_fkey";
            columns: ["daily_set_id"];
            isOneToOne: false;
            referencedRelation: "daily_sets";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "attempts_question_id_fkey";
            columns: ["question_id"];
            isOneToOne: false;
            referencedRelation: "questions";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "attempts_selected_option_id_question_id_fkey";
            columns: ["selected_option_id", "question_id"];
            isOneToOne: false;
            referencedRelation: "question_options";
            referencedColumns: ["id", "question_id"];
          },
          {
            foreignKeyName: "attempts_user_id_fkey";
            columns: ["user_id"];
            isOneToOne: false;
            referencedRelation: "profiles";
            referencedColumns: ["id"];
          },
        ];
      };
      audit_log: {
        Row: {
          action: string;
          actor_id: string | null;
          after: Json | null;
          before: Json | null;
          created_at: string;
          entity_id: string | null;
          entity_type: string;
          id: number;
        };
        Insert: {
          action: string;
          actor_id?: string | null;
          after?: Json | null;
          before?: Json | null;
          created_at?: string;
          entity_id?: string | null;
          entity_type: string;
          id?: never;
        };
        Update: {
          action?: string;
          actor_id?: string | null;
          after?: Json | null;
          before?: Json | null;
          created_at?: string;
          entity_id?: string | null;
          entity_type?: string;
          id?: never;
        };
        Relationships: [
          {
            foreignKeyName: "audit_log_actor_id_fkey";
            columns: ["actor_id"];
            isOneToOne: false;
            referencedRelation: "profiles";
            referencedColumns: ["id"];
          },
        ];
      };
      daily_set_items: {
        Row: {
          daily_set_id: string;
          position: number;
          question_id: string;
        };
        Insert: {
          daily_set_id: string;
          position: number;
          question_id: string;
        };
        Update: {
          daily_set_id?: string;
          position?: number;
          question_id?: string;
        };
        Relationships: [
          {
            foreignKeyName: "daily_set_items_daily_set_id_fkey";
            columns: ["daily_set_id"];
            isOneToOne: false;
            referencedRelation: "daily_sets";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "daily_set_items_question_id_fkey";
            columns: ["question_id"];
            isOneToOne: false;
            referencedRelation: "questions";
            referencedColumns: ["id"];
          },
        ];
      };
      daily_sets: {
        Row: {
          created_at: string;
          created_by: string | null;
          id: string;
          published_at: string | null;
          set_date: string;
          title: string | null;
          updated_at: string;
        };
        Insert: {
          created_at?: string;
          created_by?: string | null;
          id?: string;
          published_at?: string | null;
          set_date: string;
          title?: string | null;
          updated_at?: string;
        };
        Update: {
          created_at?: string;
          created_by?: string | null;
          id?: string;
          published_at?: string | null;
          set_date?: string;
          title?: string | null;
          updated_at?: string;
        };
        Relationships: [
          {
            foreignKeyName: "daily_sets_created_by_fkey";
            columns: ["created_by"];
            isOneToOne: false;
            referencedRelation: "profiles";
            referencedColumns: ["id"];
          },
        ];
      };
      feedback: {
        Row: {
          category: Database["public"]["Enums"]["feedback_category"];
          created_at: string;
          id: string;
          message: string;
          page: string | null;
          rating: number | null;
          status: Database["public"]["Enums"]["feedback_status"];
          updated_at: string;
          user_id: string | null;
        };
        Insert: {
          category?: Database["public"]["Enums"]["feedback_category"];
          created_at?: string;
          id?: string;
          message: string;
          page?: string | null;
          rating?: number | null;
          status?: Database["public"]["Enums"]["feedback_status"];
          updated_at?: string;
          user_id?: string | null;
        };
        Update: {
          category?: Database["public"]["Enums"]["feedback_category"];
          created_at?: string;
          id?: string;
          message?: string;
          page?: string | null;
          rating?: number | null;
          status?: Database["public"]["Enums"]["feedback_status"];
          updated_at?: string;
          user_id?: string | null;
        };
        Relationships: [
          {
            foreignKeyName: "feedback_user_id_fkey";
            columns: ["user_id"];
            isOneToOne: false;
            referencedRelation: "profiles";
            referencedColumns: ["id"];
          },
        ];
      };
      profiles: {
        Row: {
          avatar_url: string | null;
          bio: string | null;
          created_at: string;
          current_streak: number;
          display_name: string | null;
          handle: string;
          id: string;
          last_streak_date: string | null;
          level: number;
          longest_streak: number;
          rating: number;
          role: Database["public"]["Enums"]["user_role"];
          streak_freezes: number;
          timezone: string;
          updated_at: string;
          xp: number;
        };
        Insert: {
          avatar_url?: string | null;
          bio?: string | null;
          created_at?: string;
          current_streak?: number;
          display_name?: string | null;
          handle: string;
          id: string;
          last_streak_date?: string | null;
          level?: number;
          longest_streak?: number;
          rating?: number;
          role?: Database["public"]["Enums"]["user_role"];
          streak_freezes?: number;
          timezone?: string;
          updated_at?: string;
          xp?: number;
        };
        Update: {
          avatar_url?: string | null;
          bio?: string | null;
          created_at?: string;
          current_streak?: number;
          display_name?: string | null;
          handle?: string;
          id?: string;
          last_streak_date?: string | null;
          level?: number;
          longest_streak?: number;
          rating?: number;
          role?: Database["public"]["Enums"]["user_role"];
          streak_freezes?: number;
          timezone?: string;
          updated_at?: string;
          xp?: number;
        };
        Relationships: [];
      };
      question_answers: {
        Row: {
          correct_option_id: string;
          created_at: string;
          explanation: string;
          hint: string | null;
          question_id: string;
          updated_at: string;
        };
        Insert: {
          correct_option_id: string;
          created_at?: string;
          explanation: string;
          hint?: string | null;
          question_id: string;
          updated_at?: string;
        };
        Update: {
          correct_option_id?: string;
          created_at?: string;
          explanation?: string;
          hint?: string | null;
          question_id?: string;
          updated_at?: string;
        };
        Relationships: [
          {
            foreignKeyName: "question_answers_correct_option_id_question_id_fkey";
            columns: ["correct_option_id", "question_id"];
            isOneToOne: false;
            referencedRelation: "question_options";
            referencedColumns: ["id", "question_id"];
          },
          {
            foreignKeyName: "question_answers_question_id_fkey";
            columns: ["question_id"];
            isOneToOne: true;
            referencedRelation: "questions";
            referencedColumns: ["id"];
          },
        ];
      };
      question_options: {
        Row: {
          body: string;
          created_at: string;
          id: string;
          position: number;
          question_id: string;
          updated_at: string;
        };
        Insert: {
          body: string;
          created_at?: string;
          id?: string;
          position: number;
          question_id: string;
          updated_at?: string;
        };
        Update: {
          body?: string;
          created_at?: string;
          id?: string;
          position?: number;
          question_id?: string;
          updated_at?: string;
        };
        Relationships: [
          {
            foreignKeyName: "question_options_question_id_fkey";
            columns: ["question_id"];
            isOneToOne: false;
            referencedRelation: "questions";
            referencedColumns: ["id"];
          },
        ];
      };
      question_tags: {
        Row: {
          created_at: string;
          question_id: string;
          tag: string;
        };
        Insert: {
          created_at?: string;
          question_id: string;
          tag: string;
        };
        Update: {
          created_at?: string;
          question_id?: string;
          tag?: string;
        };
        Relationships: [
          {
            foreignKeyName: "question_tags_question_id_fkey";
            columns: ["question_id"];
            isOneToOne: false;
            referencedRelation: "questions";
            referencedColumns: ["id"];
          },
        ];
      };
      questions: {
        Row: {
          content_hash: string;
          created_at: string;
          created_by: string | null;
          difficulty: Database["public"]["Enums"]["question_difficulty"];
          difficulty_rating: number;
          est_seconds: number;
          id: string;
          published_at: string | null;
          source: Database["public"]["Enums"]["question_source"];
          status: Database["public"]["Enums"]["question_status"];
          stem: string;
          subtopic_id: string;
          updated_at: string;
        };
        Insert: {
          content_hash: string;
          created_at?: string;
          created_by?: string | null;
          difficulty: Database["public"]["Enums"]["question_difficulty"];
          difficulty_rating?: number;
          est_seconds?: number;
          id?: string;
          published_at?: string | null;
          source?: Database["public"]["Enums"]["question_source"];
          status?: Database["public"]["Enums"]["question_status"];
          stem: string;
          subtopic_id: string;
          updated_at?: string;
        };
        Update: {
          content_hash?: string;
          created_at?: string;
          created_by?: string | null;
          difficulty?: Database["public"]["Enums"]["question_difficulty"];
          difficulty_rating?: number;
          est_seconds?: number;
          id?: string;
          published_at?: string | null;
          source?: Database["public"]["Enums"]["question_source"];
          status?: Database["public"]["Enums"]["question_status"];
          stem?: string;
          subtopic_id?: string;
          updated_at?: string;
        };
        Relationships: [
          {
            foreignKeyName: "questions_created_by_fkey";
            columns: ["created_by"];
            isOneToOne: false;
            referencedRelation: "profiles";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "questions_subtopic_id_fkey";
            columns: ["subtopic_id"];
            isOneToOne: false;
            referencedRelation: "subtopics";
            referencedColumns: ["id"];
          },
        ];
      };
      reports: {
        Row: {
          created_at: string;
          details: string | null;
          id: string;
          question_id: string;
          reason: Database["public"]["Enums"]["report_reason"];
          reporter_id: string | null;
          resolution_note: string | null;
          resolved_at: string | null;
          resolved_by: string | null;
          status: Database["public"]["Enums"]["report_status"];
          updated_at: string;
        };
        Insert: {
          created_at?: string;
          details?: string | null;
          id?: string;
          question_id: string;
          reason: Database["public"]["Enums"]["report_reason"];
          reporter_id?: string | null;
          resolution_note?: string | null;
          resolved_at?: string | null;
          resolved_by?: string | null;
          status?: Database["public"]["Enums"]["report_status"];
          updated_at?: string;
        };
        Update: {
          created_at?: string;
          details?: string | null;
          id?: string;
          question_id?: string;
          reason?: Database["public"]["Enums"]["report_reason"];
          reporter_id?: string | null;
          resolution_note?: string | null;
          resolved_at?: string | null;
          resolved_by?: string | null;
          status?: Database["public"]["Enums"]["report_status"];
          updated_at?: string;
        };
        Relationships: [
          {
            foreignKeyName: "reports_question_id_fkey";
            columns: ["question_id"];
            isOneToOne: false;
            referencedRelation: "questions";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "reports_reporter_id_fkey";
            columns: ["reporter_id"];
            isOneToOne: false;
            referencedRelation: "profiles";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "reports_resolved_by_fkey";
            columns: ["resolved_by"];
            isOneToOne: false;
            referencedRelation: "profiles";
            referencedColumns: ["id"];
          },
        ];
      };
      sections: {
        Row: {
          created_at: string;
          description: string | null;
          id: string;
          is_active: boolean;
          name: string;
          slug: string;
          sort_order: number;
          updated_at: string;
        };
        Insert: {
          created_at?: string;
          description?: string | null;
          id?: string;
          is_active?: boolean;
          name: string;
          slug: string;
          sort_order?: number;
          updated_at?: string;
        };
        Update: {
          created_at?: string;
          description?: string | null;
          id?: string;
          is_active?: boolean;
          name?: string;
          slug?: string;
          sort_order?: number;
          updated_at?: string;
        };
        Relationships: [];
      };
      subtopics: {
        Row: {
          created_at: string;
          description: string | null;
          id: string;
          is_active: boolean;
          name: string;
          slug: string;
          sort_order: number;
          topic_id: string;
          updated_at: string;
        };
        Insert: {
          created_at?: string;
          description?: string | null;
          id?: string;
          is_active?: boolean;
          name: string;
          slug: string;
          sort_order?: number;
          topic_id: string;
          updated_at?: string;
        };
        Update: {
          created_at?: string;
          description?: string | null;
          id?: string;
          is_active?: boolean;
          name?: string;
          slug?: string;
          sort_order?: number;
          topic_id?: string;
          updated_at?: string;
        };
        Relationships: [
          {
            foreignKeyName: "subtopics_topic_id_fkey";
            columns: ["topic_id"];
            isOneToOne: false;
            referencedRelation: "topics";
            referencedColumns: ["id"];
          },
        ];
      };
      topics: {
        Row: {
          created_at: string;
          description: string | null;
          id: string;
          is_active: boolean;
          name: string;
          section_id: string;
          slug: string;
          sort_order: number;
          updated_at: string;
        };
        Insert: {
          created_at?: string;
          description?: string | null;
          id?: string;
          is_active?: boolean;
          name: string;
          section_id: string;
          slug: string;
          sort_order?: number;
          updated_at?: string;
        };
        Update: {
          created_at?: string;
          description?: string | null;
          id?: string;
          is_active?: boolean;
          name?: string;
          section_id?: string;
          slug?: string;
          sort_order?: number;
          updated_at?: string;
        };
        Relationships: [
          {
            foreignKeyName: "topics_section_id_fkey";
            columns: ["section_id"];
            isOneToOne: false;
            referencedRelation: "sections";
            referencedColumns: ["id"];
          },
        ];
      };
      xp_events: {
        Row: {
          amount: number;
          attempt_id: string | null;
          created_at: string;
          daily_set_id: string | null;
          id: number;
          idempotency_key: string | null;
          metadata: NonNullable<Json>;
          reason: string;
          user_id: string;
        };
        Insert: {
          amount: number;
          attempt_id?: string | null;
          created_at?: string;
          daily_set_id?: string | null;
          id?: never;
          idempotency_key?: string | null;
          metadata?: NonNullable<Json>;
          reason: string;
          user_id: string;
        };
        Update: {
          amount?: number;
          attempt_id?: string | null;
          created_at?: string;
          daily_set_id?: string | null;
          id?: never;
          idempotency_key?: string | null;
          metadata?: NonNullable<Json>;
          reason?: string;
          user_id?: string;
        };
        Relationships: [
          {
            foreignKeyName: "xp_events_attempt_id_fkey";
            columns: ["attempt_id"];
            isOneToOne: false;
            referencedRelation: "attempts";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "xp_events_daily_set_id_fkey";
            columns: ["daily_set_id"];
            isOneToOne: false;
            referencedRelation: "daily_sets";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "xp_events_user_id_fkey";
            columns: ["user_id"];
            isOneToOne: false;
            referencedRelation: "profiles";
            referencedColumns: ["id"];
          },
        ];
      };
    };
    Views: {
      [_ in never]: never;
    };
    Functions: {
      admin_get_question_answer: {
        Args: { target_question_id: string };
        Returns: {
          correct_option_id: string;
          explanation: string;
          hint: string;
          question_id: string;
          updated_at: string;
        }[];
      };
      admin_set_user_role: {
        Args: { new_role: Database["public"]["Enums"]["user_role"]; target_user_id: string };
        Returns: undefined;
      };
      admin_upsert_question_answer: {
        Args: {
          correct_option_id: string;
          explanation: string;
          hint?: string;
          target_question_id: string;
        };
        Returns: undefined;
      };
    };
    Enums: {
      attempt_context: "daily" | "practice" | "assessment";
      feedback_category: "general" | "bug" | "feature" | "content" | "other";
      feedback_status: "new" | "read" | "archived";
      question_difficulty: "easy" | "medium" | "hard";
      question_source: "manual" | "ai" | "import";
      question_status: "draft" | "in_review" | "published" | "retired";
      report_reason: "wrong_answer" | "ambiguous" | "typo" | "duplicate" | "offensive" | "other";
      report_status: "open" | "triaged" | "resolved" | "dismissed";
      user_role: "user" | "admin";
    };
    CompositeTypes: {
      [_ in never]: never;
    };
  };
};

type DatabaseWithoutInternals = Omit<Database, "__InternalSupabase">;

type DefaultSchema = DatabaseWithoutInternals[Extract<keyof Database, "public">];

export type Tables<
  DefaultSchemaTableNameOrOptions extends
    | keyof (DefaultSchema["Tables"] & DefaultSchema["Views"])
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends (DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals;
  }
    ? keyof (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
        DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])
    : never) = never,
> = DefaultSchemaTableNameOrOptions extends { schema: keyof DatabaseWithoutInternals }
  ? (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
      DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])[TableName] extends {
      Row: infer R;
    }
    ? R
    : never
  : DefaultSchemaTableNameOrOptions extends keyof (DefaultSchema["Tables"] & DefaultSchema["Views"])
    ? (DefaultSchema["Tables"] & DefaultSchema["Views"])[DefaultSchemaTableNameOrOptions] extends {
        Row: infer R;
      }
      ? R
      : never
    : never;

export type TablesInsert<
  DefaultSchemaTableNameOrOptions extends
    | keyof DefaultSchema["Tables"]
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends (DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals;
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never) = never,
> = DefaultSchemaTableNameOrOptions extends { schema: keyof DatabaseWithoutInternals }
  ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"][TableName] extends {
      Insert: infer I;
    }
    ? I
    : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema["Tables"]
    ? DefaultSchema["Tables"][DefaultSchemaTableNameOrOptions] extends {
        Insert: infer I;
      }
      ? I
      : never
    : never;

export type TablesUpdate<
  DefaultSchemaTableNameOrOptions extends
    | keyof DefaultSchema["Tables"]
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends (DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals;
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never) = never,
> = DefaultSchemaTableNameOrOptions extends { schema: keyof DatabaseWithoutInternals }
  ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"][TableName] extends {
      Update: infer U;
    }
    ? U
    : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema["Tables"]
    ? DefaultSchema["Tables"][DefaultSchemaTableNameOrOptions] extends {
        Update: infer U;
      }
      ? U
      : never
    : never;

export type Enums<
  DefaultSchemaEnumNameOrOptions extends
    | keyof DefaultSchema["Enums"]
    | { schema: keyof DatabaseWithoutInternals },
  EnumName extends (DefaultSchemaEnumNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals;
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"]
    : never) = never,
> = DefaultSchemaEnumNameOrOptions extends { schema: keyof DatabaseWithoutInternals }
  ? DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"][EnumName]
  : DefaultSchemaEnumNameOrOptions extends keyof DefaultSchema["Enums"]
    ? DefaultSchema["Enums"][DefaultSchemaEnumNameOrOptions]
    : never;

export type CompositeTypes<
  PublicCompositeTypeNameOrOptions extends
    | keyof DefaultSchema["CompositeTypes"]
    | { schema: keyof DatabaseWithoutInternals },
  CompositeTypeName extends (PublicCompositeTypeNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals;
  }
    ? keyof DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"]
    : never) = never,
> = PublicCompositeTypeNameOrOptions extends { schema: keyof DatabaseWithoutInternals }
  ? DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"][CompositeTypeName]
  : PublicCompositeTypeNameOrOptions extends keyof DefaultSchema["CompositeTypes"]
    ? DefaultSchema["CompositeTypes"][PublicCompositeTypeNameOrOptions]
    : never;

export const Constants = {
  public: {
    Enums: {
      attempt_context: ["daily", "practice", "assessment"],
      feedback_category: ["general", "bug", "feature", "content", "other"],
      feedback_status: ["new", "read", "archived"],
      question_difficulty: ["easy", "medium", "hard"],
      question_source: ["manual", "ai", "import"],
      question_status: ["draft", "in_review", "published", "retired"],
      report_reason: ["wrong_answer", "ambiguous", "typo", "duplicate", "offensive", "other"],
      report_status: ["open", "triaged", "resolved", "dismissed"],
      user_role: ["user", "admin"],
    },
  },
} as const;
