import type { Database } from '@db/database.types';
import { api } from './http';
import type {
  Challenge, ChallengeAnswerResult, ChallengeDetail, ChallengePage, ChallengeRun, ChallengeSetKind, ChallengeTab, ContestViolation as RunViolation,
  FeedName, FeedSort, MutedUser, NewPost, Post, PostPage, PostReportReason, Reaction, Reply, ReplyPage,
  ActivityPage, BlockedUser, FollowRequest, FollowStatus, Privacy, UserPage, UserReportReason, VisibilityLevel,
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
export const getLeaderboard = (board: Board, pageSize = 50, offset = 0, friendsOnly = false) =>
  rpc<Leaderboard>('get_leaderboard', { board, page_size: pageSize, page_offset: offset, friends_only: friendsOnly || undefined });
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
export const getContestStandings = (id: string, pageSize = 50, offset = 0, friendsOnly = false) =>
  rpc<ContestStandings>('get_contest_standings', {
    contest_id: id, page_size: pageSize, page_offset: offset, friends_only: friendsOnly || undefined,
  });

// Community: follow / friends --------------------------------------------------
export const followUser = (handle: string) => rpc<{ status: FollowStatus }>('follow_user', { target_handle: handle });
export const unfollowUser = (handle: string) => rpc<{ status: FollowStatus }>('unfollow_user', { target_handle: handle });
export const removeFollower = (handle: string) => rpc<{ status: 'removed' }>('remove_follower', { target_handle: handle });
export const respondFollowRequest = (id: string, accept: boolean) =>
  rpc<{ status: 'accepted' | 'declined' }>('respond_follow_request', { request_id: id, accept });
export const getFollowRequests = () => rpc<{ items: FollowRequest[] }>('get_follow_requests');
export const blockUser = (handle: string) => rpc<{ blocked: true }>('block_user', { target_handle: handle });
export const unblockUser = (handle: string) => rpc<{ blocked: false }>('unblock_user', { target_handle: handle });
export const getBlocks = () => rpc<{ items: BlockedUser[] }>('get_blocks');
export const reportUser = (handle: string, reason: UserReportReason, details?: string) =>
  rpc<{ ok: true }>('report_user', { target_handle: handle, reason, details: details?.trim() || undefined });
export const getFollowers = (handle: string, cursor: string | null = null) =>
  rpc<UserPage>('get_followers', { target_handle: handle, cursor: cursor ?? undefined });
export const getFollowing = (handle: string, cursor: string | null = null) =>
  rpc<UserPage>('get_following', { target_handle: handle, cursor: cursor ?? undefined });
export const searchUsers = (q: string, cursor: string | null = null) =>
  rpc<UserPage>('search_users', { q, cursor: cursor ?? undefined });
export const getSuggestedUsers = () => rpc<{ items: UserPage['items'] }>('get_suggested_users');
export const getFriendActivity = (cursor: string | null = null) =>
  rpc<ActivityPage>('get_friend_activity', { cursor: cursor ?? undefined });
export const getPrivacy = () => rpc<Privacy>('get_privacy');
export const setPrivacy = (patch: Partial<Privacy>) =>
  rpc<Privacy>('set_privacy', patch as Functions['set_privacy']['Args']);
export type { VisibilityLevel };
export const muteUser = (handle: string) => rpc<{ muted: true }>('mute_user', { target_handle: handle });
export const unmuteUser = (handle: string) => rpc<{ muted: false }>('unmute_user', { target_handle: handle });
export const getMutes = () => rpc<{ items: MutedUser[] }>('get_mutes');

// Community: 48-hour posts ------------------------------------------------------
export const getFeed = (p: { feed: FeedName; sort: FeedSort; topicId?: string | null; cursor?: string | null }) =>
  rpc<PostPage>('get_feed', { feed: p.feed, sort: p.sort, topic_id: p.topicId ?? undefined, cursor: p.cursor ?? undefined });
export const getPost = (id: string) => rpc<{ post: Post; server_now: string }>('get_post', { target_post_id: id });
export const createPost = (post: NewPost) =>
  rpc<{ post: Post; server_now: string }>('create_post', post as Functions['create_post']['Args']);
export const deletePost = (id: string) => rpc<{ deleted: true }>('delete_post', { target_post_id: id });
export const getReplies = (postId: string, cursor: string | null = null) =>
  rpc<ReplyPage>('get_replies', { target_post_id: postId, cursor: cursor ?? undefined });
export const createReply = (postId: string, body: string) => rpc<Reply>('create_reply', { target_post_id: postId, body });
export const deleteReply = (id: string) => rpc<{ deleted: true }>('delete_reply', { target_reply_id: id });
export const reactPost = (id: string, reaction: Reaction | null) =>
  rpc<{ like_count: number; my_reaction: Reaction | null }>('react_post', { target_post_id: id, reaction: reaction ?? undefined });
export const votePoll = (id: string, option: number) => rpc<Post['poll']>('vote_poll', { target_post_id: id, option_idx: option });
export const reportPost = (id: string, reason: PostReportReason, details?: string) =>
  rpc<{ ok: true }>('report_post', { target_post_id: id, reason, details: details?.trim() || undefined });

// Community: 1v1 challenges ---------------------------------------------------------
export const createChallenge = (p: { setKind: ChallengeSetKind; setRef?: string; opponent?: string; questionIds?: string[] }) =>
  rpc<Challenge>('create_challenge', { set_kind: p.setKind, set_ref: p.setRef, opponent_handle: p.opponent, question_ids: p.questionIds });
export const startChallengeRun = (id: string) => rpc<ChallengeRun>('start_challenge_run', { target_challenge_id: id });
export const acceptChallenge = (p: { id?: string; token?: string }) =>
  rpc<ChallengeRun>('accept_challenge', { target_challenge_id: p.id, token: p.token });
export const declineChallenge = (id: string) => rpc<Challenge>('decline_challenge', { target_challenge_id: id });
export const cancelChallenge = (id: string) => rpc<Challenge>('cancel_challenge', { target_challenge_id: id });
export const getChallengeRun = (id: string) => rpc<ChallengeRun>('get_challenge_run', { target_challenge_id: id });
export const submitChallengeAnswer = (p: { id: string; questionId: string; optionId: string }) =>
  rpc<ChallengeAnswerResult>('submit_challenge_answer', { target_challenge_id: p.id, question_id: p.questionId, option_id: p.optionId });
export const finishChallengeRun = (id: string, violation?: RunViolation) =>
  rpc<Challenge>('finish_challenge_run', { target_challenge_id: id, violation });
export const getChallenge = (p: { id?: string; token?: string }) =>
  rpc<ChallengeDetail>('get_challenge', { target_challenge_id: p.id, token: p.token });
export const listChallenges = (tab: ChallengeTab, cursor: string | null = null) =>
  rpc<ChallengePage>('list_challenges', { tab, cursor: cursor ?? undefined });
export const requestRematch = (id: string) => rpc<Challenge>('request_rematch', { target_challenge_id: id });

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
export type PushPreferences = { daily: boolean; streak: boolean; contests: boolean; league: boolean; social: boolean; post_expiry: boolean; challenges: boolean };
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
