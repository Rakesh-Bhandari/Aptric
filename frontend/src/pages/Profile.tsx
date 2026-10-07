import { useMemo, useState, type ReactNode } from 'react';
import { Link, useParams } from 'react-router-dom';
import { Calendar, CheckCheck, Flame, Lock, Settings, Share2, Sparkles, Swords, Target, Trophy } from 'lucide-react';
import { AptricLogo } from '@/components/brand';
import { FollowButton } from '@/components/community/FollowButton';
import { ChallengeDialog } from '@/components/community/ChallengeDialog';
import { ProfileMenu } from '@/components/community/ProfileMenu';
import { TierEmblem } from '@/components/compete/TierEmblem';
import { BadgeGrid } from '@/components/profile/BadgeGrid';
import { NotFound } from '@/components/layout/ErrorBoundary';
import { Avatar } from '@/components/ui/avatar';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge, type BadgeProps } from '@/components/ui/badge';
import { Page, StatTile } from '@/components/ui/page';
import { Progress } from '@/components/ui/progress';
import { LoadingRegion, Skeleton } from '@/components/ui/skeleton';
import { ErrorState } from '@/components/ui/states';
import { useToast } from '@/context/ToastContext';
import { errorCode } from '@/lib/errors';
import { displayName, formatPercent, formatRelative, plural } from '@/lib/format';
import { useChallengesEnabled, useCommunityEnabled, usePlayer } from '@/lib/queries';
import { followListHref, FRIENDS_PATH, SETTINGS_PATH } from '@/lib/routes';
import type { PlayerProfile } from '@/lib/types';




/** Profile summary chip: the shared Badge, a size up. */
const Chip = ({ variant, children }: { variant: BadgeProps['variant']; children: ReactNode }) => (
  <Badge variant={variant} className="gap-1.5 px-3 py-1">{children}</Badge>
);

/** "12 followers · 8 following", linking to the lists (own lists live on /friends). */
const FollowCounts = ({ p }: { p: PlayerProfile }) => {
  if (!p.handle) return null;
  const link = 'rounded-md font-semibold text-heading underline-offset-2 hover:underline focus-visible:outline-2 focus-visible:outline-ring';
  return (
    <p className="flex flex-wrap justify-center gap-x-4 text-sm text-muted-foreground sm:justify-start">
      <Link className={link} to={p.is_me ? `${FRIENDS_PATH}?tab=followers` : followListHref(p.handle, 'followers')}>
        {plural(p.follower_count, 'follower')}
      </Link>
      <Link className={link} to={p.is_me ? `${FRIENDS_PATH}?tab=following` : followListHref(p.handle, 'following')}>
        {p.following_count.toLocaleString()} following
      </Link>
    </p>
  );
};

const ProfileHeader = ({ p, action, community = false }: { p: PlayerProfile; action?: ReactNode; community?: boolean }) => {
  const into = p.xp - p.level_xp;
  const span = Math.max(1, p.next_level_xp - p.level_xp);
  return (
    <div className="space-y-4">
      <Card className="overflow-hidden">
        {/* Cover band: the navy gradient with a blue glow on the left and a violet glow on the right. */}
        <div aria-hidden className="relative h-28 overflow-hidden bg-gradient-navy sm:h-36 dark:border-b dark:border-white/10">
          <span className="absolute inset-0 bg-dots" />
          <span className="absolute -left-16 -top-24 size-64 rounded-full bg-primary/45 blur-3xl" />
          <span className="absolute -right-16 -top-16 size-72 rounded-full bg-violet/45 blur-3xl" />
          <span className="absolute -bottom-24 left-1/2 size-48 rounded-full bg-sky/15 blur-3xl" />
        </div>
        <div className="relative px-4 pb-5 sm:px-6 sm:pb-6">
          <div className="-mt-12 flex flex-col items-center gap-3 text-center sm:-mt-14 sm:flex-row sm:items-start sm:gap-5 sm:text-left">
            <Avatar src={p.avatar_url} name={p.display_name || p.handle} className="size-24 text-3xl shadow-md ring-4 ring-white sm:size-28 dark:ring-card" />
            {/* sm:pt-16 starts the name just below the cover band (the avatar overlaps it by 56px). */}
            <div className="min-w-0 flex-1 sm:pt-16">
              <h1 className="truncate font-display text-2xl font-extrabold tracking-tight text-heading sm:text-3xl">{displayName(p)}</h1>
              {p.handle && p.display_name && <p className="font-medium text-muted-foreground">@{p.handle}</p>}
            </div>
            {action && <div className="sm:self-end sm:pb-1">{action}</div>}
          </div>
          {p.bio && <p className="mx-auto mt-3 max-w-prose text-center text-sm sm:mx-0 sm:text-left">{p.bio}</p>}
          <div className="mt-4 flex flex-wrap justify-center gap-2 sm:justify-start">
            <Chip variant="default"><Sparkles aria-hidden /> Level {p.level}</Chip>
            {p.league_tier && (
              <Chip variant="navy">
                <TierEmblem slug={p.league_tier.slug} tier={p.league_tier.tier} className="h-4 drop-shadow-none" /> {p.league_tier.name} league
              </Chip>
            )}
            <Chip variant="blue"><Flame aria-hidden className="text-streak" /> {p.current_streak}-day streak</Chip>
            <Chip variant="muted"><Calendar aria-hidden /> Joined {formatRelative(p.joined_at)}</Chip>
            {community && p.is_private && <Chip variant="muted"><Lock aria-hidden /> Private account</Chip>}
          </div>
          {community && <div className="mt-3"><FollowCounts p={p} /></div>}
          <div className="mt-5 space-y-1.5">
            <div className="flex justify-between text-sm">
              <span className="font-semibold text-heading">Level {p.level}</span>
              <span className="tabular-nums text-muted-foreground">{p.xp.toLocaleString()} / {p.next_level_xp.toLocaleString()} XP</span>
            </div>
            <Progress value={into} max={span} label="Progress to next level" className="h-2.5" />
          </div>
        </div>
      </Card>

      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        <StatTile
          icon={<CheckCheck />} tone="blue" label="Solved" value={p.stats_hidden ? '–' : (p.solved ?? 0).toLocaleString()}
          hint={p.stats_hidden ? 'Hidden by this player' : plural(p.attempts ?? 0, 'attempt')}
        />
        <StatTile
          icon={<Target />} tone="blue" label="Accuracy" value={p.stats_hidden ? '–' : formatPercent(p.correct ?? 0, p.attempts ?? 0)}
          hint={p.stats_hidden ? 'Hidden by this player' : `${(p.correct ?? 0).toLocaleString()} correct`}
        />
        <StatTile icon={<Flame />} tone="violet" label="Best streak" value={plural(p.longest_streak, 'day')} hint={`Now ${p.current_streak}`} />
        <StatTile icon={<Trophy />} tone="violet" label="Rating" value={p.rating} hint={plural(p.rated_sets, 'rated set')} />
      </div>

      <Card>
        <CardHeader className="flex-row flex-wrap items-baseline justify-between gap-2">
          <CardTitle>Badges</CardTitle>
          <span className="text-sm text-muted-foreground">{plural(p.badges.length, 'badge')} earned</span>
        </CardHeader>
        <CardContent><BadgeGrid badges={p.badges} /></CardContent>
      </Card>
    </div>
  );
};

/** Navy share card on your own profile: level and streak, shared with the system sheet or copied. */
const ShareCard = ({ p }: { p: PlayerProfile }) => {
  const toast = useToast();
  const share = async () => {
    const url = p.handle ? `${window.location.origin}/u/${p.handle}` : window.location.origin;
    const text = `I'm level ${p.level} on Aptric with a ${plural(p.current_streak, 'day')} streak 🔥 Practise aptitude with me:`;
    try {
      if (navigator.share) await navigator.share({ text, url });
      else {
        await navigator.clipboard.writeText(`${text} ${url}`);
        toast.success('Link copied. Paste it anywhere to share.');
      }
    } catch {
      /* share sheet dismissed */
    }
  };
  return (
    <Card variant="navy" className="relative overflow-hidden shadow-md">
      <span aria-hidden className="absolute inset-0 bg-dots" />
      <span aria-hidden className="absolute -bottom-20 -right-10 size-56 rounded-full bg-violet/35 blur-3xl" />
      <span aria-hidden className="absolute -left-16 -top-24 size-48 rounded-full bg-primary/25 blur-3xl" />
      <div className="relative flex flex-col gap-5 p-5 sm:flex-row sm:items-center sm:justify-between sm:p-6">
        <div className="space-y-3">
          <AptricLogo variant="onDark" size="sm" />
          <div className="flex flex-wrap items-end gap-x-6 gap-y-2">
            <div>
              <p className="text-xs font-semibold uppercase tracking-wider text-navy-muted-foreground">Level</p>
              <p className="font-display text-4xl font-extrabold leading-none tabular-nums">{p.level}</p>
            </div>
            <div>
              <p className="text-xs font-semibold uppercase tracking-wider text-navy-muted-foreground">Streak</p>
              <p className="flex items-center gap-1 font-display text-4xl font-extrabold leading-none tabular-nums">
                <Flame className="size-7 text-chrome-accent" aria-hidden />{p.current_streak}
                <span className="text-base font-semibold text-navy-muted-foreground">{p.current_streak === 1 ? 'day' : 'days'}</span>
              </p>
            </div>
          </div>
        </div>
        <Button
          variant="outline" onClick={() => void share()}
          className="shrink-0 self-start border-white/70 text-navy-foreground hover:bg-white hover:text-brand-navy sm:self-center dark:border-white/70 dark:text-navy-foreground dark:hover:text-brand-navy"
        >
          <Share2 /> Share
        </Button>
      </div>
    </Card>
  );
};

const SettingsLink = () => (
  <Button variant="outline" size="sm" asChild><Link to={SETTINGS_PATH}><Settings /> Settings</Link></Button>
);

const HeaderSkeleton = () => (
  <LoadingRegion className="space-y-4">
    <div className="overflow-hidden rounded-lg border bg-card">
      <Skeleton className="h-28 rounded-none sm:h-36" />
      <div className="flex flex-col items-center gap-3 px-6 pb-6 sm:flex-row">
        <Skeleton className="-mt-12 size-24 rounded-full ring-4 ring-card" />
        <div className="w-full flex-1 space-y-2"><Skeleton className="mx-auto h-7 w-48 sm:mx-0" /><Skeleton className="mx-auto h-4 w-32 sm:mx-0" /></div>
      </div>
    </div>
    <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">{[0, 1, 2, 3].map((i) => <Skeleton key={i} className="h-24" />)}</div>
  </LoadingRegion>
);

/** /profile: your identity and achievements. Settings live at /settings. */
const Profile = () => {
  const player = usePlayer(null);
  const community = useCommunityEnabled();

  return (
    <Page className="max-w-3xl space-y-6">
      {player.isError ? <ErrorState error={player.error} onRetry={() => void player.refetch()} />
        : player.data ? <ProfileHeader p={player.data} community={community} action={<SettingsLink />} /> : <HeaderSkeleton />}
      {player.data && <ShareCard p={player.data} />}
    </Page>
  );
};

/** /u/:handle: someone's public profile. */
export const PublicProfile = () => {
  const { handle = '' } = useParams();
  const [challenging, setChallenging] = useState(false);
  const challengesOn = useChallengesEnabled();
  const player = usePlayer(handle.toLowerCase());
  const isMe = useMemo(() => player.data?.is_me, [player.data]);
  const community = useCommunityEnabled();
  if (player.isError) {
    if (errorCode(player.error) === 'P0002') return <NotFound title="Player not found" message={`There's no player called @${handle}.`} />;
    return <Page><ErrorState error={player.error} onRetry={() => void player.refetch()} /></Page>;
  }
  return (
    <Page className="max-w-3xl space-y-4">
      {player.data
        ? (
          <ProfileHeader
            p={player.data} community={community}
            action={isMe
              ? <Button variant="outline" size="sm" asChild><Link to={SETTINGS_PATH}>Edit your profile</Link></Button>
              : community && player.data.handle && (
                <span className="inline-flex flex-wrap items-center justify-center gap-1">
                  {challengesOn && player.data.relationship.friend && (
                    <Button size="sm" variant="secondary" onClick={() => setChallenging(true)}><Swords /> Challenge</Button>
                  )}
                  <FollowButton handle={player.data.handle} relationship={player.data.relationship} isPrivate={player.data.is_private} />
                  <ProfileMenu handle={player.data.handle} />
                </span>
              )}
          />
        )
        : <HeaderSkeleton />}
      {challengesOn && player.data?.handle && <ChallengeDialog open={challenging} onOpenChange={setChallenging} opponent={player.data.handle} />}
    </Page>
  );
};

export default Profile;
