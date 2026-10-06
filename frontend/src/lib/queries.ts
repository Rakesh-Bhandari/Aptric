import { QueryClient, useQuery } from '@tanstack/react-query';
import * as api from './api';
import { errorCode } from './errors';
import type { Board } from './types';

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
  leaderboard: (board: Board, offset: number) => ['leaderboard', board, offset] as const,
  player: (handle: string | null) => ['player', handle] as const,
  practiceTree: ['practice-tree'] as const,
  mistakes: (offset: number) => ['mistakes', offset] as const,
  contests: ['contests'] as const,
  contest: (id: string) => ['contest', id] as const,
  standings: (id: string) => ['contest-standings', id] as const,
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
export const useLeaderboard = (board: Board, offset = 0) =>
  useQuery({ queryKey: keys.leaderboard(board, offset), queryFn: () => api.getLeaderboard(board, 50, offset), placeholderData: (prev) => prev });
export const usePlayer = (handle: string | null = null) =>
  useQuery({ queryKey: keys.player(handle), queryFn: () => api.getPlayerProfile(handle) });
export const usePracticeTree = () => useQuery({ queryKey: keys.practiceTree, queryFn: api.getPracticeTree });
export const useMistakes = (offset = 0) =>
  useQuery({ queryKey: keys.mistakes(offset), queryFn: () => api.getMistakes(20, offset), placeholderData: (prev) => prev });
export const useContests = () => useQuery({ queryKey: keys.contests, queryFn: api.listContests, refetchInterval: 60_000 });
export const useContest = (id: string) => useQuery({ queryKey: keys.contest(id), queryFn: () => api.getContest(id) });
export const useContestStandings = (id: string, live: boolean) =>
  useQuery({ queryKey: keys.standings(id), queryFn: () => api.getContestStandings(id), refetchInterval: live ? 15_000 : false });
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
