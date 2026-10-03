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
          question_ref: string | null;
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
          question_ref?: never;
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
          question_ref?: never;
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
      badges: {
        Row: {
          created_at: string;
          description: string;
          icon: string;
          name: string;
          per_topic: boolean;
          slug: string;
          sort_order: number;
          updated_at: string;
        };
        Insert: {
          created_at?: string;
          description: string;
          icon: string;
          name: string;
          per_topic?: boolean;
          slug: string;
          sort_order?: number;
          updated_at?: string;
        };
        Update: {
          created_at?: string;
          description?: string;
          icon?: string;
          name?: string;
          per_topic?: boolean;
          slug?: string;
          sort_order?: number;
          updated_at?: string;
        };
        Relationships: [];
      };
      contest_answers: {
        Row: {
          contest_id: string;
          created_at: string;
          is_correct: boolean;
          points: number;
          question_id: string;
          selected_option_id: string | null;
          time_ms: number | null;
          user_id: string;
        };
        Insert: {
          contest_id: string;
          created_at?: string;
          is_correct: boolean;
          points?: number;
          question_id: string;
          selected_option_id?: string | null;
          time_ms?: number | null;
          user_id: string;
        };
        Update: {
          contest_id?: string;
          created_at?: string;
          is_correct?: boolean;
          points?: number;
          question_id?: string;
          selected_option_id?: string | null;
          time_ms?: number | null;
          user_id?: string;
        };
        Relationships: [
          {
            foreignKeyName: "contest_answers_contest_id_user_id_fkey";
            columns: ["contest_id", "user_id"];
            isOneToOne: false;
            referencedRelation: "contest_entries";
            referencedColumns: ["contest_id", "user_id"];
          },
          {
            foreignKeyName: "contest_answers_question_id_fkey";
            columns: ["question_id"];
            isOneToOne: false;
            referencedRelation: "questions";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "contest_answers_selected_option_id_question_id_fkey";
            columns: ["selected_option_id", "question_id"];
            isOneToOne: false;
            referencedRelation: "question_options";
            referencedColumns: ["id", "question_id"];
          },
        ];
      };
      contest_entries: {
        Row: {
          answered: number;
          contest_id: string;
          correct: number;
          joined_at: string;
          last_answer_at: string | null;
          score: number;
          time_ms: number;
          user_id: string;
        };
        Insert: {
          answered?: number;
          contest_id: string;
          correct?: number;
          joined_at?: string;
          last_answer_at?: string | null;
          score?: number;
          time_ms?: number;
          user_id: string;
        };
        Update: {
          answered?: number;
          contest_id?: string;
          correct?: number;
          joined_at?: string;
          last_answer_at?: string | null;
          score?: number;
          time_ms?: number;
          user_id?: string;
        };
        Relationships: [
          {
            foreignKeyName: "contest_entries_contest_id_fkey";
            columns: ["contest_id"];
            isOneToOne: false;
            referencedRelation: "contests";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "contest_entries_user_id_fkey";
            columns: ["user_id"];
            isOneToOne: false;
            referencedRelation: "profiles";
            referencedColumns: ["id"];
          },
        ];
      };
      contest_items: {
        Row: {
          contest_id: string;
          position: number;
          question_id: string;
        };
        Insert: {
          contest_id: string;
          position: number;
          question_id: string;
        };
        Update: {
          contest_id?: string;
          position?: number;
          question_id?: string;
        };
        Relationships: [
          {
            foreignKeyName: "contest_items_contest_id_fkey";
            columns: ["contest_id"];
            isOneToOne: false;
            referencedRelation: "contests";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "contest_items_question_id_fkey";
            columns: ["question_id"];
            isOneToOne: false;
            referencedRelation: "questions";
            referencedColumns: ["id"];
          },
        ];
      };
      contests: {
        Row: {
          created_at: string;
          created_by: string | null;
          description: string | null;
          ends_at: string;
          id: string;
          is_published: boolean;
          slug: string;
          starts_at: string;
          title: string;
          updated_at: string;
        };
        Insert: {
          created_at?: string;
          created_by?: string | null;
          description?: string | null;
          ends_at: string;
          id?: string;
          is_published?: boolean;
          slug: string;
          starts_at: string;
          title: string;
          updated_at?: string;
        };
        Update: {
          created_at?: string;
          created_by?: string | null;
          description?: string | null;
          ends_at?: string;
          id?: string;
          is_published?: boolean;
          slug?: string;
          starts_at?: string;
          title?: string;
          updated_at?: string;
        };
        Relationships: [
          {
            foreignKeyName: "contests_created_by_fkey";
            columns: ["created_by"];
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
          level: number;
          published_at: string | null;
          set_date: string;
          title: string | null;
          track_id: string;
          updated_at: string;
        };
        Insert: {
          created_at?: string;
          created_by?: string | null;
          id?: string;
          level?: number;
          published_at?: string | null;
          set_date: string;
          title?: string | null;
          track_id?: string;
          updated_at?: string;
        };
        Update: {
          created_at?: string;
          created_by?: string | null;
          id?: string;
          level?: number;
          published_at?: string | null;
          set_date?: string;
          title?: string | null;
          track_id?: string;
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
          {
            foreignKeyName: "daily_sets_level_fkey";
            columns: ["level"];
            isOneToOne: false;
            referencedRelation: "levels";
            referencedColumns: ["level"];
          },
          {
            foreignKeyName: "daily_sets_track_id_fkey";
            columns: ["track_id"];
            isOneToOne: false;
            referencedRelation: "tracks";
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
      hint_uses: {
        Row: {
          context: Database["public"]["Enums"]["attempt_context"];
          created_at: string;
          daily_set_id: string | null;
          id: string;
          question_id: string;
          user_id: string;
        };
        Insert: {
          context: Database["public"]["Enums"]["attempt_context"];
          created_at?: string;
          daily_set_id?: string | null;
          id?: string;
          question_id: string;
          user_id: string;
        };
        Update: {
          context?: Database["public"]["Enums"]["attempt_context"];
          created_at?: string;
          daily_set_id?: string | null;
          id?: string;
          question_id?: string;
          user_id?: string;
        };
        Relationships: [
          {
            foreignKeyName: "hint_uses_daily_set_id_fkey";
            columns: ["daily_set_id"];
            isOneToOne: false;
            referencedRelation: "daily_sets";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "hint_uses_question_id_fkey";
            columns: ["question_id"];
            isOneToOne: false;
            referencedRelation: "questions";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "hint_uses_user_id_fkey";
            columns: ["user_id"];
            isOneToOne: false;
            referencedRelation: "profiles";
            referencedColumns: ["id"];
          },
        ];
      };
      league_members: {
        Row: {
          final_rank: number | null;
          joined_at: string;
          last_xp_at: string;
          league_id: string;
          outcome: Database["public"]["Enums"]["league_outcome"] | null;
          user_id: string;
          week_start: string;
          xp: number;
        };
        Insert: {
          final_rank?: number | null;
          joined_at?: string;
          last_xp_at?: string;
          league_id: string;
          outcome?: Database["public"]["Enums"]["league_outcome"] | null;
          user_id: string;
          week_start: string;
          xp?: number;
        };
        Update: {
          final_rank?: number | null;
          joined_at?: string;
          last_xp_at?: string;
          league_id?: string;
          outcome?: Database["public"]["Enums"]["league_outcome"] | null;
          user_id?: string;
          week_start?: string;
          xp?: number;
        };
        Relationships: [
          {
            foreignKeyName: "league_members_league_id_fkey";
            columns: ["league_id"];
            isOneToOne: false;
            referencedRelation: "leagues";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "league_members_user_id_fkey";
            columns: ["user_id"];
            isOneToOne: false;
            referencedRelation: "profiles";
            referencedColumns: ["id"];
          },
        ];
      };
      league_tiers: {
        Row: {
          created_at: string;
          demote_count: number;
          name: string;
          promote_count: number;
          slug: string;
          tier: number;
          updated_at: string;
        };
        Insert: {
          created_at?: string;
          demote_count: number;
          name: string;
          promote_count: number;
          slug: string;
          tier: number;
          updated_at?: string;
        };
        Update: {
          created_at?: string;
          demote_count?: number;
          name?: string;
          promote_count?: number;
          slug?: string;
          tier?: number;
          updated_at?: string;
        };
        Relationships: [];
      };
      leagues: {
        Row: {
          created_at: string;
          finalized_at: string | null;
          id: string;
          tier: number;
          week_start: string;
        };
        Insert: {
          created_at?: string;
          finalized_at?: string | null;
          id?: string;
          tier: number;
          week_start: string;
        };
        Update: {
          created_at?: string;
          finalized_at?: string | null;
          id?: string;
          tier?: number;
          week_start?: string;
        };
        Relationships: [
          {
            foreignKeyName: "leagues_tier_fkey";
            columns: ["tier"];
            isOneToOne: false;
            referencedRelation: "league_tiers";
            referencedColumns: ["tier"];
          },
        ];
      };
      levels: {
        Row: {
          created_at: string;
          easy_count: number;
          hard_count: number;
          is_active: boolean;
          level: number;
          medium_count: number;
          min_profile_level: number;
          name: string;
          slug: string;
          updated_at: string;
        };
        Insert: {
          created_at?: string;
          easy_count: number;
          hard_count: number;
          is_active?: boolean;
          level: number;
          medium_count: number;
          min_profile_level: number;
          name: string;
          slug: string;
          updated_at?: string;
        };
        Update: {
          created_at?: string;
          easy_count?: number;
          hard_count?: number;
          is_active?: boolean;
          level?: number;
          medium_count?: number;
          min_profile_level?: number;
          name?: string;
          slug?: string;
          updated_at?: string;
        };
        Relationships: [];
      };
      placement_tests: {
        Row: {
          completed_at: string | null;
          correct: number | null;
          id: string;
          placed_level: number | null;
          question_ids: string[];
          score: number | null;
          started_at: string;
          user_id: string;
        };
        Insert: {
          completed_at?: string | null;
          correct?: number | null;
          id?: string;
          placed_level?: number | null;
          question_ids: string[];
          score?: number | null;
          started_at?: string;
          user_id: string;
        };
        Update: {
          completed_at?: string | null;
          correct?: number | null;
          id?: string;
          placed_level?: number | null;
          question_ids?: string[];
          score?: number | null;
          started_at?: string;
          user_id?: string;
        };
        Relationships: [
          {
            foreignKeyName: "placement_tests_placed_level_fkey";
            columns: ["placed_level"];
            isOneToOne: false;
            referencedRelation: "levels";
            referencedColumns: ["level"];
          },
          {
            foreignKeyName: "placement_tests_user_id_fkey";
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
          banned_at: string | null;
          banned_by: string | null;
          banned_reason: string | null;
          bio: string | null;
          created_at: string;
          current_streak: number;
          daily_target: number;
          display_name: string | null;
          exam_goal: string | null;
          handle: string | null;
          id: string;
          last_streak_date: string | null;
          league_tier: number;
          level: number;
          longest_streak: number;
          onboarded_at: string | null;
          placed_at: string | null;
          placement_level: number | null;
          rating: number;
          role: Database["public"]["Enums"]["user_role"];
          streak_freezes: number;
          timezone: string;
          track_id: string | null;
          updated_at: string;
          xp: number;
        };
        Insert: {
          avatar_url?: string | null;
          banned_at?: string | null;
          banned_by?: string | null;
          banned_reason?: string | null;
          bio?: string | null;
          created_at?: string;
          current_streak?: number;
          daily_target?: number;
          display_name?: string | null;
          exam_goal?: string | null;
          handle?: string | null;
          id: string;
          last_streak_date?: string | null;
          league_tier?: number;
          level?: number;
          longest_streak?: number;
          onboarded_at?: string | null;
          placed_at?: string | null;
          placement_level?: number | null;
          rating?: number;
          role?: Database["public"]["Enums"]["user_role"];
          streak_freezes?: number;
          timezone?: string;
          track_id?: string | null;
          updated_at?: string;
          xp?: number;
        };
        Update: {
          avatar_url?: string | null;
          banned_at?: string | null;
          banned_by?: string | null;
          banned_reason?: string | null;
          bio?: string | null;
          created_at?: string;
          current_streak?: number;
          daily_target?: number;
          display_name?: string | null;
          exam_goal?: string | null;
          handle?: string | null;
          id?: string;
          last_streak_date?: string | null;
          league_tier?: number;
          level?: number;
          longest_streak?: number;
          onboarded_at?: string | null;
          placed_at?: string | null;
          placement_level?: number | null;
          rating?: number;
          role?: Database["public"]["Enums"]["user_role"];
          streak_freezes?: number;
          timezone?: string;
          track_id?: string | null;
          updated_at?: string;
          xp?: number;
        };
        Relationships: [
          {
            foreignKeyName: "profiles_banned_by_fkey";
            columns: ["banned_by"];
            isOneToOne: false;
            referencedRelation: "profiles";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "profiles_exam_goal_fkey";
            columns: ["exam_goal"];
            isOneToOne: false;
            referencedRelation: "tags";
            referencedColumns: ["slug"];
          },
          {
            foreignKeyName: "profiles_league_tier_fkey";
            columns: ["league_tier"];
            isOneToOne: false;
            referencedRelation: "league_tiers";
            referencedColumns: ["tier"];
          },
          {
            foreignKeyName: "profiles_placement_level_fkey";
            columns: ["placement_level"];
            isOneToOne: false;
            referencedRelation: "levels";
            referencedColumns: ["level"];
          },
          {
            foreignKeyName: "profiles_track_id_fkey";
            columns: ["track_id"];
            isOneToOne: false;
            referencedRelation: "tracks";
            referencedColumns: ["id"];
          },
        ];
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
      question_generation_jobs: {
        Row: {
          batches: number;
          cancelled_by: string | null;
          created_at: string;
          created_by: string | null;
          difficulty: Database["public"]["Enums"]["question_difficulty"];
          dropped_computed: number;
          dropped_duplicate_hash: number;
          dropped_duplicate_similar: number;
          dropped_invalid: number;
          dropped_solver: number;
          finished_at: string | null;
          id: string;
          inserted: number;
          last_error: string | null;
          locked_until: string | null;
          max_batches: number;
          model: string;
          prompt_version: string;
          requested: number;
          solver_model: string;
          status: Database["public"]["Enums"]["generation_job_status"];
          subtopic_id: string;
          updated_at: string;
        };
        Insert: {
          batches?: number;
          cancelled_by?: string | null;
          created_at?: string;
          created_by?: string | null;
          difficulty: Database["public"]["Enums"]["question_difficulty"];
          dropped_computed?: number;
          dropped_duplicate_hash?: number;
          dropped_duplicate_similar?: number;
          dropped_invalid?: number;
          dropped_solver?: number;
          finished_at?: string | null;
          id?: string;
          inserted?: number;
          last_error?: string | null;
          locked_until?: string | null;
          max_batches: number;
          model: string;
          prompt_version: string;
          requested: number;
          solver_model: string;
          status?: Database["public"]["Enums"]["generation_job_status"];
          subtopic_id: string;
          updated_at?: string;
        };
        Update: {
          batches?: number;
          cancelled_by?: string | null;
          created_at?: string;
          created_by?: string | null;
          difficulty?: Database["public"]["Enums"]["question_difficulty"];
          dropped_computed?: number;
          dropped_duplicate_hash?: number;
          dropped_duplicate_similar?: number;
          dropped_invalid?: number;
          dropped_solver?: number;
          finished_at?: string | null;
          id?: string;
          inserted?: number;
          last_error?: string | null;
          locked_until?: string | null;
          max_batches?: number;
          model?: string;
          prompt_version?: string;
          requested?: number;
          solver_model?: string;
          status?: Database["public"]["Enums"]["generation_job_status"];
          subtopic_id?: string;
          updated_at?: string;
        };
        Relationships: [
          {
            foreignKeyName: "question_generation_jobs_cancelled_by_fkey";
            columns: ["cancelled_by"];
            isOneToOne: false;
            referencedRelation: "profiles";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "question_generation_jobs_created_by_fkey";
            columns: ["created_by"];
            isOneToOne: false;
            referencedRelation: "profiles";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "question_generation_jobs_subtopic_id_fkey";
            columns: ["subtopic_id"];
            isOneToOne: false;
            referencedRelation: "subtopics";
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
      question_sources: {
        Row: {
          book_answer: string | null;
          chapter: string | null;
          correct_pct: number | null;
          created_at: string;
          exams: Json;
          key_status: string;
          level: number | null;
          notes: string | null;
          owns_question: boolean;
          page: number | null;
          question_id: string;
          ref: string;
          skipped_pct: number | null;
          source: string;
          tta_seconds: number | null;
          updated_at: string;
        };
        Insert: {
          book_answer?: string | null;
          chapter?: string | null;
          correct_pct?: number | null;
          created_at?: string;
          exams?: Json;
          key_status: string;
          level?: number | null;
          notes?: string | null;
          owns_question?: boolean;
          page?: number | null;
          question_id: string;
          ref: string;
          skipped_pct?: number | null;
          source: string;
          tta_seconds?: number | null;
          updated_at?: string;
        };
        Update: {
          book_answer?: string | null;
          chapter?: string | null;
          correct_pct?: number | null;
          created_at?: string;
          exams?: Json;
          key_status?: string;
          level?: number | null;
          notes?: string | null;
          owns_question?: boolean;
          page?: number | null;
          question_id?: string;
          ref?: string;
          skipped_pct?: number | null;
          source?: string;
          tta_seconds?: number | null;
          updated_at?: string;
        };
        Relationships: [
          {
            foreignKeyName: "question_sources_question_id_fkey";
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
          {
            foreignKeyName: "question_tags_tag_fkey";
            columns: ["tag"];
            isOneToOne: false;
            referencedRelation: "tags";
            referencedColumns: ["slug"];
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
          generation_job_id: string | null;
          id: string;
          model: string | null;
          prompt_version: string | null;
          published_at: string | null;
          review_note: string | null;
          reviewed_at: string | null;
          reviewed_by: string | null;
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
          generation_job_id?: string | null;
          id?: string;
          model?: string | null;
          prompt_version?: string | null;
          published_at?: string | null;
          review_note?: string | null;
          reviewed_at?: string | null;
          reviewed_by?: string | null;
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
          generation_job_id?: string | null;
          id?: string;
          model?: string | null;
          prompt_version?: string | null;
          published_at?: string | null;
          review_note?: string | null;
          reviewed_at?: string | null;
          reviewed_by?: string | null;
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
            foreignKeyName: "questions_generation_job_id_fkey";
            columns: ["generation_job_id"];
            isOneToOne: false;
            referencedRelation: "question_generation_jobs";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "questions_reviewed_by_fkey";
            columns: ["reviewed_by"];
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
      rating_events: {
        Row: {
          answered: number;
          created_at: string;
          daily_set_id: string;
          expected: number;
          id: number;
          k_factor: number;
          questions: number;
          rating_after: number;
          rating_before: number;
          score: number;
          set_date: string;
          user_id: string;
        };
        Insert: {
          answered: number;
          created_at?: string;
          daily_set_id: string;
          expected: number;
          id?: never;
          k_factor: number;
          questions: number;
          rating_after: number;
          rating_before: number;
          score: number;
          set_date: string;
          user_id: string;
        };
        Update: {
          answered?: number;
          created_at?: string;
          daily_set_id?: string;
          expected?: number;
          id?: never;
          k_factor?: number;
          questions?: number;
          rating_after?: number;
          rating_before?: number;
          score?: number;
          set_date?: string;
          user_id?: string;
        };
        Relationships: [
          {
            foreignKeyName: "rating_events_daily_set_id_fkey";
            columns: ["daily_set_id"];
            isOneToOne: false;
            referencedRelation: "daily_sets";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "rating_events_user_id_fkey";
            columns: ["user_id"];
            isOneToOne: false;
            referencedRelation: "profiles";
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
      streak_freeze_awards: {
        Row: {
          created_at: string;
          granted: boolean;
          user_id: string;
          xp_milestone: number;
        };
        Insert: {
          created_at?: string;
          granted: boolean;
          user_id: string;
          xp_milestone: number;
        };
        Update: {
          created_at?: string;
          granted?: boolean;
          user_id?: string;
          xp_milestone?: number;
        };
        Relationships: [
          {
            foreignKeyName: "streak_freeze_awards_user_id_fkey";
            columns: ["user_id"];
            isOneToOne: false;
            referencedRelation: "profiles";
            referencedColumns: ["id"];
          },
        ];
      };
      streak_freeze_uses: {
        Row: {
          covered_date: string;
          created_at: string;
          user_id: string;
        };
        Insert: {
          covered_date: string;
          created_at?: string;
          user_id: string;
        };
        Update: {
          covered_date?: string;
          created_at?: string;
          user_id?: string;
        };
        Relationships: [
          {
            foreignKeyName: "streak_freeze_uses_user_id_fkey";
            columns: ["user_id"];
            isOneToOne: false;
            referencedRelation: "profiles";
            referencedColumns: ["id"];
          },
        ];
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
      tags: {
        Row: {
          created_at: string;
          description: string | null;
          id: string;
          is_active: boolean;
          kind: Database["public"]["Enums"]["tag_kind"];
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
          kind?: Database["public"]["Enums"]["tag_kind"];
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
          kind?: Database["public"]["Enums"]["tag_kind"];
          name?: string;
          slug?: string;
          sort_order?: number;
          updated_at?: string;
        };
        Relationships: [];
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
      track_sections: {
        Row: {
          created_at: string;
          section_id: string;
          track_id: string;
        };
        Insert: {
          created_at?: string;
          section_id: string;
          track_id: string;
        };
        Update: {
          created_at?: string;
          section_id?: string;
          track_id?: string;
        };
        Relationships: [
          {
            foreignKeyName: "track_sections_section_id_fkey";
            columns: ["section_id"];
            isOneToOne: false;
            referencedRelation: "sections";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "track_sections_track_id_fkey";
            columns: ["track_id"];
            isOneToOne: false;
            referencedRelation: "tracks";
            referencedColumns: ["id"];
          },
        ];
      };
      tracks: {
        Row: {
          created_at: string;
          description: string | null;
          id: string;
          is_active: boolean;
          is_default: boolean;
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
          is_default?: boolean;
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
          is_default?: boolean;
          name?: string;
          slug?: string;
          sort_order?: number;
          updated_at?: string;
        };
        Relationships: [];
      };
      tutor_messages: {
        Row: {
          content: string;
          context: Database["public"]["Enums"]["attempt_context"];
          created_at: string;
          id: string;
          intent: string | null;
          model: string | null;
          question_id: string;
          role: string;
          user_id: string;
        };
        Insert: {
          content: string;
          context: Database["public"]["Enums"]["attempt_context"];
          created_at?: string;
          id?: string;
          intent?: string | null;
          model?: string | null;
          question_id: string;
          role: string;
          user_id: string;
        };
        Update: {
          content?: string;
          context?: Database["public"]["Enums"]["attempt_context"];
          created_at?: string;
          id?: string;
          intent?: string | null;
          model?: string | null;
          question_id?: string;
          role?: string;
          user_id?: string;
        };
        Relationships: [
          {
            foreignKeyName: "tutor_messages_question_id_fkey";
            columns: ["question_id"];
            isOneToOne: false;
            referencedRelation: "questions";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "tutor_messages_user_id_fkey";
            columns: ["user_id"];
            isOneToOne: false;
            referencedRelation: "profiles";
            referencedColumns: ["id"];
          },
        ];
      };
      user_badges: {
        Row: {
          awarded_at: string;
          badge: string;
          id: number;
          topic_id: string | null;
          user_id: string;
        };
        Insert: {
          awarded_at?: string;
          badge: string;
          id?: never;
          topic_id?: string | null;
          user_id: string;
        };
        Update: {
          awarded_at?: string;
          badge?: string;
          id?: never;
          topic_id?: string | null;
          user_id?: string;
        };
        Relationships: [
          {
            foreignKeyName: "user_badges_badge_fkey";
            columns: ["badge"];
            isOneToOne: false;
            referencedRelation: "badges";
            referencedColumns: ["slug"];
          },
          {
            foreignKeyName: "user_badges_topic_id_fkey";
            columns: ["topic_id"];
            isOneToOne: false;
            referencedRelation: "topics";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "user_badges_user_id_fkey";
            columns: ["user_id"];
            isOneToOne: false;
            referencedRelation: "profiles";
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
      admin_get_question: { Args: { target_question_id: string }; Returns: Json };
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
      admin_list_users: {
        Args: {
          only_banned?: boolean;
          only_role?: Database["public"]["Enums"]["user_role"];
          page_offset?: number;
          page_size?: number;
          search?: string;
          target_user_id?: string;
        };
        Returns: {
          attempts: number;
          banned_at: string;
          banned_reason: string;
          correct: number;
          created_at: string;
          current_streak: number;
          display_name: string;
          email: string;
          handle: string;
          id: string;
          last_sign_in_at: string;
          level: number;
          longest_streak: number;
          role: Database["public"]["Enums"]["user_role"];
          timezone: string;
          total_count: number;
          xp: number;
        }[];
      };
      admin_save_question: {
        Args: {
          correct_index: number;
          difficulty: Database["public"]["Enums"]["question_difficulty"];
          est_seconds: number;
          explanation: string;
          hint?: string;
          options: string[];
          stem: string;
          subtopic_id: string;
          tags?: string[];
          target_question_id: string;
        };
        Returns: Json;
      };
      admin_set_question_status: {
        Args: {
          from_status?: Database["public"]["Enums"]["question_status"];
          new_status: Database["public"]["Enums"]["question_status"];
          note?: string;
          question_ids: string[];
        };
        Returns: number;
      };
      admin_set_user_ban: { Args: { banned: boolean; reason?: string; target_user_id: string }; Returns: undefined };
      admin_set_user_role: {
        Args: { new_role: Database["public"]["Enums"]["user_role"]; target_user_id: string };
        Returns: undefined;
      };
      admin_upsert_question_answer: {
        Args: { correct_option_id: string; explanation: string; hint?: string; target_question_id: string };
        Returns: undefined;
      };
      backend_sql: { Args: { as_user?: string; statements: Json }; Returns: Json };
      finish_placement: { Args: { answers: Json; test_id: string }; Returns: Json };
      gen_claim_job: {
        Args: { p_job_id: string; p_lease_seconds: number };
        Returns: {
          batches: number;
          cancelled_by: string | null;
          created_at: string;
          created_by: string | null;
          difficulty: Database["public"]["Enums"]["question_difficulty"];
          dropped_computed: number;
          dropped_duplicate_hash: number;
          dropped_duplicate_similar: number;
          dropped_invalid: number;
          dropped_solver: number;
          finished_at: string | null;
          id: string;
          inserted: number;
          last_error: string | null;
          locked_until: string | null;
          max_batches: number;
          model: string;
          prompt_version: string;
          requested: number;
          solver_model: string;
          status: Database["public"]["Enums"]["generation_job_status"];
          subtopic_id: string;
          updated_at: string;
        };
        SetofOptions: {
          from: "*";
          to: "question_generation_jobs";
          isOneToOne: true;
          isSetofReturn: false;
        };
      };
      gen_finish_batch: {
        Args: { p_error?: string; p_job_id: string; p_stats: Json };
        Returns: {
          batches: number;
          cancelled_by: string | null;
          created_at: string;
          created_by: string | null;
          difficulty: Database["public"]["Enums"]["question_difficulty"];
          dropped_computed: number;
          dropped_duplicate_hash: number;
          dropped_duplicate_similar: number;
          dropped_invalid: number;
          dropped_solver: number;
          finished_at: string | null;
          id: string;
          inserted: number;
          last_error: string | null;
          locked_until: string | null;
          max_batches: number;
          model: string;
          prompt_version: string;
          requested: number;
          solver_model: string;
          status: Database["public"]["Enums"]["generation_job_status"];
          subtopic_id: string;
          updated_at: string;
        };
        SetofOptions: {
          from: "*";
          to: "question_generation_jobs";
          isOneToOne: true;
          isSetofReturn: false;
        };
      };
      gen_insert_question: {
        Args: {
          p_content_hash: string;
          p_correct_index: number;
          p_embedding: string;
          p_embedding_model: string;
          p_est_seconds: number;
          p_explanation: string;
          p_hint: string;
          p_job_id: string;
          p_options: string[];
          p_similarity_threshold: number;
          p_stem: string;
        };
        Returns: Json;
      };
      gen_nearest_question: {
        Args: { p_embedding: string };
        Returns: {
          question_id: string;
          similarity: number;
        }[];
      };
      gen_questions_missing_embeddings: {
        Args: { p_limit: number; p_subtopic_id: string };
        Returns: {
          options: string[];
          question_id: string;
          stem: string;
        }[];
      };
      gen_rate_limit: {
        Args: { p_bucket: string; p_max: number; p_subject: string; p_window_seconds: number };
        Returns: {
          allowed: boolean;
          retry_after_seconds: number;
        }[];
      };
      gen_store_embeddings: { Args: { p_model: string; p_rows: Json }; Returns: number };
      get_activity: { Args: { days?: number }; Returns: Json };
      get_contest: { Args: { contest_id: string }; Returns: Json };
      get_contest_standings: { Args: { contest_id: string; page_offset?: number; page_size?: number }; Returns: Json };
      get_daily_result: { Args: { target_set_id?: string }; Returns: Json };
      get_leaderboard: { Args: { board?: string; page_offset?: number; page_size?: number }; Returns: Json };
      get_mistakes: { Args: { page_offset?: number; page_size?: number }; Returns: Json };
      get_my_league: { Args: Record<PropertyKey, never>; Returns: Json };
      get_player_profile: { Args: { target_handle?: string }; Returns: Json };
      get_practice_questions: {
        Args: {
          mode?: string;
          prefer_difficulty?: Database["public"]["Enums"]["question_difficulty"];
          question_limit?: number;
          subtopic_ids?: string[];
        };
        Returns: Json;
      };
      get_practice_tree: { Args: Record<PropertyKey, never>; Returns: Json };
      get_today_set: { Args: Record<PropertyKey, never>; Returns: Json };
      give_up: {
        Args: { context?: Database["public"]["Enums"]["attempt_context"]; question_id: string };
        Returns: Json;
      };
      join_contest: { Args: { contest_id: string }; Returns: Json };
      list_contests: { Args: Record<PropertyKey, never>; Returns: Json };
      start_placement: { Args: Record<PropertyKey, never>; Returns: Json };
      submit_answer: {
        Args: {
          context: Database["public"]["Enums"]["attempt_context"];
          option_id: string;
          question_id: string;
          time_ms?: number;
        };
        Returns: Json;
      };
      submit_contest_answer: {
        Args: { contest_id: string; option_id: string; question_id: string; time_ms?: number };
        Returns: Json;
      };
      use_hint: {
        Args: { context?: Database["public"]["Enums"]["attempt_context"]; question_id: string };
        Returns: Json;
      };
    };
    Enums: {
      attempt_context: "daily" | "practice" | "assessment";
      feedback_category: "general" | "bug" | "feature" | "content" | "other";
      feedback_status: "new" | "read" | "archived";
      generation_job_status: "queued" | "running" | "done" | "failed" | "cancelled";
      league_outcome: "promoted" | "stayed" | "demoted";
      question_difficulty: "easy" | "medium" | "hard";
      question_source: "manual" | "ai" | "import";
      question_status: "draft" | "in_review" | "published" | "retired";
      report_reason: "wrong_answer" | "ambiguous" | "typo" | "duplicate" | "offensive" | "other";
      report_status: "open" | "triaged" | "resolved" | "dismissed";
      tag_kind: "exam" | "general";
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
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals;
  }
    ? keyof (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
        DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])
    : never = never,
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
  DefaultSchemaTableNameOrOptions extends keyof DefaultSchema["Tables"] | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals;
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never = never,
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
  DefaultSchemaTableNameOrOptions extends keyof DefaultSchema["Tables"] | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals;
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never = never,
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
  DefaultSchemaEnumNameOrOptions extends keyof DefaultSchema["Enums"] | { schema: keyof DatabaseWithoutInternals },
  EnumName extends DefaultSchemaEnumNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals;
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"]
    : never = never,
> = DefaultSchemaEnumNameOrOptions extends { schema: keyof DatabaseWithoutInternals }
  ? DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"][EnumName]
  : DefaultSchemaEnumNameOrOptions extends keyof DefaultSchema["Enums"]
    ? DefaultSchema["Enums"][DefaultSchemaEnumNameOrOptions]
    : never;

export type CompositeTypes<
  PublicCompositeTypeNameOrOptions extends
    | keyof DefaultSchema["CompositeTypes"]
    | { schema: keyof DatabaseWithoutInternals },
  CompositeTypeName extends PublicCompositeTypeNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals;
  }
    ? keyof DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"]
    : never = never,
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
      generation_job_status: ["queued", "running", "done", "failed", "cancelled"],
      league_outcome: ["promoted", "stayed", "demoted"],
      question_difficulty: ["easy", "medium", "hard"],
      question_source: ["manual", "ai", "import"],
      question_status: ["draft", "in_review", "published", "retired"],
      report_reason: ["wrong_answer", "ambiguous", "typo", "duplicate", "offensive", "other"],
      report_status: ["open", "triaged", "resolved", "dismissed"],
      tag_kind: ["exam", "general"],
      user_role: ["user", "admin"],
    },
  },
} as const;
