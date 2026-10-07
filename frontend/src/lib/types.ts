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
  /** Whether you follow this player (the Follow button). */
  following?: boolean;
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
  /** null when the player's accuracy is hidden from you (stats_hidden). */
  solved: number | null;
  attempts: number | null;
  correct: number | null;
  sections: { name: string; attempted: number; correct: number }[];
  badges: Badge[];
  stats_hidden: boolean;
  /** Only when the player lets you see their exam target. */
  exam_goal: string | null;
  is_private: boolean;
  follower_count: number;
  following_count: number;
  relationship: Relationship;
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
  /** The XP level (profiles.level) after placement; placement lifts it to the band's floor. */
  profile_level?: number;
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

/** Why a contest attempt was ended automatically (recorded server-side). */
export type ContestViolation = 'tab_hidden' | 'window_blur' | 'fullscreen_exit' | 'page_left';

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
  /** Set once the attempt is closed; answers are refused after that. */
  finished_at: string | null;
  violation: ContestViolation | null;
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
  /** Whether you follow this player. */
  following?: boolean;
}

export interface ContestStandings {
  total: number;
  entries: ContestStanding[];
  me: Omit<ContestStanding, 'user_id' | 'handle' | 'display_name' | 'avatar_url' | 'is_me' | 'following'> | null;
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
  /** Practice only: Daily and contests always detect tab switches. */
  detect_tab_switches_practice: boolean;
}

/** An active topic with published questions, for the daily-set preferences. */
export interface CatalogTopic {
  id: string;
  name: string;
  section_id: string;
  section: string;
  questions: number;
}

/** Topics the daily set leans towards, and topics it never uses (unless nothing else is left). */
export interface TopicPreferences {
  preferred_topic_ids: string[];
  excluded_topic_ids: string[];
}

/** The signed-in player's plan (GET /me/entitlements): switches and limits set per plan in Postgres. */
export interface Entitlements {
  plan: string;
  name: string;
  features: Record<string, boolean | string>;
  limits: Record<string, number>;
  /** Free plans show ads; paid plans don't. */
  show_ads: boolean;
}

// Community: follow / friends ------------------------------------------------

export type VisibilityLevel = 'everyone' | 'followers' | 'friends' | 'nobody';

/** How the signed-in player relates to someone else. */
export interface Relationship {
  is_me: boolean;
  following: boolean;
  followed_by: boolean;
  /** Mutual follows. */
  friend: boolean;
  /** A follow request is waiting (or was declined, which reads the same). */
  requested: boolean;
}

/** The small public card used by search, follower lists and the activity feed. */
export interface UserCard {
  handle: string;
  /** Only when the player chose to show their name. */
  display_name: string | null;
  avatar_url: string | null;
  level: number;
  current_streak: number;
  is_private: boolean;
  league_tier: { tier: number; slug: string; name: string } | null;
  relationship: Relationship;
}

export interface UserPage {
  restricted?: boolean;
  items: UserCard[];
  next_cursor: string | null;
}

export interface FollowRequest extends UserCard {
  id: string;
  requested_at: string;
}

export type FollowStatus = 'following' | 'requested' | 'none';

export type ActivityKind = 'daily_set' | 'league_up' | 'streak' | 'challenge_won';

export interface ActivityItem {
  id: number;
  kind: ActivityKind;
  data: Record<string, unknown>;
  created_at: string;
  user: UserCard;
}

export interface ActivityPage {
  items: ActivityItem[];
  next_cursor: string | null;
}

export interface BlockedUser {
  handle: string;
  avatar_url: string | null;
  blocked_at: string;
}

export interface Privacy {
  is_private: boolean;
  stats_visibility: VisibilityLevel;
  exam_visibility: VisibilityLevel;
  college_visibility: VisibilityLevel;
  name_visibility: VisibilityLevel;
  share_activity: boolean;
  discoverable: boolean;
}

export type UserReportReason = 'spam' | 'abuse' | 'impersonation' | 'personal_info' | 'other';

// Community: 48-hour posts -----------------------------------------------------

export type PostKind = 'question' | 'tip' | 'win' | 'study_buddy' | 'poll';
export type Reaction = 'up' | 'fire' | 'idea';
export type FeedName = 'following' | 'topic' | 'everyone' | 'mine';
export type FeedSort = 'new' | 'hot';
export type PostReportReason = 'spam' | 'abuse' | 'answer_leak' | 'personal_info' | 'other';

/** A question a post links to: its stem only, never the options or the answer. */
export interface PostQuestion {
  id: string;
  stem: string;
  difficulty: Difficulty;
  subtopic_id: string;
  attempted: boolean;
}

export interface Post {
  id: string;
  kind: PostKind;
  /** null while a spoiler is locked: you have not attempted the linked question yet. */
  body: string | null;
  spoiler: boolean;
  spoiler_locked: boolean;
  question: PostQuestion | null;
  topic: { id: string; name: string } | null;
  exam_tag: string | null;
  poll: { options: { text: string; votes: number }[]; my_vote: number | null } | null;
  created_at: string;
  /** created_at + 48 hours. The post is gone from every feed when this passes. */
  expires_at: string;
  like_count: number;
  reply_count: number;
  my_reaction: Reaction | null;
  is_mine: boolean;
  /** Only on your own posts: 'hidden' means waiting for a moderator. */
  status: 'visible' | 'hidden' | 'removed' | null;
  /** Verified authors may include links. */
  author_verified: boolean;
  author: UserCard;
}

export interface PostPage {
  items: Post[];
  next_cursor: string | null;
  /** The server's clock when the page was built, for the countdown. */
  server_now: string;
}

export interface Reply {
  id: string;
  post_id: string;
  body: string;
  created_at: string;
  expires_at: string;
  is_mine: boolean;
  can_delete: boolean;
  author: UserCard;
}

export interface ReplyPage {
  items: Reply[];
  next_cursor: string | null;
  server_now: string;
}

export interface NewPost {
  kind: PostKind;
  body: string;
  question_id?: string;
  topic_id?: string;
  exam_tag?: string;
  contains_spoiler?: boolean;
  poll_options?: string[];
}

export interface MutedUser {
  handle: string;
  avatar_url: string | null;
  muted_at: string;
}

/** One reported (or hidden / removed) post in the admin queue. */
export interface AdminPostReport {
  id: string;
  kind: PostKind;
  body: string;
  status: 'visible' | 'hidden' | 'removed';
  report_count: number;
  created_at: string;
  expires_at: string;
  reviewed_at: string | null;
  question_id: string | null;
  author: { id: string; handle: string; strikes_30d: number };
  reports: { reason: PostReportReason; count: number }[];
}

// Community: 1v1 challenges ----------------------------------------------------

export type ChallengeStatus = 'pending' | 'accepted' | 'completed' | 'declined' | 'expired' | 'cancelled';
export type ChallengeSetKind = 'daily' | 'practice_topic' | 'custom_set';
export type ChallengeTab = 'incoming' | 'outgoing' | 'completed';

export interface ChallengeSide {
  score: number;
  time_ms: number;
  hints: number;
}

/** A challenge as you may see it. The question list is never in here. */
export interface Challenge {
  id: string;
  status: ChallengeStatus;
  /** The challenger is still playing their own set; nobody else can see it yet. */
  draft: boolean;
  role: 'challenger' | 'opponent' | 'viewer';
  set_kind: ChallengeSetKind;
  question_count: number;
  challenger: UserCard;
  opponent: UserCard | null;
  /** The challenger's locked-in result: what the opponent has to beat. */
  target: { score: number; total: number; time_ms: number } | null;
  created_at: string;
  sent_at: string | null;
  accept_by: string | null;
  accepted_at: string | null;
  complete_by: string | null;
  completed_at: string | null;
  rematch_of: string | null;
  /** Only the challenger gets the link token. */
  share_token: string | null;
  my_run: { started_at: string; deadline_at: string; finished_at: string | null; violation: string | null; answered: number } | null;
  result: { winner: 'challenger' | 'opponent' | 'draw'; challenger: ChallengeSide; opponent: ChallengeSide } | null;
  can_accept: boolean;
  server_now: string;
}

export interface ChallengeReviewItem {
  question: QuestionCard;
  correct_option_id: string;
  explanation: string;
  mine: { selected_option_id: string | null; is_correct: boolean } | null;
}

export interface ChallengeDetail extends Challenge {
  /** Once your own run is over: the questions with the key and your answers. */
  review: ChallengeReviewItem[] | null;
}

export interface ChallengeQuestion extends QuestionCard {
  position: number;
  answer: { selected_option_id: string | null; is_correct: boolean } | null;
  hint_used: boolean;
  correct_option_id: string | null;
  explanation: string | null;
}

export interface ChallengeRun {
  challenge: Challenge;
  run: { started_at: string; deadline_at: string; finished_at: string | null; violation: string | null };
  questions: ChallengeQuestion[];
  server_now: string;
}

export interface ChallengePage {
  items: Challenge[];
  next_cursor: string | null;
  server_now: string;
}

export interface ChallengeAnswerResult {
  is_correct: boolean;
  answered: number;
  finished: boolean;
  challenge: Challenge;
}
