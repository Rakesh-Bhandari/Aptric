import { useId, useState, type FormEvent } from 'react';
import { useNavigate } from 'react-router-dom';
import { Swords } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent } from '@/components/ui/dialog';
import { FieldHint, Label, Select } from '@/components/ui/input';
import { useSession } from '@/context/SessionContext';
import * as api from '@/lib/api';
import { errorCode, friendlyError } from '@/lib/errors';
import { invalidateChallenges, useFollowing, useTopics } from '@/lib/queries';
import { challengeHref } from '@/lib/routes';

/**
 * Start a challenge. With a finished daily set it is "beat my score on this set" and goes out at once;
 * with a topic you play ten questions first and it is sent when your score is locked in. Pick a friend,
 * or leave it open to share a link.
 */
export const ChallengeDialog = ({ open, onOpenChange, opponent = null, dailySetId = null }: {
  open: boolean; onOpenChange: (open: boolean) => void; opponent?: string | null; dailySetId?: string | null;
}) => {
  const navigate = useNavigate();
  const { profile } = useSession();
  const friends = useFollowing(profile?.handle ?? '');
  const topics = useTopics();
  const [who, setWho] = useState(opponent ?? '');
  const [source, setSource] = useState<'daily' | 'topic'>(dailySetId ? 'daily' : 'topic');
  const [topicId, setTopicId] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const ids = { who: useId(), source: useId(), topic: useId() };
  const mutual = friends.data?.pages.flatMap((p) => p.items).filter((u) => u.relationship.friend) ?? [];
  const valid = source === 'daily' ? Boolean(dailySetId) : Boolean(topicId);

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    if (!valid) return;
    setBusy(true);
    setError('');
    try {
      const c = source === 'daily'
        ? await api.createChallenge({ setKind: 'daily', setRef: dailySetId ?? undefined, opponent: who || undefined })
        : await api.createChallenge({ setKind: 'practice_topic', setRef: topicId, opponent: who || undefined });
      await invalidateChallenges();
      onOpenChange(false);
      navigate(challengeHref(c.id));
    } catch (err) {
      const code = errorCode(err);
      setError(['22023', '42501', '54000', '55000', 'P0002'].includes(code ?? '') ? (err as Error).message : friendlyError(err, "We couldn't create that challenge."));
    } finally {
      setBusy(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent title="Challenge a friend" description="Same questions, same rules. Whoever scores more wins; ties go to the faster player.">
        <form className="space-y-4" onSubmit={submit}>
          <div className="space-y-1.5">
            <Label htmlFor={ids.who}>Who?</Label>
            <Select id={ids.who} value={who} onChange={(e) => setWho(e.target.value)} disabled={Boolean(opponent)}>
              {opponent ? <option value={opponent}>@{opponent}</option> : <>
                <option value="">Anyone with the link</option>
                {mutual.map((u) => <option key={u.handle} value={u.handle}>@{u.handle}</option>)}
              </>}
            </Select>
            {!opponent && mutual.length === 0 && friends.data && <FieldHint>Friends are people you follow who follow you back. Until then, share the link.</FieldHint>}
          </div>
          <div className="space-y-1.5">
            <Label htmlFor={ids.source}>What to play</Label>
            <Select id={ids.source} value={source} onChange={(e) => setSource(e.target.value as 'daily' | 'topic')}>
              {dailySetId && <option value="daily">The daily set I just finished</option>}
              <option value="topic">Ten questions on a topic</option>
            </Select>
          </div>
          {source === 'topic' && (
            <div className="space-y-1.5">
              <Label htmlFor={ids.topic}>Topic</Label>
              <Select id={ids.topic} value={topicId} onChange={(e) => setTopicId(e.target.value)} required>
                <option value="">Choose a topic</option>
                {(topics.data ?? []).map((t) => <option key={t.id} value={t.id}>{t.name}</option>)}
              </Select>
              <FieldHint>You play first, then your score is sent as the target.</FieldHint>
            </div>
          )}
          {error && <FieldHint error>{error}</FieldHint>}
          <div className="flex justify-end"><Button type="submit" loading={busy} disabled={!valid}><Swords /> Create challenge</Button></div>
        </form>
      </DialogContent>
    </Dialog>
  );
};
