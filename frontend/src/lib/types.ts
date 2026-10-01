// Shapes of the JSON the Supabase RPCs return (see supabase/migrations).

export type Difficulty = 'easy' | 'medium' | 'hard';
export type AttemptContext = 'daily' | 'practice' | 'assessment';

export interface Ref {
  id: string;
  name: string;
}

export interface QuestionOption {
  id: string;
  position: number;
  body: string;
}

/** A question as the player sees it before answering (private.question_card). */
export interface QuestionCard {
  id: string;
  stem: string;
  difficulty: Difficulty;
  est_seconds: number;
  section: Ref;
  topic: Ref;
  subtopic: Ref;
  has_hint: boolean;
  options: QuestionOption[];
}

export interface DailyAttempt {
  selected_option_id: string | null;
  is_correct: boolean;
  gave_up: boolean;
  used_hint: boolean;
  xp_awarded: number;
}

export interface DailyQuestion {
  id: string;
  position: number;
  stem: string;
  difficulty: Difficulty;
  est_seconds: number;
  section: string;
  topic: string;
  subtopic: string;
  has_hint: boolean;
  hint: string | null;
  hint_used: boolean;
  options: QuestionOption[];
  attempt: DailyAttempt | null;
}

export interface TodaySet {
  set_date: string;
  track: { id: string; slug: string; name: string } | null;
  daily_set_id: string | null;
  title: string | null;
  questions: DailyQuestion[];
}

export interface Badge {
  slug: string;
  name: string;
  icon: string;
  description: string;
  topic: string | null;
  awarded_at?: string;
}

export interface Progress {
  xp: number;
  level: number;
  leveled_up: boolean;
  next_level_xp: number;
  rating: number;
  streak_freezes: number;
  freezes_earned: number;
  set_complete: boolean;
  bonus_xp: number;
  rating_change: { before: number; after: number; delta: number } | null;
  new_badges: Badge[];
}

export interface AnswerResult {
  attempt_id: string;
  context: AttemptContext;
  is_correct: boolean;
  correct_option_id: string;
  explanation: string;
  xp_awarded: number;
  used_hint: boolean;
  current_streak: number;
  longest_streak: number;
  progress?: Progress;
}

export interface HintResult {
  context: AttemptContext;
  hint: string | null;
  charged: boolean;
}

export type Outcome = 'correct' | 'hinted' | 'wrong' | 'gave_up' | 'unanswered';

export interface DailyResult {
  daily_set_id: string;
  set_date: string;
  track: { slug: string; name: string };
  level: { level: number; name: string | null };
  handle: string | null;
  display_name: string | null;
  player_level: number;
  total: number;
  answered: number;
  correct: number;
  complete: boolean;
  time_ms: number | null;
  xp_earned: number;
  questions: { position: number; difficulty: Difficulty; outcome: Outcome; time_ms: number | null; xp: number }[];
  rating: { before: number; after: number; delta: number } | null;
  current_streak: number;
  longest_streak: number;
  league: { tier: string; name: string; rank: number; members: number } | null;
}

export interface LeagueTier {
  tier: number;
  slug: string;
  name: string;
  promote_count: number;
  demote_count: number;
}

export interface LeagueMember {
  rank: number;
  user_id: string;
  handle: string | null;
  display_name: string | null;
  avatar_url: string | null;
  xp: number;
  is_me: boolean;
}

export interface MyLeague {
  week_start: string;
  week_ends_at: string;
  league_id: string | null;
  tier: LeagueTier;
  promote_zone: number;
  demote_zone: number;
  members: LeagueMember[];
  last_result: { week_start: string; tier: number; final_rank: number; outcome: 'promoted' | 'stayed' | 'demoted' } | null;
}

export type Board = 'weekly' | 'all_time' | 'rating';

export interface LeaderboardEntry {
  rank: number;
  user_id: string;
  handle: string | null;
  display_name: string | null;
  avatar_url: string | null;
  level: number;
  xp?: number;
  weekly_xp?: number;
  rating: number;
  current_streak: number;
  league_tier: number;
  is_me?: boolean;
}

export interface Leaderboard {
  board: Board;
  refreshed_at: string | null;
  total: number;
  entries: LeaderboardEntry[];
  me: LeaderboardEntry | null;
}

export interface PlayerProfile {
  user_id: string;
  handle: string | null;
  display_name: string | null;
  avatar_url: string | null;
  bio: string | null;
  joined_at: string;
  is_me: boolean;
  level: number;
  xp: number;
  level_xp: number;
  next_level_xp: number;
  rating: number;
  rated_sets: number;
  current_streak: number;
  longest_streak: number;
  streak_freezes: number | null;
  max_streak_freezes: number | null;
  next_freeze_xp: number | null;
  league_tier: { tier: number; slug: string; name: string } | null;
  solved: number;
  attempts: number;
  correct: number;
  sections: { name: string; attempted: number; correct: number }[];
  badges: Badge[];
}

export interface PlacementStart {
  test_id: string;
  started_at: string;
  questions: QuestionCard[];
}

export interface PlacementAnswer {
  question_id: string;
  option_id: string | null;
  time_ms: number | null;
}

export interface PlacementResult {
  test_id: string;
  correct: number;
  total: number;
  score: number;
  level: { level: number; slug: string; name: string };
  results: {
    question_id: string;
    difficulty: Difficulty;
    selected_option_id: string | null;
    correct_option_id: string;
    is_correct: boolean;
    explanation: string;
  }[];
}

export interface MasteryNode {
  id: string;
  slug: string;
  name: string;
  available: number;
  attempted: number;
  correct: number;
  stars: number;
}

export interface SubtopicNode extends MasteryNode {
  weak: boolean;
}

export interface TopicNode extends MasteryNode {
  subtopics: SubtopicNode[];
}

export interface SectionNode extends MasteryNode {
  description: string | null;
  topics: TopicNode[];
}

export type PracticeMode = 'normal' | 'weak';

export interface PracticeBatch {
  mode: PracticeMode;
  subtopics: Ref[];
  questions: QuestionCard[];
}

export interface Mistake extends QuestionCard {
  attempt_id: string;
  context: AttemptContext;
  answered_at: string;
  selected_option_id: string | null;
  gave_up: boolean;
  correct_option_id: string;
  explanation: string;
  hint: string | null;
  resolved: boolean;
  can_retry: boolean;
}

export interface Mistakes {
  total: number;
  resolved: number;
  entries: Mistake[];
}

export interface ActivityDay {
  date: string;
  attempted: number;
  correct: number;
  xp: number;
  time_ms: number;
}

export interface Activity {
  today: string;
  daily_target: number;
  today_count: number;
  days: ActivityDay[];
  recent_sets: { daily_set_id: string; set_date: string; total: number; answered: number; correct: number; xp: number }[];
}

export type ContestState = 'upcoming' | 'live' | 'ended';

export interface ContestEntry {
  score: number;
  correct: number;
  answered: number;
  time_ms: number;
  rank: number;
}

export interface ContestSummary {
  id: string;
  slug: string;
  title: string;
  description: string | null;
  starts_at: string;
  ends_at: string;
  state: ContestState;
  question_count: number;
  participants: number;
  my_entry: ContestEntry | null;
}

export interface ContestQuestion extends QuestionCard {
  position: number;
  answer: { selected_option_id: string | null; is_correct: boolean; points: number } | null;
  correct_option_id: string | null;
  explanation: string | null;
}

export interface ContestDetail extends ContestSummary {
  joined: boolean;
  questions: ContestQuestion[] | null;
}

export interface ContestAnswerResult extends ContestSummary {
  is_correct: boolean;
  points: number;
}

export interface ContestStanding {
  rank: number;
  user_id: string;
  handle: string | null;
  display_name: string | null;
  avatar_url: string | null;
  score: number;
  correct: number;
  answered: number;
  time_ms: number;
  is_me: boolean;
}

export interface ContestStandings {
  total: number;
  entries: ContestStanding[];
  me: Omit<ContestStanding, 'user_id' | 'handle' | 'display_name' | 'avatar_url' | 'is_me'> | null;
}

export interface ExamTag {
  slug: string;
  name: string;
}

export interface Profile {
  id: string;
  handle: string | null;
  display_name: string | null;
  avatar_url: string | null;
  bio: string | null;
  role: 'user' | 'admin';
  timezone: string;
  exam_goal: string | null;
  daily_target: number;
  onboarded_at: string | null;
  placement_level: number | null;
  placed_at: string | null;
}
