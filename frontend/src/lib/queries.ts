import { QueryClient, useInfiniteQuery, useMutation, useQuery } from '@tanstack/react-query';
import * as api from './api';
import { predictFollow, withFollowStatus } from './community';
import { errorCode } from './errors';
import type { Board, FollowStatus, Relationship } from './types';

export const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      staleTime: 30_000,
      refetchOnWindowFocus: true,
      // Don't retry permission / not-found / validation errors from the API.
      retry: (count, error) => !['42501', 'P0002', '22023', '55000', '401', 'bad_request', 'over_request_rate_limit'].includes(errorCode(error) ?? '') && count < 2,
    },
  },
});

export const keys = {
  today: ['today-set'] as const,
  dailyResult: (id: string | null) => ['daily-result', id] as const,
  activity: (days: number) => ['activity', days] as const,
  league: ['my-league'] as const,
  leaderboard: (board: Board, offset: number, friends = false) => ['leaderboard', board, offset, friends] as const,
  player: (handle: string | null) => ['player', handle] as const,
  practiceTree: ['practice-tree'] as const,
  mistakes: (offset: number) => ['mistakes', offset] as const,
  contests: ['contests'] as const,
  contest: (id: string) => ['contest', id] as const,
  standings: (id: string, friends = false) => ['contest-standings', id, friends] as const,
  followers: (handle: string) => ['users', 'followers', handle] as const,
  following: (handle: string) => ['users', 'following', handle] as const,
  search: (q: string) => ['users', 'search', q] as const,
  suggested: ['users', 'suggested'] as const,
  followRequests: ['users', 'requests'] as const,
  blocks: ['blocks'] as const,
  activityFeed: ['friend-activity'] as const,
  privacy: ['privacy'] as const,
  examTags: ['exam-tags'] as const,
  levels: ['levels'] as const,
  topics: ['topics'] as const,
  topicPreferences: ['topic-preferences'] as const,
  pushConfig: ['push-config'] as const,
  entitlements: ['entitlements'] as const,
  lastPlacement: (userId: string) => ['last-placement', userId] as const,
};

/** Everything that changes after the player answers something. */
export const invalidateProgress = () =>
  Promise.all(
    [keys.today, keys.activity(84), keys.activity(7), keys.league, keys.player(null), keys.practiceTree, ['mistakes'], ['daily-result']]
      .map((queryKey) => queryClient.invalidateQueries({ queryKey })),
  );

export const useTodaySet = () => useQuery({ queryKey: keys.today, queryFn: api.getTodaySet });
export const useDailyResult = (id: string | null, enabled = true) =>
  useQuery({ queryKey: keys.dailyResult(id), queryFn: () => api.getDailyResult(id), enabled });
export const useActivity = (days = 84) => useQuery({ queryKey: keys.activity(days), queryFn: () => api.getActivity(days) });
export const useMyLeague = ({ live = false } = {}) =>
  useQuery({ queryKey: keys.league, queryFn: api.getMyLeague, refetchInterval: live ? 20_000 : false });
export const useLeaderboard = (board: Board, offset = 0, friends = false) =>
  useQuery({
    queryKey: keys.leaderboard(board, offset, friends),
    queryFn: () => api.getLeaderboard(board, 50, offset, friends),
    placeholderData: (prev) => prev,
  });
export const usePlayer = (handle: string | null = null) =>
  useQuery({ queryKey: keys.player(handle), queryFn: () => api.getPlayerProfile(handle) });
export const usePracticeTree = () => useQuery({ queryKey: keys.practiceTree, queryFn: api.getPracticeTree });
export const useMistakes = (offset = 0) =>
  useQuery({ queryKey: keys.mistakes(offset), queryFn: () => api.getMistakes(20, offset), placeholderData: (prev) => prev });
export const useContests = () => useQuery({ queryKey: keys.contests, queryFn: api.listContests, refetchInterval: 60_000 });
export const useContest = (id: string) => useQuery({ queryKey: keys.contest(id), queryFn: () => api.getContest(id) });
export const useContestStandings = (id: string, live: boolean, friends = false) =>
  useQuery({
    queryKey: keys.standings(id, friends), queryFn: () => api.getContestStandings(id, 50, 0, friends),
    refetchInterval: live ? 15_000 : false, placeholderData: (prev) => prev,
  });
export const useExamTags = () => useQuery({ queryKey: keys.examTags, queryFn: api.getExamTags, staleTime: Infinity });
export const useLevels = () => useQuery({ queryKey: keys.levels, queryFn: api.getLevels, staleTime: Infinity });
export const useTopics = () => useQuery({ queryKey: keys.topics, queryFn: api.getTopics, staleTime: Infinity });
/** The player's plan. Defaults to the free plan until it loads, so gated UI never flashes open. */
export const useEntitlements = () => {
  const query = useQuery({ queryKey: keys.entitlements, queryFn: api.getEntitlements, staleTime: 5 * 60_000 });
  const ent = query.data;
  return {
    ...query,
    plan: ent?.plan ?? 'free',
    showAds: ent?.show_ads ?? true,
    can: (feature: string) => ent?.features?.[feature] === true || (typeof ent?.features?.[feature] === 'string' && ent.features[feature] !== ''),
    limit: (key: string): number | null => ent?.limits?.[key] ?? null,
  };
};
export const usePushConfig = () => useQuery({ queryKey: keys.pushConfig, queryFn: api.getPushConfig });
export const useTopicPreferences = () => useQuery({ queryKey: keys.topicPreferences, queryFn: api.getTopicPreferences });

// Community: follow / friends --------------------------------------------------

/** Whether the follow / friends feature is on for this player's plan (it ships dark). */
export const useCommunityEnabled = () => useEntitlements().can('community_follow');

const PEOPLE_KEYS = [['users'], ['player'], ['leaderboard'], ['contest-standings'], ['friend-activity']] as const;

export const useFollowers = (handle: string) =>
  useInfiniteQuery({
    queryKey: keys.followers(handle), initialPageParam: null as string | null,
    queryFn: ({ pageParam }) => api.getFollowers(handle, pageParam),
    getNextPageParam: (last) => last.next_cursor,
  });
export const useFollowing = (handle: string) =>
  useInfiniteQuery({
    queryKey: keys.following(handle), initialPageParam: null as string | null,
    queryFn: ({ pageParam }) => api.getFollowing(handle, pageParam),
    getNextPageParam: (last) => last.next_cursor,
  });
/** People whose handle starts with `q` (2+ characters). */
export const useUserSearch = (q: string) =>
  useInfiniteQuery({
    queryKey: keys.search(q), initialPageParam: null as string | null, enabled: q.length >= 2,
    queryFn: ({ pageParam }) => api.searchUsers(q, pageParam),
    getNextPageParam: (last) => last.next_cursor,
    staleTime: 10_000,
  });
export const useSuggestedUsers = (enabled = true) => useQuery({ queryKey: keys.suggested, queryFn: api.getSuggestedUsers, enabled });
export const useFollowRequests = () => useQuery({ queryKey: keys.followRequests, queryFn: api.getFollowRequests, refetchInterval: 60_000 });
export const useBlocks = () => useQuery({ queryKey: keys.blocks, queryFn: api.getBlocks });
export const useFriendActivity = () =>
  useInfiniteQuery({
    queryKey: keys.activityFeed, initialPageParam: null as string | null,
    queryFn: ({ pageParam }) => api.getFriendActivity(pageParam),
    getNextPageParam: (last) => last.next_cursor,
    refetchInterval: 120_000,
  });
export const usePrivacy = () => useQuery({ queryKey: keys.privacy, queryFn: api.getPrivacy });

type Snapshot = [readonly unknown[], unknown][];

/** Writes `status` for `handle` into every cached list, profile and board; returns what to put back. */
const patchFollowCaches = (handle: string, status: FollowStatus): Snapshot => {
  const snapshot: Snapshot = [];
  for (const queryKey of PEOPLE_KEYS) {
    for (const [key, data] of queryClient.getQueriesData({ queryKey })) {
      const next = withFollowStatus(data, handle, status);
      if (next === data) continue;
      snapshot.push([key, data]);
      queryClient.setQueryData(key, next);
    }
  }
  return snapshot;
};

/**
 * Follow / unfollow with an optimistic update (button, counts, boards) that is rolled
 * back if the request fails. `isPrivate` decides whether following is a request.
 */
export const useFollowAction = (handle: string, relationship: Relationship, isPrivate: boolean) =>
  useMutation({
    mutationFn: async (): Promise<FollowStatus> => {
      const wantsFollow = !relationship.following && !relationship.requested;
      return (await (wantsFollow ? api.followUser(handle) : api.unfollowUser(handle))).status;
    },
    onMutate: () => ({ snapshot: patchFollowCaches(handle, predictFollow(relationship, isPrivate)) }),
    onError: (_err, _vars, ctx) => {
      for (const [key, data] of ctx?.snapshot ?? []) queryClient.setQueryData(key, data);
    },
    onSuccess: (status) => {
      // The server's answer wins (a private account may have switched to public meanwhile).
      patchFollowCaches(handle, status);
    },
    onSettled: () => {
      void queryClient.invalidateQueries({ queryKey: keys.activityFeed });
      void queryClient.invalidateQueries({ queryKey: keys.suggested });
    },
  });

/** Everything on screen that depends on who you follow or block. */
export const invalidateSocial = () =>
  Promise.all(
    [...PEOPLE_KEYS, keys.blocks].map((queryKey) => queryClient.invalidateQueries({ queryKey })),
  );
