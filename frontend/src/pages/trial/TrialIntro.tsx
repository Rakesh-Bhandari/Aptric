import { ArrowRight, CheckCircle2, Clock, ShieldCheck, Sparkles, Zap } from 'lucide-react';
import React, { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { usePageMeta } from '@/hooks/usePageMeta';
import { startTrial } from '@/lib/trial';

export const TrialIntro: React.FC = () => {
  const navigate = useNavigate();
  const [loading, setLoading] = useState(false);

  usePageMeta({
    title: 'Free 10-Question Aptitude Trial',
    description:
      'Test your aptitude skills with 10 real placement exam questions. Full timer, instant explanations, and performance breakdown without creating an account.',
    canonicalPath: '/free-trial',
    structuredData: {
      '@context': 'https://schema.org',
      '@type': 'WebApplication',
      name: 'Aptric 10-Question Free Solver Trial',
      url: 'https://aptric.app/free-trial',
      applicationCategory: 'EducationalApplication',
      operatingSystem: 'All',
      browserRequirements: 'Requires JavaScript. Requires HTML5.',
    },
  });

  const handleStart = async () => {
    setLoading(true);
    try {
      const res = await startTrial();
      sessionStorage.setItem('aptric.trial_token', res.sessionToken);
      navigate('/free-trial/solve');
    } catch {
      // In case of error, still navigate (trial client falls back safely)
      navigate('/free-trial/solve');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="max-w-3xl mx-auto px-4 py-12 sm:py-16 text-center">
      <div className="inline-flex items-center gap-2 px-3.5 py-1.5 rounded-full bg-[var(--primary)]/10 text-[var(--accent)] text-xs font-semibold mb-6 border border-[var(--primary)]/20">
        <Sparkles className="w-4 h-4" />
        <span>Instant Free Trial • No Credit Card • No Signup</span>
      </div>

      <h1 className="text-3xl sm:text-5xl font-extrabold text-[var(--foreground)] tracking-tight mb-4">
        Try the Aptric Solver in 10 Questions
      </h1>

      <p className="text-base sm:text-lg text-[var(--muted)] leading-relaxed mb-8 max-w-xl mx-auto">
        Experience our authentic exam solving engine. Solve 10 curated questions across Quantitative
        Aptitude, Logical Reasoning, Verbal Ability, and Technical Fundamentals.
      </p>

      {/* Highlights Grid */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 mb-10 text-left">
        <div className="p-5 rounded-2xl bg-[var(--card)] border border-[var(--border)] shadow-xs">
          <Clock className="w-5 h-5 text-[var(--accent)] mb-2.5" />
          <h3 className="font-semibold text-sm text-[var(--foreground)] mb-1">10–15 Minutes</h3>
          <p className="text-xs text-[var(--muted)] leading-relaxed">
            Short, focused session designed to accurately diagnose your speed and accuracy.
          </p>
        </div>

        <div className="p-5 rounded-2xl bg-[var(--card)] border border-[var(--border)] shadow-xs">
          <ShieldCheck className="w-5 h-5 text-emerald-500 mb-2.5" />
          <h3 className="font-semibold text-sm text-[var(--foreground)] mb-1">Authentic Engine</h3>
          <p className="text-xs text-[var(--muted)] leading-relaxed">
            Uses the real product solver with keyboard shortcuts and KaTeX math formatting.
          </p>
        </div>

        <div className="p-5 rounded-2xl bg-[var(--card)] border border-[var(--border)] shadow-xs">
          <CheckCircle2 className="w-5 h-5 text-purple-500 mb-2.5" />
          <h3 className="font-semibold text-sm text-[var(--foreground)] mb-1">Detailed Breakdown</h3>
          <p className="text-xs text-[var(--muted)] leading-relaxed">
            Receive verified explanations after every question and a comprehensive performance summary.
          </p>
        </div>
      </div>

      {/* Start Button */}
      <div className="space-y-4">
        <button
          type="button"
          onClick={handleStart}
          disabled={loading}
          className="inline-flex items-center justify-center gap-2 px-8 py-3.5 rounded-2xl font-bold text-base bg-[var(--gradient-primary)] text-white shadow-lg hover:opacity-95 transition-all cursor-pointer disabled:opacity-50"
        >
          {loading ? (
            <span>Preparing Session...</span>
          ) : (
            <>
              <Zap className="w-5 h-5" />
              <span>Start 10-Question Trial</span>
              <ArrowRight className="w-5 h-5 ml-1" />
            </>
          )}
        </button>

        <p className="text-xs text-[var(--muted)]">
          Want to study theory first?{' '}
          <Link to="/resources" className="text-[var(--accent)] hover:underline font-medium">
            Browse our free resource notes
          </Link>
        </p>
      </div>

      {/* Note about AI tutor */}
      <div className="mt-12 p-4 rounded-xl bg-[var(--secondary)]/30 border border-[var(--border)] text-xs text-[var(--muted)] max-w-lg mx-auto">
        <strong>Note:</strong> The interactive AI Tutor is an authenticated feature reserved for registered accounts. During this free trial, all stored, human-reviewed explanations remain fully accessible.
      </div>
    </div>
  );
};
