import { useNavigate } from 'react-router-dom';
import { useToast } from '@/context/ToastContext';
import * as api from '@/lib/api';
import { errorCode, friendlyError } from '@/lib/errors';
import { invalidateGroups } from '@/lib/queries';
import { LEAGUES_PATH, leagueHref } from '@/lib/routes';
import type { JoinResult } from '@/lib/types';

export const groupMessage = (err: unknown, fallback: string) =>
  ['22023', '42501', '54000', '55000', 'P0002'].includes(errorCode(err) ?? '') ? (err as Error).message : friendlyError(err, fallback);

/** What to do with the answer to "join with this code": go in, wait for approval, or say it did not work. */
export const useJoinGroup = () => {
  const navigate = useNavigate();
  const toast = useToast();
  return async (code: string): Promise<JoinResult | null> => {
    try {
      const r = await api.joinGroup(code);
      if (r.status === 'not_found') {
        toast.error("That invite isn't valid. Ask an admin for a new link.");
        return r;
      }
      await invalidateGroups();
      if (r.status === 'pending') {
        toast.success('Request sent. An admin will approve it.');
        navigate(LEAGUES_PATH);
      } else if (r.group) {
        navigate(leagueHref(r.group.slug));
      }
      return r;
    } catch (err) {
      toast.error(groupMessage(err, "We couldn't join that league."));
      return null;
    }
  };
};
