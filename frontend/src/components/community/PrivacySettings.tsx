import { useId } from 'react';
import { Avatar } from '@/components/ui/avatar';
import { Button } from '@/components/ui/button';
import { FieldHint, Label, Select } from '@/components/ui/input';
import { SwitchRow } from '@/components/ui/switch-row';
import { useToast } from '@/context/ToastContext';
import * as api from '@/lib/api';
import { friendlyError } from '@/lib/errors';
import { formatRelative } from '@/lib/format';
import { invalidateSocial, keys, queryClient, useBlocks, usePrivacy } from '@/lib/queries';
import type { Privacy, VisibilityLevel } from '@/lib/types';

const LEVELS: { value: VisibilityLevel; label: string }[] = [
  { value: 'everyone', label: 'Everyone' },
  { value: 'followers', label: 'People who follow me' },
  { value: 'friends', label: 'Friends (we follow each other)' },
  { value: 'nobody', label: 'Only me' },
];

const LevelSelect = ({ label, hint, value, onChange }: { label: string; hint: string; value: VisibilityLevel; onChange: (v: VisibilityLevel) => void }) => {
  const id = useId();
  return (
    <div className="space-y-1.5">
      <Label htmlFor={id}>{label}</Label>
      <Select id={id} value={value} onChange={(e) => onChange(e.target.value as VisibilityLevel)} aria-describedby={`${id}-hint`}>
        {LEVELS.map((l) => <option key={l.value} value={l.value}>{l.label}</option>)}
      </Select>
      <FieldHint id={`${id}-hint`}>{hint}</FieldHint>
    </div>
  );
};

/** Blocked players, with an Unblock button. Only the people you blocked are listed, never who blocked you. */
const BlockedList = () => {
  const blocks = useBlocks();
  const toast = useToast();
  const items = blocks.data?.items ?? [];
  if (blocks.isError) return <FieldHint error>We couldn't load your blocked list.</FieldHint>;
  if (!blocks.data || items.length === 0) return <FieldHint>You have not blocked anyone.</FieldHint>;
  const unblock = async (handle: string) => {
    try {
      await api.unblockUser(handle);
      toast.success(`@${handle} is unblocked.`);
      await invalidateSocial();
    } catch (err) {
      toast.error(friendlyError(err, "We couldn't unblock them."));
    }
  };
  return (
    <ul aria-label="Blocked players" className="divide-y rounded-lg border">
      {items.map((b) => (
        <li key={b.handle} className="flex min-h-14 items-center gap-3 px-3 py-2">
          <Avatar src={b.avatar_url} name={b.handle} className="size-8" />
          <span className="min-w-0 flex-1 text-sm"><span className="block truncate font-semibold text-heading">@{b.handle}</span><span className="text-xs text-muted-foreground">Blocked {formatRelative(b.blocked_at)}</span></span>
          <Button size="sm" variant="outline" onClick={() => void unblock(b.handle)}>Unblock<span className="sr-only"> @{b.handle}</span></Button>
        </li>
      ))}
    </ul>
  );
};

/** Who may see what, whether you appear in search and the friends' feed, and who you blocked. */
export const PrivacySettings = () => {
  const privacy = usePrivacy();
  const toast = useToast();
  if (privacy.isError) return <FieldHint error>We couldn't load your privacy settings. Try again later.</FieldHint>;
  const p = privacy.data;
  if (!p) return <FieldHint>Loading…</FieldHint>;

  const save = async (patch: Partial<Privacy>) => {
    queryClient.setQueryData(keys.privacy, { ...p, ...patch });
    try {
      queryClient.setQueryData(keys.privacy, await api.setPrivacy(patch));
      if ('is_private' in patch) await invalidateSocial();
    } catch (err) {
      queryClient.setQueryData(keys.privacy, p);
      toast.error(friendlyError(err, "We couldn't save that."));
    }
  };

  return (
    <div className="space-y-4">
      <SwitchRow
        label="Private account" checked={p.is_private} onChange={(v) => void save({ is_private: v })}
        hint="New followers need your approval. Only your followers can see who you follow."
      />
      <SwitchRow
        label="Show my activity to people who follow me" checked={p.share_activity} onChange={(v) => void save({ share_activity: v })}
        hint="Finished daily sets, streak milestones and league promotions. Shown for 14 days, never anything you wrote."
      />
      <SwitchRow
        label="Let people find me by handle" checked={p.discoverable} onChange={(v) => void save({ discoverable: v })}
        hint="Turn off to leave search and suggestions. People with your link can still open your profile."
      />
      <LevelSelect label="Who can see my accuracy" value={p.stats_visibility} onChange={(v) => void save({ stats_visibility: v })}
        hint="Solved, correct answers and accuracy per section. Level, streak, rating and league are always shown." />
      <LevelSelect label="Who can see my exam goal" value={p.exam_visibility} onChange={(v) => void save({ exam_visibility: v })}
        hint="The exam you are preparing for." />
      <LevelSelect label="Who can see my name" value={p.name_visibility} onChange={(v) => void save({ name_visibility: v })}
        hint="In search, follower lists and the activity feed. Others see only your @handle unless you allow it." />
      <div className="space-y-2">
        <h3 className="text-sm font-semibold text-heading">Blocked players</h3>
        <BlockedList />
      </div>
    </div>
  );
};
