import type { Database } from '@db/database.types';
import { supabase } from './supabase';
import type {
  Activity, AnswerResult, AttemptContext, Board, ContestAnswerResult, ContestDetail, ContestStandings,
  ContestSummary, DailyResult, Difficulty, ExamTag, HintResult, Leaderboard, Mistakes, MyLeague,
  PlacementAnswer, PlacementResult, PlacementStart, PlayerProfile, PracticeBatch, PracticeMode, Profile,
  SectionNode, TodaySet,
} from './types';

type Functions = Database['public']['Functions'];

// Every game rule (grading, hints, XP, streaks, levels) lives in Postgres; these
// are thin typed wrappers. The client never sees an answer before it has spent
// its one scoring attempt.
async function rpc<T, F extends keyof Functions = keyof Functions>(fn: F, args?: Functions[F]['Args']): Promise<T> {
  // supabase-js's overloads can't follow a generic function name, hence the casts.
  const { data, error } = await (supabase.rpc as (f: string, a?: object) => ReturnType<typeof supabase.rpc>)(
    fn as string,
    args as object | undefined,
  );
  if (error) throw error;
  return data as T;
}

// Daily challenge ----------------------------------------------------------
export const getTodaySet = () => rpc<TodaySet>('get_today_set');
export const getDailyResult = (dailySetId: string | null = null) =>
  rpc<DailyResult>('get_daily_result', dailySetId ? { target_set_id: dailySetId } : {});

// Answering (daily and practice) ---------------------------------------------
export const submitAnswer = (p: { questionId: string; optionId: string; context: AttemptContext; timeMs: number | null }) =>
  rpc<AnswerResult>('submit_answer', {
    question_id: p.questionId, option_id: p.optionId, context: p.context, time_ms: p.timeMs ?? undefined,
  });
export const requestHint = (p: { questionId: string; context: AttemptContext }) =>
  rpc<HintResult>('use_hint', { question_id: p.questionId, context: p.context });
export const giveUp = (p: { questionId: string; context: AttemptContext }) =>
  rpc<AnswerResult>('give_up', { question_id: p.questionId, context: p.context });

// Practice -------------------------------------------------------------------
export const getPracticeTree = () => rpc<SectionNode[]>('get_practice_tree');
export const getPracticeQuestions = (p: {
  subtopicIds?: string[] | null; difficulty?: Difficulty | null; mode?: PracticeMode; limit?: number;
}) =>
  rpc<PracticeBatch>('get_practice_questions', {
    subtopic_ids: p.subtopicIds?.length ? p.subtopicIds : undefined,
    prefer_difficulty: p.difficulty ?? undefined,
    mode: p.mode ?? 'normal',
    question_limit: p.limit ?? 10,
  });
export const getMistakes = (pageSize = 20, offset = 0) =>
  rpc<Mistakes>('get_mistakes', { page_size: pageSize, page_offset: offset });
export const getActivity = (days = 84) => rpc<Activity>('get_activity', { days });

/** Subtopic of a question the player can read (published, or one they attempted). */
export const getQuestionSubtopic = async (questionId: string): Promise<string | null> => {
  const { data, error } = await supabase.from('questions').select('subtopic_id').eq('id', questionId).maybeSingle();
  if (error) throw error;
  return data?.subtopic_id ?? null;
};

// Placement ------------------------------------------------------------------
export const startPlacement = () => rpc<PlacementStart>('start_placement');
export const finishPlacement = (testId: string, answers: PlacementAnswer[]) =>
  rpc<PlacementResult>('finish_placement', { test_id: testId, answers: answers as unknown as Functions['finish_placement']['Args']['answers'] });

// Standings ------------------------------------------------------------------
export const getMyLeague = () => rpc<MyLeague>('get_my_league');
export const getLeaderboard = (board: Board, pageSize = 50, offset = 0) =>
  rpc<Leaderboard>('get_leaderboard', { board, page_size: pageSize, page_offset: offset });
export const getPlayerProfile = (handle: string | null = null) =>
  rpc<PlayerProfile>('get_player_profile', handle ? { target_handle: handle } : {});

/**
 * Live league standings: the database broadcasts every XP change on the
 * private channel `league:<id>` (members only). Returns an unsubscribe function.
 */
export const subscribeToLeague = (leagueId: string, onUpdate: () => void) => {
  const channel = supabase
    .channel(`league:${leagueId}`, { config: { private: true } })
    .on('broadcast', { event: 'member_xp' }, () => onUpdate());
  let active = true;
  // Private channels authorise with the user's JWT.
  void supabase.realtime.setAuth().finally(() => {
    if (active) channel.subscribe();
  });
  return () => {
    active = false;
    void supabase.removeChannel(channel);
  };
};

// Contests -------------------------------------------------------------------
export const listContests = () => rpc<ContestSummary[]>('list_contests');
export const getContest = (id: string) => rpc<ContestDetail>('get_contest', { contest_id: id });
export const joinContest = (id: string) => rpc<ContestSummary>('join_contest', { contest_id: id });
export const submitContestAnswer = (p: { contestId: string; questionId: string; optionId: string; timeMs: number | null }) =>
  rpc<ContestAnswerResult>('submit_contest_answer', {
    contest_id: p.contestId, question_id: p.questionId, option_id: p.optionId, time_ms: p.timeMs ?? undefined,
  });
export const getContestStandings = (id: string, pageSize = 50, offset = 0) =>
  rpc<ContestStandings>('get_contest_standings', { contest_id: id, page_size: pageSize, page_offset: offset });

// Profile and settings -------------------------------------------------------
export const PROFILE_COLUMNS =
  'id, handle, display_name, avatar_url, bio, role, timezone, exam_goal, daily_target, onboarded_at, placement_level, placed_at';

export const fetchProfile = async (id: string): Promise<Profile> => {
  const { data, error } = await supabase.from('profiles').select(PROFILE_COLUMNS).eq('id', id).single();
  if (error) throw error;
  return data as Profile;
};

export type ProfilePatch = Partial<
  Pick<Profile, 'handle' | 'display_name' | 'bio' | 'timezone' | 'exam_goal' | 'daily_target' | 'onboarded_at'>
>;

export const updateProfile = async (id: string, patch: ProfilePatch): Promise<Profile> => {
  const { data, error } = await supabase.from('profiles').update(patch).eq('id', id).select(PROFILE_COLUMNS).single();
  if (error) throw error;
  return data as Profile;
};

export const getExamTags = async (): Promise<ExamTag[]> => {
  const { data, error } = await supabase.from('tags').select('slug, name').eq('kind', 'exam').order('sort_order');
  if (error) throw error;
  return data ?? [];
};

export const getLastPlacement = async (userId: string) => {
  const { data, error } = await supabase
    .from('placement_tests')
    .select('completed_at, placed_level, correct, score')
    .eq('user_id', userId)
    .not('completed_at', 'is', null)
    .order('completed_at', { ascending: false })
    .limit(1)
    .maybeSingle();
  if (error) throw error;
  return data;
};

export const getLevels = async () => {
  const { data, error } = await supabase.from('levels').select('level, name, slug').order('level');
  if (error) throw error;
  return data ?? [];
};

export type ReportReason = Database['public']['Enums']['report_reason'];

export const reportQuestion = async (questionId: string, reason: ReportReason, details: string) => {
  const { error } = await supabase.from('reports').insert({ question_id: questionId, reason, details: details || null });
  if (error) throw error;
};

export type FeedbackCategory = Database['public']['Enums']['feedback_category'];

export const sendFeedback = async (category: FeedbackCategory, message: string, page: string) => {
  const { error } = await supabase.from('feedback').insert({ category, message, page });
  if (error) throw error;
};
