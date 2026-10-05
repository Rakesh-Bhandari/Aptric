import type { Database } from '@db/database.types';
import { api } from './http';
import type {
  Activity, AnswerResult, AttemptContext, Board, CatalogTopic, ContestAnswerResult, ContestDetail, ContestStandings,
  ContestSummary, ContestViolation, DailyResult, Difficulty, ExamTag, HintResult, Leaderboard, Mistakes, MyLeague,
  PlacementAnswer, PlacementResult, PlacementStart, PlayerProfile, PracticeBatch, PracticeMode, Profile,
  SectionNode, TodaySet, TopicPreferences, Entitlements,
} from './types';

type Functions = Database['public']['Functions'];

// Every game rule (grading, hints, XP, streaks, levels) lives in Postgres; the
// API's POST /rpc/:name runs those SQL functions as the signed-in user. These
// are thin typed wrappers. The client never sees an answer before it has spent
// its one scoring attempt.
const rpc = <T, F extends keyof Functions = keyof Functions>(fn: F, args?: Functions[F]['Args']): Promise<T> =>
  api<T>('POST', `/rpc/${fn as string}`, args ?? {});

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
export const getQuestionSubtopic = async (questionId: string): Promise<string | null> =>
  (await api<{ subtopic_id: string | null }>('GET', `/questions/${encodeURIComponent(questionId)}/subtopic`)).subtopic_id;

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

// Contests -------------------------------------------------------------------
export const listContests = () => rpc<ContestSummary[]>('list_contests');
export const getContest = (id: string) => rpc<ContestDetail>('get_contest', { contest_id: id });
export const joinContest = (id: string) => rpc<ContestSummary>('join_contest', { contest_id: id });
export const submitContestAnswer = (p: { contestId: string; questionId: string; optionId: string; timeMs: number | null }) =>
  rpc<ContestAnswerResult>('submit_contest_answer', {
    contest_id: p.contestId, question_id: p.questionId, option_id: p.optionId, time_ms: p.timeMs ?? undefined,
  });
/** Closes the attempt (idempotent): the first call records the reason, later ones change nothing. */
export const finishContest = (contestId: string, violation?: ContestViolation) =>
  rpc<ContestSummary>('finish_contest', { contest_id: contestId, violation });
export const getContestStandings = (id: string, pageSize = 50, offset = 0) =>
  rpc<ContestStandings>('get_contest_standings', { contest_id: id, page_size: pageSize, page_offset: offset });

// Profile and settings -------------------------------------------------------
export const fetchProfile = (): Promise<Profile> => api<Profile>('GET', '/me/profile');

export type ProfilePatch = Partial<
  Pick<Profile, 'handle' | 'display_name' | 'bio' | 'timezone' | 'exam_goal' | 'daily_target' | 'onboarded_at' | 'detect_tab_switches_practice'>
>;

export const updateProfile = (patch: ProfilePatch): Promise<Profile> => api<Profile>('PATCH', '/me/profile', patch);

export const getExamTags = (): Promise<ExamTag[]> => api<ExamTag[]>('GET', '/catalog/exam-tags');

export const getLastPlacement = () =>
  api<{ completed_at: string | null; placed_level: number | null; correct: number | null; score: number | null } | null>(
    'GET', '/me/placement',
  );

export const getTopics = () => api<CatalogTopic[]>('GET', '/catalog/topics');

export const getTopicPreferences = () => api<TopicPreferences>('GET', '/me/preferences');

export const saveTopicPreferences = (prefs: TopicPreferences) => api<TopicPreferences>('PATCH', '/me/preferences', prefs);

// Push notifications ---------------------------------------------------------
export type PushPreferences = { daily: boolean; streak: boolean; contests: boolean; league: boolean };
export type PushConfig = { enabled: boolean; publicKey: string | null; preferences: PushPreferences };
export type PushSubscriptionJSON = { endpoint: string; keys: { p256dh: string; auth: string } };

export const getPushConfig = () => api<PushConfig>('GET', '/push/config');
export const subscribePush = (sub: PushSubscriptionJSON) => api<null>('POST', '/push/subscribe', sub);
export const unsubscribePush = (endpoint: string) => api<null>('POST', '/push/unsubscribe', { endpoint });
export const savePushPreferences = (prefs: Partial<PushPreferences>) => api<PushPreferences>('PATCH', '/push/preferences', prefs);
export const sendTestPush = () => api<{ sent: number }>('POST', '/push/test', {});

export const getEntitlements = () => api<Entitlements>('GET', '/me/entitlements');

export const getLevels = () => api<{ level: number; name: string; slug: string }[]>('GET', '/catalog/levels');

export type ReportReason = Database['public']['Enums']['report_reason'];

export const reportQuestion = async (questionId: string, reason: ReportReason, details: string) => {
  await api('POST', '/reports', { question_id: questionId, reason, details: details || null });
};

export type FeedbackCategory = Database['public']['Enums']['feedback_category'];

export const sendFeedback = async (category: FeedbackCategory, message: string, page: string) => {
  await api('POST', '/feedback', { category, message, page });
};
