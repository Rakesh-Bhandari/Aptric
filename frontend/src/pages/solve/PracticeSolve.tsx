import { useRef, useState } from 'react';
import { Link, useLocation, useNavigate, useSearchParams } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { PartyPopper } from 'lucide-react';
import { SessionHeader } from '@/components/solve/SessionHeader';
import { SolveScreen, type Reveal } from '@/components/solve/SolveScreen';
import { outcomeOf, saveSummary, type SessionItem } from '@/components/solve/session';
import { Button } from '@/components/ui/button';
import { EmptyState, ErrorState } from '@/components/ui/states';
import * as api from '@/lib/api';
import { hintCost, pointsFor } from '@/lib/game';
import { invalidateProgress } from '@/lib/queries';
import { practiceHref } from '@/lib/routes';
import type { AnswerResult, Difficulty, PracticeBatch, PracticeMode } from '@/lib/types';
import { SolveSkeleton } from './SolveSkeleton';
import { AnswerNews } from './AnswerNews';
import { addNews, emptyNews, fromCard } from './news';

const DIFFICULTIES: Difficulty[] = ['easy', 'medium', 'hard'];

const Runner = ({ batch, title, againHref }: { batch: PracticeBatch; title: string; againHref: string }) => {
  const navigate = useNavigate();
  const [index, setIndex] = useState(0);
  const [lastResult, setLastResult] = useState<AnswerResult | null>(null);
  const items = useRef<SessionItem[]>([]);
  const news = useRef(emptyNews());
  const questions = batch.questions.map(fromCard);
  const question = questions[index];
  const last = index === questions.length - 1;

  const finish = () => {
    if (items.current.length === 0) {
      navigate('/practice');
      return;
    }
    const n = news.current;
    const summary = {
      kind: 'practice' as const, title, items: items.current, againHref,
      leveledUpTo: n.leveledUpTo, newBadges: n.newBadges, ratingChange: null, streak: null, bonusXp: 0,
    };
    saveSummary(summary);
    void invalidateProgress();
    navigate('/session/summary', { replace: true, state: summary });
  };

  const record = (r: AnswerResult, timeMs: number | null, selectedOptionId: string | null): Reveal => {
    news.current = addNews(news.current, r);
    setLastResult(r);
    const reveal: Reveal = {
      isCorrect: r.is_correct, selectedOptionId, gaveUp: selectedOptionId === null,
      correctOptionId: r.correct_option_id, explanation: r.explanation, usedHint: r.used_hint,
      reward: r.xp_awarded > 0 ? `+${r.xp_awarded} XP` : null, timeMs,
    };
    items.current.push({
      questionId: question.id, subtopicId: question.subtopicId, subtopic: question.subtopic, difficulty: question.difficulty,
      outcome: outcomeOf(reveal), xp: r.xp_awarded, timeMs,
    });
    return reveal;
  };

  return (
    <>
      <SessionHeader title={title} index={index} total={questions.length} onExit={finish} exitLabel="End practice" />
      <SolveScreen
        key={question.id}
        question={question}
        kind="practice"
        worth={`${pointsFor(question.difficulty, 'practice')} XP`}
        hintCost={hintCost(question.difficulty, 'practice')}
        onSubmit={async (optionId, timeMs) =>
          record(await api.submitAnswer({ questionId: question.id, optionId, context: 'practice', timeMs }), timeMs, optionId)}
        onHint={async () => (await api.requestHint({ questionId: question.id, context: 'practice' })).hint}
        onGiveUp={async (timeMs) => record(await api.giveUp({ questionId: question.id, context: 'practice' }), timeMs, null)}
        onNext={() => {
          setLastResult(null);
          if (last) finish();
          else setIndex((i) => i + 1);
        }}
        nextLabel={last ? 'Finish' : 'Next question'}
        onPracticeSimilar={() => {
          void invalidateProgress();
          navigate(practiceHref({ subtopics: [question.subtopicId], difficulty: question.difficulty, title: question.subtopic }));
        }}
        resultExtras={<AnswerNews result={lastResult} />}
      />
    </>
  );
};

const PracticeSolve = () => {
  const [params] = useSearchParams();
  const { search } = useLocation();
  const subtopics = params.get('subtopics')?.split(',').filter(Boolean) ?? [];
  const difficultyParam = params.get('difficulty') as Difficulty | null;
  const difficulty = difficultyParam && DIFFICULTIES.includes(difficultyParam) ? difficultyParam : null;
  const mode: PracticeMode = params.get('mode') === 'weak' ? 'weak' : 'normal';

  // One batch per visit: never refetch mid-session.
  const batch = useQuery({
    queryKey: ['practice-batch', search],
    queryFn: () => api.getPracticeQuestions({ subtopicIds: subtopics, difficulty, mode, limit: 10 }),
    staleTime: Infinity,
    gcTime: 0,
    refetchOnWindowFocus: false,
    refetchOnReconnect: false,
  });

  const title = params.get('title') || (mode === 'weak' ? 'Weak areas' : 'Practice');

  if (batch.isError) return <div className="p-4"><ErrorState error={batch.error} onRetry={() => void batch.refetch()} /></div>;
  if (!batch.data) return <SolveSkeleton />;
  if (batch.data.questions.length === 0) {
    return (
      <div className="mx-auto max-w-md p-6">
        <EmptyState
          icon={<PartyPopper />}
          title="You've practised everything here"
          action={<Button asChild><Link to="/practice">Choose another topic</Link></Button>}
        >
          There are no new questions left in this selection. Pick another topic, or review your mistakes on the Progress page.
        </EmptyState>
      </div>
    );
  }
  const sessionTitle = mode === 'weak' && batch.data.subtopics.length
    ? `Weak areas: ${batch.data.subtopics.map((s) => s.name).join(', ')}`
    : title;
  return <Runner key={search} batch={batch.data} title={sessionTitle} againHref={`/practice/session${search}`} />;
};

export default PracticeSolve;
