import { ArrowRight, CheckCircle2, Clock, RotateCcw, Sparkles, Target, Trophy, UserPlus } from 'lucide-react';
import React, { useEffect, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { SessionHeader, type SegmentState } from '@/components/solve/SessionHeader';
import { SolveScreen, type Reveal, type SolveQuestion } from '@/components/solve/SolveScreen';
import { usePageMeta } from '@/hooks/usePageMeta';
import { fetchTrialQuestion, fetchTrialSummary, startTrial, submitTrialAnswer } from '@/lib/trial';

export const TrialSolve: React.FC = () => {
  const navigate = useNavigate();
  const [sessionToken, setSessionToken] = useState<string | null>(null);
  const [currentIndex, setCurrentIndex] = useState<number>(0);
  const [totalQuestions, setTotalQuestions] = useState<number>(10);
  const [currentQuestion, setCurrentQuestion] = useState<SolveQuestion | null>(null);
  const [loading, setLoading] = useState<boolean>(true);
  const [segmentResults, setSegmentResults] = useState<SegmentState[]>([]);
  const [isCompleted, setIsCompleted] = useState<boolean>(false);
  const [summaryData, setSummaryData] = useState<any>(null);

  usePageMeta({
    title: isCompleted ? 'Trial Completed – Results Breakdown' : `Question ${currentIndex + 1} of 10 – Free Solver Trial`,
    description: 'Solve 10 authentic aptitude questions with verified step-by-step explanations.',
    canonicalPath: '/free-trial/solve',
    noindex: true, // As specified by SEO requirements: do not index transient solving session states
  });

  // 1. Session initialization
  useEffect(() => {
    const initSession = async () => {
      let token = sessionStorage.getItem('aptric.trial_token');
      if (!token) {
        try {
          const res = await startTrial();
          token = res.sessionToken;
          sessionStorage.setItem('aptric.trial_token', token);
        } catch {
          token = 'local_offline_trial_session_' + Date.now();
          sessionStorage.setItem('aptric.trial_token', token);
        }
      }
      setSessionToken(token);
    };

    initSession();
  }, []);

  // 2. Load question whenever sessionToken or currentIndex changes
  useEffect(() => {
    if (!sessionToken || isCompleted) return;

    let cancelled = false;
    setLoading(true);

    fetchTrialQuestion(sessionToken, currentIndex)
      .then((res) => {
        if (!cancelled) {
          setCurrentQuestion(res.question);
          setTotalQuestions(res.totalQuestions || 10);
          setLoading(false);
        }
      })
      .catch((err) => {
        console.error('Failed to load trial question:', err);
        if (!cancelled) setLoading(false);
      });

    return () => {
      cancelled = true;
    };
  }, [sessionToken, currentIndex, isCompleted]);

  // 3. Handle answer submission
  const handleSubmit = async (optionId: string, timeMs: number): Promise<Reveal> => {
    if (!sessionToken) throw new Error('No active trial session');

    const res = await submitTrialAnswer(sessionToken, currentIndex, optionId, timeMs);

    if (res.sessionToken) {
      setSessionToken(res.sessionToken);
      sessionStorage.setItem('aptric.trial_token', res.sessionToken);
    }

    setSegmentResults((prev) => {
      const copy = [...prev];
      copy[currentIndex] = res.reveal.isCorrect ? 'correct' : 'wrong';
      return copy;
    });

    return res.reveal;
  };

  // 4. Handle next question or completion
  const handleNext = async () => {
    if (currentIndex + 1 < totalQuestions) {
      setCurrentIndex((prev) => prev + 1);
    } else {
      // Completed all 10 questions!
      setLoading(true);
      if (sessionToken) {
        try {
          const res = await fetchTrialSummary(sessionToken);
          setSummaryData(res.summary);
        } catch (err) {
          console.error('Failed to fetch summary:', err);
        }
      }
      setIsCompleted(true);
      setLoading(false);
    }
  };

  const handleRestart = async () => {
    sessionStorage.removeItem('aptric.trial_token');
    setIsCompleted(false);
    setCurrentIndex(0);
    setSegmentResults([]);
    setSummaryData(null);
    setLoading(true);

    try {
      const res = await startTrial();
      setSessionToken(res.sessionToken);
      sessionStorage.setItem('aptric.trial_token', res.sessionToken);
    } catch {
      setSessionToken('local_offline_trial_session_' + Date.now());
    }
  };

  if (isCompleted) {
    const correctCount = segmentResults.filter((s) => s === 'correct').length;
    const accuracy = Math.round((correctCount / totalQuestions) * 100);

    return (
      <div className="min-h-screen bg-[var(--background)] flex flex-col justify-center items-center px-4 py-12">
        <div className="w-full max-w-xl p-6 sm:p-8 rounded-3xl bg-[var(--card)] border border-[var(--border)] shadow-xl text-center space-y-6 animate-in fade-in zoom-in-95 duration-200">
          <div className="w-16 h-16 rounded-2xl bg-amber-500/10 border border-amber-500/20 text-amber-500 flex items-center justify-center mx-auto">
            <Trophy className="w-8 h-8" />
          </div>

          <div>
            <span className="text-xs font-semibold text-[var(--accent)] uppercase tracking-wider block mb-1">
              Trial Complete
            </span>
            <h1 className="text-2xl sm:text-3xl font-extrabold text-[var(--foreground)]">
              Great Job on the Diagnostic!
            </h1>
          </div>

          {/* Score Cards */}
          <div className="grid grid-cols-3 gap-3">
            <div className="p-3.5 rounded-2xl bg-[var(--secondary)]/40 border border-[var(--border)]">
              <span className="text-xs text-[var(--muted)] block mb-1">Score</span>
              <span className="text-xl sm:text-2xl font-black text-[var(--foreground)]">
                {correctCount} / {totalQuestions}
              </span>
            </div>
            <div className="p-3.5 rounded-2xl bg-[var(--secondary)]/40 border border-[var(--border)]">
              <span className="text-xs text-[var(--muted)] block mb-1">Accuracy</span>
              <span className="text-xl sm:text-2xl font-black text-emerald-600 dark:text-emerald-400">
                {accuracy}%
              </span>
            </div>
            <div className="p-3.5 rounded-2xl bg-[var(--secondary)]/40 border border-[var(--border)]">
              <span className="text-xs text-[var(--muted)] block mb-1">Level Est.</span>
              <span className="text-xl sm:text-2xl font-black text-[var(--accent)]">
                {accuracy >= 80 ? 'Master' : accuracy >= 50 ? 'Prepared' : 'Beginner'}
              </span>
            </div>
          </div>

          {/* Section Breakdown if available */}
          {summaryData?.sectionStats && (
            <div className="p-4 rounded-2xl bg-[var(--secondary)]/20 border border-[var(--border)] text-left space-y-2">
              <span className="text-xs font-semibold text-[var(--foreground)] block">
                Subject Accuracy:
              </span>
              <div className="space-y-1.5 text-xs text-[var(--muted)]">
                {Object.entries(summaryData.sectionStats).map(([section, stats]: any) => (
                  <div key={section} className="flex justify-between items-center py-0.5">
                    <span className="truncate pr-2">{section}</span>
                    <span className="font-semibold text-[var(--foreground)]">
                      {stats.correct} / {stats.total} (
                      {stats.total > 0 ? Math.round((stats.correct / stats.total) * 100) : 0}%)
                    </span>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Transparent Conversion Invitation */}
          <div className="p-5 rounded-2xl bg-linear-to-b from-[var(--primary)]/10 to-[var(--card)] border border-[var(--primary)]/20 text-left space-y-3">
            <div className="flex items-center gap-2">
              <Sparkles className="w-5 h-5 text-[var(--accent)]" />
              <h3 className="font-bold text-sm text-[var(--foreground)]">
                Continue Your Daily Preparation
              </h3>
            </div>
            <p className="text-xs text-[var(--muted)] leading-relaxed">
              Create a free Aptric account to save your daily streak, unlock personalized questions adapted to your weak topics, compete in friendly weekly leagues, and chat with the AI tutor.
            </p>
            <Link
              to="/#signup"
              className="inline-flex items-center justify-center gap-2 w-full py-3 rounded-xl font-bold text-sm bg-[var(--primary)] text-white hover:opacity-90 transition-opacity"
            >
              <UserPlus className="w-4 h-4" />
              <span>Create Free Account</span>
            </Link>
          </div>

          {/* Navigation alternatives */}
          <div className="flex flex-col sm:flex-row items-center justify-center gap-3 pt-2">
            <button
              type="button"
              onClick={handleRestart}
              className="inline-flex items-center gap-1.5 px-4 py-2 rounded-xl text-xs font-medium text-[var(--muted)] hover:text-[var(--foreground)] hover:bg-[var(--secondary)] transition-colors"
            >
              <RotateCcw className="w-3.5 h-3.5" />
              <span>Try Another 10 Questions</span>
            </button>
            <Link
              to="/resources"
              className="inline-flex items-center gap-1.5 px-4 py-2 rounded-xl text-xs font-medium text-[var(--accent)] hover:underline"
            >
              <span>Explore Study Resources</span>
              <ArrowRight className="w-3.5 h-3.5" />
            </Link>
          </div>
        </div>
      </div>
    );
  }

  if (loading || !currentQuestion) {
    return (
      <div className="min-h-screen bg-[var(--background)] flex items-center justify-center">
        <div className="text-center space-y-3">
          <div className="w-8 h-8 border-3 border-[var(--primary)] border-t-transparent rounded-full animate-spin mx-auto" />
          <p className="text-xs text-[var(--muted)]">Loading question {currentIndex + 1}...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-[var(--background)]">
      {/* Real SessionHeader */}
      <SessionHeader
        title={`Trial Session (${currentIndex + 1}/10)`}
        index={currentIndex}
        total={totalQuestions}
        onExit={() => navigate('/resources')}
        exitLabel="Exit to Resources"
        results={segmentResults}
      />

      <main className="max-w-2xl mx-auto px-4 py-6">
        <SolveScreen
          key={currentQuestion.id}
          question={currentQuestion}
          kind="practice"
          tutor={false} // Strictly disabled for anonymous trial per rule 9
          onSubmit={handleSubmit}
          onNext={handleNext}
          nextLabel={currentIndex + 1 === totalQuestions ? 'Complete Trial & View Score' : 'Next Question'}
        />
      </main>
    </div>
  );
};
