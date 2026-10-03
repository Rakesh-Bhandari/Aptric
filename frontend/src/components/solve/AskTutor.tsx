import { useState } from 'react';
import { Bot, Sparkles } from 'lucide-react';
import { Button } from '@/components/ui/button';
import type { TutorContext } from '@/lib/tutor';
import { cn } from '@/lib/utils';
import { TutorPanel } from './TutorPanel';

/**
 * Floating violet chatbot launcher that opens Aptric Tutor. Sits above the solve
 * screen's sticky action bar (and the safe area) on phones.
 */
export const TutorFab = ({ onClick, className }: { onClick: () => void; className?: string }) => (
  <button
    type="button"
    onClick={onClick}
    aria-label="Open Aptric Tutor"
    aria-keyshortcuts="H"
    title="Aptric Tutor (H)"
    className={cn(
      'fixed right-4 z-30 grid size-12 place-items-center rounded-full bg-violet text-violet-foreground shadow-lg ring-4 ring-violet/20 hover:bg-violet-strong',
      'bottom-[calc(5.25rem+env(safe-area-inset-bottom))] sm:bottom-24 sm:right-6',
      'transition-transform duration-200 ease-out hover:scale-105 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring motion-safe:animate-pop-in',
      className,
    )}
  >
    <Bot className="size-6" aria-hidden />
    <span aria-hidden className="absolute -right-0.5 -top-0.5 size-3 rounded-full border-2 border-card bg-sky" />
  </button>
);

interface AskTutorProps {
  questionId: string;
  context: TutorContext;
  topic: string;
  /** The official explanation, shown if the tutor is unavailable. */
  explanation?: string | null;
  className?: string;
}

/**
 * Small "Ask Tutor" chatbot button for an answered question on review screens
 * (Progress → Mistakes, the session summary). The tutor opens in its
 * answered phase: full explanations, why a pick was wrong, a training plan.
 */
export const AskTutorButton = ({ questionId, context, topic, explanation = null, className }: AskTutorProps) => {
  const [open, setOpen] = useState(false);
  const [mounted, setMounted] = useState(false);
  return (
    <>
      <Button
        variant="outline"
        size="sm"
        className={className}
        onClick={() => {
          setMounted(true);
          setOpen(true);
        }}
      >
        <Sparkles className="text-violet-text" /> Ask Tutor
      </Button>
      {/* Mounted on first use, so a long list doesn't load every chat. */}
      {mounted && (
        <TutorPanel
          open={open}
          onOpenChange={setOpen}
          questionId={questionId}
          context={context}
          topic={topic}
          answered
          request={null}
          hintUsed={false}
          onHintUsed={() => {}}
          onRequireGiveUp={() => {}}
          fallbackExplanation={explanation}
        />
      )}
    </>
  );
};
