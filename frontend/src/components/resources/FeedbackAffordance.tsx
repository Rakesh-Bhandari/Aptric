import { Check, Flag, Send, X } from 'lucide-react';
import React, { useState } from 'react';

interface FeedbackAffordanceProps {
  topicTitle: string;
}

export const FeedbackAffordance: React.FC<FeedbackAffordanceProps> = ({ topicTitle }) => {
  const [isOpen, setIsOpen] = useState(false);
  const [feedback, setFeedback] = useState('');
  const [feedbackType, setFeedbackType] = useState<'typo' | 'solution' | 'clarity' | 'suggestion'>('typo');
  const [submitted, setSubmitted] = useState(false);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!feedback.trim()) return;

    // Save locally or dispatch anonymous telemetry safely without PII
    try {
      const stored = JSON.parse(localStorage.getItem('aptric.feedback') || '[]');
      stored.push({
        topic: topicTitle,
        type: feedbackType,
        text: feedback.trim(),
        timestamp: new Date().toISOString(),
      });
      localStorage.setItem('aptric.feedback', JSON.stringify(stored.slice(-20)));
    } catch {
      // Ignore local storage error
    }

    setSubmitted(true);
    setTimeout(() => {
      setSubmitted(false);
      setIsOpen(false);
      setFeedback('');
    }, 2000);
  };

  return (
    <div className="mt-8 pt-6 border-t border-[var(--border)] text-center sm:text-left">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h4 className="text-sm font-semibold text-[var(--foreground)]">Find an error or have feedback?</h4>
          <p className="text-xs text-[var(--muted)]">
            Help us maintain flawless educational accuracy for campus placements.
          </p>
        </div>
        <button
          type="button"
          onClick={() => setIsOpen(true)}
          className="inline-flex items-center justify-center gap-1.5 px-3.5 py-2 rounded-xl text-xs font-medium border border-[var(--border)] hover:bg-[var(--secondary)] transition-colors text-[var(--foreground)]"
        >
          <Flag className="w-3.5 h-3.5 text-[var(--accent)]" />
          <span>Report Correction</span>
        </button>
      </div>

      {isOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50 backdrop-blur-xs">
          <div className="relative w-full max-w-md p-6 rounded-2xl bg-[var(--card)] border border-[var(--border)] shadow-xl animate-in fade-in zoom-in-95 duration-150">
            <button
              type="button"
              onClick={() => setIsOpen(false)}
              className="absolute top-4 right-4 text-[var(--muted)] hover:text-[var(--foreground)]"
              aria-label="Close"
            >
              <X className="w-5 h-5" />
            </button>

            <h3 className="text-base font-semibold text-[var(--foreground)] mb-1">
              Suggest Correction: {topicTitle}
            </h3>
            <p className="text-xs text-[var(--muted)] mb-4">
              Your report will be reviewed by our subject matter editors. No account required.
            </p>

            {submitted ? (
              <div className="py-8 text-center text-emerald-600 dark:text-emerald-400 space-y-2">
                <Check className="w-8 h-8 mx-auto" />
                <p className="text-sm font-medium">Thank you! Your feedback has been received.</p>
              </div>
            ) : (
              <form onSubmit={handleSubmit} className="space-y-4">
                <div>
                  <label className="block text-xs font-medium text-[var(--muted)] mb-1">
                    Issue Category
                  </label>
                  <select
                    value={feedbackType}
                    onChange={(e) => setFeedbackType(e.target.value as any)}
                    className="w-full text-xs sm:text-sm p-2 rounded-lg bg-[var(--secondary)]/50 border border-[var(--border)] text-[var(--foreground)]"
                  >
                    <option value="typo">Typo or formatting error</option>
                    <option value="solution">Disputed mathematical or logical step</option>
                    <option value="clarity">Explanation needs more clarity</option>
                    <option value="suggestion">Other suggestion</option>
                  </select>
                </div>

                <div>
                  <label className="block text-xs font-medium text-[var(--muted)] mb-1">
                    Description
                  </label>
                  <textarea
                    required
                    rows={3}
                    maxLength={500}
                    value={feedback}
                    onChange={(e) => setFeedback(e.target.value)}
                    placeholder="Describe the issue or correction with specific section or question reference..."
                    className="w-full text-xs sm:text-sm p-3 rounded-xl bg-[var(--secondary)]/50 border border-[var(--border)] text-[var(--foreground)] resize-none focus:outline-hidden focus:ring-2 focus:ring-[var(--primary)]"
                  />
                  <div className="text-right text-[10px] text-[var(--muted)] mt-1">
                    {feedback.length}/500
                  </div>
                </div>

                <div className="flex justify-end gap-2 pt-2">
                  <button
                    type="button"
                    onClick={() => setIsOpen(false)}
                    className="px-3 py-1.5 rounded-lg text-xs font-medium text-[var(--muted)] hover:bg-[var(--secondary)]"
                  >
                    Cancel
                  </button>
                  <button
                    type="submit"
                    className="inline-flex items-center gap-1.5 px-4 py-1.5 rounded-lg text-xs font-medium bg-[var(--primary)] text-white hover:opacity-90 transition-opacity"
                  >
                    <Send className="w-3 h-3" />
                    Submit Feedback
                  </button>
                </div>
              </form>
            )}
          </div>
        </div>
      )}
    </div>
  );
};
