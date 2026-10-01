import { useEffect, useRef, useState } from 'react';
import { Link, Navigate, useNavigate } from 'react-router-dom';
import { CalendarClock } from 'lucide-react';
import { SessionHeader } from '@/components/solve/SessionHeader';
import { SolveScreen, type Reveal } from '@/components/solve/SolveScreen';
import { outcomeOf, saveSummary, type SessionItem } from '@/components/solve/session';
import { Button } from '@/components/ui/button';
import { EmptyState, ErrorState } from '@/components/ui/states';
import { useToast } from '@/context/ToastContext';
import * as api from '@/lib/api';
import { friendlyError } from '@/lib/errors';
import { hintCost, pointsFor } from '@/lib/game';
import { invalidateProgress, useTodaySet } from '@/lib/queries';
import type { AnswerResult, DailyQuestion } from '@/lib/types';
import { SolveSkeleton } from './SolveSkeleton';
import { AnswerNews } from './AnswerNews';
import { addNews, emptyNews } from './news';

const toSolve = (q: DailyQuestion) => ({
  id: q.id, stem: q.stem, difficulty: q.difficulty, est_seconds: q.est_seconds,
  section: q.section, topic: q.topic, subtopic: q.subtopic, has_hint: q.has_hint, options: q.options,
});

const DailySolve = () => {
  const today = useTodaySet();
  const navigate = useNavigate();
  const toast = useToast();
  // Snapshot of the unanswered questions when the session started, so
  // background refetches never reshuffle what's on screen.
  const [queue, setQueue] = useState<DailyQuestion[] | null>(null);
  const [index, setIndex] = useState(0);
  const [lastResult, setLastResult] = useState<AnswerResult | null>(null);
  const items = useRef<SessionItem[]>([]);
  const news = useRef(emptyNews());

  useEffect(() => {
    if (today.data && !queue) setQueue(today.data.questions.filter((q) => !q.attempt));
  }, [today.data, queue]);

  if (today.isError) {
    return <div className="p-4"><ErrorState error={today.error} onRetry={() => void today.refetch()} /></div>;
  }
  if (!today.data || !queue) return <SolveSkeleton />;

  const set = today.data;
  if (!set.daily_set_id || set.questions.length === 0) {
    return (
      <div className="mx-auto max-w-md p-6">
        <EmptyState icon={<CalendarClock />} title="Today's challenge isn't ready yet" action={<Button asChild><Link to="/practice">Practice instead</Link></Button>}>
          New challenges arrive every day at midnight. Check back soon.
        </EmptyState>
      </div>
    );
  }
  if (queue.length === 0) return <Navigate to={`/session/summary?daily=${set.daily_set_id}`} replace />;

  const question = queue[index];
  const total = set.questions.length;
  const doneBefore = total - queue.length;

  const finish = () => {
    const n = news.current;
    const summary = {
      kind: 'daily' as const,
      title: set.title || 'Daily challenge',
      items: items.current,
      dailySetId: set.daily_set_id,
      leveledUpTo: n.leveledUpTo,
      newBadges: n.newBadges,
      ratingChange: n.ratingChange,
      streak: n.streak,
      bonusXp: n.bonusXp,
    };
    saveSummary(summary);
    void invalidateProgress();
    navigate(`/session/summary?daily=${set.daily_set_id}`, { replace: true, state: summary });
  };

  const record = (r: AnswerResult, timeMs: number | null, selectedOptionId: string | null): Reveal => {
    news.current = addNews(news.current, r);
    setLastResult(r);
    const reveal: Reveal = {
      isCorrect: r.is_correct,
      selectedOptionId,
      gaveUp: selectedOptionId === null,
      correctOptionId: r.correct_option_id,
      explanation: r.explanation,
      usedHint: r.used_hint,
      reward: r.xp_awarded > 0 ? `+${r.xp_awarded} XP` : null,
      timeMs,
    };
    items.current.push({
      questionId: question.id, subtopicId: null, subtopic: question.subtopic, difficulty: question.difficulty,
      outcome: outcomeOf(reveal), xp: r.xp_awarded, timeMs,
    });
    return reveal;
  };

  const practiceSimilar = async () => {
    try {
      const subtopicId = await api.getQuestionSubtopic(question.id);
      void invalidateProgress();
      navigate(`/practice/session?${new URLSearchParams({
        ...(subtopicId ? { subtopics: subtopicId } : {}), difficulty: question.difficulty, title: question.subtopic,
      })}`);
    } catch (err) {
      toast.error(friendlyError(err));
    }
  };

  const last = index === queue.length - 1;

  return (
    <>
      <SessionHeader
        title={set.title || 'Daily challenge'}
        index={doneBefore + index}
        total={total}
        onExit={() => { void invalidateProgress(); navigate('/'); }}
        exitLabel="Save and exit (your answers so far are kept)"
      />
      <SolveScreen
        key={question.id}
        question={toSolve(question)}
        kind="daily"
        worth={`${pointsFor(question.difficulty, 'daily')} XP`}
        initialHint={question.hint}
        hintCost={hintCost(question.difficulty, 'daily')}
        onSubmit={async (optionId, timeMs) => {
          const r = await api.submitAnswer({ questionId: question.id, optionId, context: 'daily', timeMs });
          return record(r, timeMs, optionId);
        }}
        onHint={async () => (await api.requestHint({ questionId: question.id, context: 'daily' })).hint}
        onGiveUp={async (timeMs) => {
          const r = await api.giveUp({ questionId: question.id, context: 'daily' });
          return record(r, timeMs, null);
        }}
        onNext={() => {
          setLastResult(null);
          if (last) finish();
          else setIndex((i) => i + 1);
        }}
        nextLabel={last ? 'See my results' : 'Next question'}
        onPracticeSimilar={() => void practiceSimilar()}
        resultExtras={<AnswerNews result={lastResult} />}
      />
    </>
  );
};

export default DailySolve;
