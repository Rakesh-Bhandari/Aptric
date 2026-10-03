import { useCallback, useEffect, useRef, useState, type KeyboardEvent } from 'react';
import * as DialogPrimitive from '@radix-ui/react-dialog';
import { Bot, RotateCcw, SendHorizontal, Square, X } from 'lucide-react';
import { Markdown } from '@/components/markdown/Markdown';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { prefersReducedMotion } from '@/hooks/useReveal';
import { errorCode, friendlyError } from '@/lib/errors';
import { getTutorHistory, streamTutor, type TutorContext, type TutorIntent } from '@/lib/tutor';
import { cn } from '@/lib/utils';

export const TUTOR_MAX_CHARS = 500;

interface Chip {
  intent: TutorIntent;
  emoji: string;
  label: string;
}

const CHIPS: Chip[] = [
  { intent: 'hint', emoji: '💡', label: 'Hint' },
  { intent: 'understand', emoji: '🧭', label: 'Understand the question' },
  { intent: 'steps', emoji: '🪜', label: 'Solving steps' },
  { intent: 'next_step', emoji: '➡️', label: 'Next step' },
  { intent: 'concept', emoji: '📘', label: 'Concept' },
  { intent: 'training', emoji: '🎯', label: 'My training plan' },
  { intent: 'explain', emoji: '📖', label: 'Full explanation' },
];

const chipText = (intent: TutorIntent) => {
  const chip = CHIPS.find((c) => c.intent === intent);
  return chip ? `${chip.emoji} ${chip.label}` : '';
};

const HINT_INTENTS = new Set<TutorIntent>(['hint', 'steps', 'next_step']);

interface ChatMessage {
  key: string;
  role: 'user' | 'assistant' | 'note';
  content: string;
  /** Stored id of a user turn (for retries). */
  id?: string | null;
  intent?: TutorIntent | null;
  status?: 'streaming' | 'error' | 'stopped';
  error?: string;
  /** The request to repeat when this (assistant) message failed. */
  retry?: { intent: TutorIntent; message: string | null; historyId: string | null };
}

/** A request from the solve screen: open with this intent sent (nonce makes repeats distinct). */
export interface TutorRequest {
  intent: TutorIntent | null;
  nonce: number;
}

export interface TutorPanelProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  questionId: string;
  context: TutorContext;
  topic: string;
  /** The player has spent their attempt (submitted or gave up). */
  answered: boolean;
  request: TutorRequest | null;
  hintUsed: boolean;
  hintCost?: number;
  /** The server charged (or had charged) the hint for this question. */
  onHintUsed: () => void;
  /** The full answer needs give-up: the solve screen confirms and calls give_up. */
  onRequireGiveUp: () => void;
  /** 503 fallback: the stored hint through use_hint (charges as before). */
  fallbackHint?: () => Promise<string | null>;
  /** 503 fallback once answered: the official explanation. */
  fallbackExplanation?: string | null;
  /** Reports whether the tutor is configured (false = 503). */
  onAvailability?: (available: boolean) => void;
}

/** Server errors carry their code, so "try again later" can be told apart from a setup problem. */
const withCode = (err: unknown, message: string) => {
  const status = (err as { status?: number }).status ?? 0;
  const code = errorCode(err);
  return status >= 500 && code ? `${message} (${code})` : message;
};

let keySeq = 0;
const nextKey = () => `m${++keySeq}`;

const TypingDots = () => (
  <span className="inline-flex items-center gap-1 py-1" aria-label="Tutor is typing" role="status">
    {[0, 1, 2].map((i) => (
      <span
        key={i}
        aria-hidden
        className="size-1.5 rounded-full bg-muted-foreground/70 motion-safe:animate-breathe"
        style={{ animationDelay: `${i * 150}ms` }}
      />
    ))}
  </span>
);

export const TutorPanel = ({
  open, onOpenChange, questionId, context, topic, answered, request, hintUsed, hintCost,
  onHintUsed, onRequireGiveUp, fallbackHint, fallbackExplanation, onAvailability,
}: TutorPanelProps) => {
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [loaded, setLoaded] = useState(false);
  const [available, setAvailable] = useState(true);
  const [busy, setBusy] = useState(false);
  const [input, setInput] = useState('');
  const abortRef = useRef<AbortController | null>(null);
  const listRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);
  const handledNonce = useRef<number | null>(null);
  // Latest props for callbacks that outlive a render.
  const props = useRef({ answered, onHintUsed, onRequireGiveUp, fallbackHint, fallbackExplanation, onAvailability });
  props.current = { answered, onHintUsed, onRequireGiveUp, fallbackHint, fallbackExplanation, onAvailability };

  const patch = (key: string, change: Partial<ChatMessage> | ((m: ChatMessage) => Partial<ChatMessage>)) =>
    setMessages((list) => list.map((m) => (m.key === key ? { ...m, ...(typeof change === 'function' ? change(m) : change) } : m)));

  const markUnavailable = useCallback(() => {
    setAvailable(false);
    props.current.onAvailability?.(false);
  }, []);

  // The stored conversation, once per question.
  useEffect(() => {
    if (!open || loaded) return;
    let cancelled = false;
    getTutorHistory(questionId, context)
      .then(({ available: ok, messages: stored }) => {
        if (cancelled) return;
        setMessages((now) => [
          ...stored.map((m) => ({ key: nextKey(), role: m.role, content: m.content, id: m.id, intent: m.intent })),
          ...now,
        ]);
        if (!ok) markUnavailable();
      })
      .catch((err) => {
        // History is a nicety; the chat still works. A database without the
        // tutor migration means no tutor: use the fallback.
        if (errorCode(err) === 'tutor_not_ready') markUnavailable();
      })
      .finally(() => {
        if (!cancelled) setLoaded(true);
      });
    return () => {
      cancelled = true;
    };
  }, [open, loaded, questionId, context, markUnavailable]);

  // Stop streaming when the panel closes or the question changes.
  useEffect(() => () => abortRef.current?.abort(), [questionId]);
  useEffect(() => {
    if (!open) abortRef.current?.abort();
  }, [open]);

  // Follow the conversation.
  useEffect(() => {
    const el = listRef.current;
    if (!el) return;
    el.scrollTo?.({ top: el.scrollHeight, behavior: prefersReducedMotion() ? 'auto' : 'smooth' });
  }, [messages]);

  /** What to show when the tutor can't answer: the stored hint or explanation. */
  const fallback = async (intent: TutorIntent, replyKey: string) => {
    const p = props.current;
    if (HINT_INTENTS.has(intent) && !p.answered && p.fallbackHint) {
      try {
        const hint = await p.fallbackHint();
        if (hint) p.onHintUsed();
        patch(replyKey, {
          status: undefined,
          content: hint ? `**Hint**\n\n${hint}` : 'There is no stored hint for this question.',
        });
      } catch (err) {
        patch(replyKey, { status: 'error', content: friendlyError(err, "We couldn't load the hint. Please try again.") });
      }
      return;
    }
    if (p.answered && p.fallbackExplanation) {
      patch(replyKey, { status: undefined, content: `**Official explanation**\n\n${p.fallbackExplanation}` });
      return;
    }
    patch(replyKey, {
      status: undefined,
      content: p.answered
        ? "The tutor isn't available right now. The official explanation is on the question screen."
        : "The tutor isn't available right now. Try the hint, or come back in a little while.",
    });
  };

  const send = async (intent: TutorIntent, message: string | null = null, historyId: string | null = null, replaceKey?: string) => {
    if (busy) return;
    if (intent === 'explain' && !props.current.answered) {
      props.current.onRequireGiveUp();
      return;
    }
    const userKey = nextKey();
    const replyKey = replaceKey ?? nextKey();
    const retry = { intent, message, historyId };
    setMessages((list) => {
      const base = replaceKey ? list.filter((m) => m.key !== replaceKey) : list;
      return [
        ...base,
        ...(replaceKey ? [] : [{ key: userKey, role: 'user' as const, content: message ?? chipText(intent), intent }]),
        { key: replyKey, role: 'assistant' as const, content: '', status: 'streaming' as const, retry },
      ];
    });

    if (!available) {
      setBusy(true);
      await fallback(intent, replyKey);
      setBusy(false);
      return;
    }

    const controller = new AbortController();
    abortRef.current = controller;
    setBusy(true);
    try {
      await streamTutor({ questionId, context, intent, message, historyId }, {
        onMeta: (meta) => {
          if (meta.user_message_id) {
            patch(userKey, { id: meta.user_message_id });
            patch(replyKey, { retry: { ...retry, historyId: meta.user_message_id } });
          }
          if (meta.hint_used) props.current.onHintUsed();
        },
        onDelta: (text) => patch(replyKey, (m) => ({ content: m.content + text })),
      }, controller.signal);
      patch(replyKey, { status: undefined });
    } catch (err) {
      if (controller.signal.aborted) {
        patch(replyKey, (m) => ({ status: 'stopped', content: m.content }));
        return;
      }
      const code = errorCode(err);
      if (code === 'tutor_requires_give_up') {
        // Nothing was stored; the solve screen takes it from here.
        setMessages((list) => list.filter((m) => m.key !== userKey && m.key !== replyKey).concat({
          key: nextKey(), role: 'note', content: 'To see the answer, give up on this question first. It earns no XP.',
        }));
        props.current.onRequireGiveUp();
        return;
      }
      // 503 before anything was stored: the tutor isn't configured.
      if ((code === 'tutor_unavailable' || code === 'tutor_not_ready')
        && !(err as { details?: { user_message_id?: string } }).details?.user_message_id) {
        markUnavailable();
        await fallback(intent, replyKey);
        return;
      }
      const details = (err as { details?: { user_message_id?: string; hint_used?: boolean } }).details ?? {};
      if (details.hint_used) props.current.onHintUsed();
      if (code === 'tutor_locked') {
        patch(replyKey, { status: 'error', error: 'The tutor is off during contests and placement tests.', retry: undefined });
        return;
      }
      patch(replyKey, {
        status: 'error',
        error: code === 'tutor_unavailable' ? (err as Error).message : withCode(err, friendlyError(err, 'The tutor ran into a problem.')),
        retry: { ...retry, historyId: details.user_message_id ?? historyId },
      });
    } finally {
      if (abortRef.current === controller) abortRef.current = null;
      setBusy(false);
    }
  };

  // Requests from the solve screen (Hint button, give-up, Ask Tutor, H).
  useEffect(() => {
    if (!open || !loaded || !request || handledNonce.current === request.nonce) return;
    handledNonce.current = request.nonce;
    if (request.intent) void send(request.intent);
    // eslint-disable-next-line react-hooks/exhaustive-deps -- send reads the latest state through refs
  }, [open, loaded, request]);

  const submitTyped = () => {
    const text = input.trim();
    if (!text || busy) return;
    setInput('');
    void send('free', text.slice(0, TUTOR_MAX_CHARS));
  };

  const onInputKey = (e: KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === 'Enter' && !e.shiftKey && !e.nativeEvent.isComposing) {
      e.preventDefault();
      submitTyped();
    }
  };

  return (
    <DialogPrimitive.Root open={open} onOpenChange={onOpenChange}>
      <DialogPrimitive.Portal>
        <DialogPrimitive.Overlay className="fixed inset-0 z-50 bg-navy-strong/40 motion-safe:animate-fade-in dark:bg-black/50" />
        <DialogPrimitive.Content
          onOpenAutoFocus={(e) => {
            e.preventDefault();
            inputRef.current?.focus({ preventScroll: true });
          }}
          className={cn(
            'fixed inset-x-0 bottom-0 z-50 flex max-h-[88dvh] min-h-[60dvh] flex-col rounded-t-3xl border bg-card text-card-foreground shadow-lg outline-none motion-safe:animate-fade-in',
            'sm:inset-y-0 sm:left-auto sm:right-0 sm:max-h-none sm:min-h-0 sm:w-[min(440px,100vw)] sm:rounded-none sm:rounded-l-2xl sm:border-y-0 sm:border-r-0',
          )}
        >
          {/* Header */}
          <div className="flex items-start gap-3 border-b px-4 pb-3 pt-4 sm:px-5">
            <span aria-hidden className="grid size-9 shrink-0 place-items-center rounded-full bg-gradient-navy text-chrome-foreground">
              <Bot className="size-5" />
            </span>
            <div className="min-w-0 flex-1 space-y-1.5">
              <DialogPrimitive.Title className="text-base font-extrabold leading-tight tracking-tight text-heading">Aptric Tutor</DialogPrimitive.Title>
              <DialogPrimitive.Description className="sr-only">
                Ask about this question: hints, steps, concepts and explanations.
              </DialogPrimitive.Description>
              <div className="flex flex-wrap items-center gap-1.5">
                <Badge variant="navy" className="max-w-full truncate">{topic}</Badge>
                {answered
                  ? <Badge variant="success">Answered: full explanations</Badge>
                  : <Badge variant="warning">Solving: no spoilers</Badge>}
                {hintUsed && !answered && (
                  <Badge variant="default">Hint used{hintCost ? ` (−${hintCost} XP)` : ''}</Badge>
                )}
              </div>
            </div>
            <DialogPrimitive.Close className="-m-2 rounded-full p-2.5 text-muted-foreground transition-colors hover:bg-muted hover:text-foreground" aria-label="Close tutor">
              <X className="size-5" />
            </DialogPrimitive.Close>
          </div>

          {/* Messages */}
          <div ref={listRef} className="min-h-0 flex-1 space-y-3 overflow-y-auto overscroll-contain px-4 py-4 sm:px-5" aria-live="polite" aria-busy={busy}>
            {messages.length === 0 && (
              <div className="rounded-lg bg-muted/60 p-4 text-sm text-muted-foreground">
                {answered
                  ? 'Ask why an option is wrong, get the full explanation, or a practice plan made for you.'
                  : "Stuck? Start with a hint or ask me to restate the question. I won't spoil the answer."}
              </div>
            )}
            {messages.map((m) => (
              m.role === 'note' ? (
                <p key={m.key} className="text-center text-xs font-medium text-muted-foreground">{m.content}</p>
              ) : m.role === 'user' ? (
                <div key={m.key} className="flex justify-end">
                  <p className="max-w-[85%] whitespace-pre-wrap break-words rounded-2xl rounded-br-md bg-primary-soft px-3.5 py-2 text-sm text-primary-soft-foreground">
                    {m.content}
                  </p>
                </div>
              ) : (
                <div key={m.key} className="flex justify-start">
                  <div
                    data-testid="tutor-reply"
                    className={cn(
                      'min-w-0 max-w-[92%] rounded-2xl rounded-bl-md border bg-background px-3.5 py-2.5 text-sm text-foreground',
                      m.status === 'error' && 'border-danger/40',
                    )}
                  >
                    {m.content ? <Markdown text={m.content} className="text-sm [&_p]:my-1" /> : m.status === 'streaming' ? <TypingDots /> : null}
                    {m.status === 'stopped' && <p className="mt-1 text-xs text-muted-foreground">Stopped.</p>}
                    {m.status === 'error' && (
                      <div className="mt-1 flex flex-wrap items-center gap-2">
                        <p role="alert" className="text-xs text-danger-soft-foreground">
                          {m.error ?? 'The tutor ran into a problem.'}
                        </p>
                        {m.retry && (
                          <Button
                            size="sm"
                            variant="ghost"
                            disabled={busy}
                            onClick={() => void send(m.retry!.intent, m.retry!.historyId ? null : m.retry!.message, m.retry!.historyId, m.key)}
                          >
                            <RotateCcw /> Retry
                          </Button>
                        )}
                      </div>
                    )}
                  </div>
                </div>
              )
            ))}
          </div>

          {/* Quick actions */}
          <div className="border-t px-4 pt-3 sm:px-5">
            <div role="group" aria-label="Quick actions" className="-mx-1 flex gap-1.5 overflow-x-auto px-1 pb-2 [scrollbar-width:none]">
              {CHIPS.map((c) => (
                <button
                  key={c.intent}
                  type="button"
                  disabled={busy}
                  onClick={() => void send(c.intent)}
                  className="inline-flex h-9 shrink-0 items-center gap-1.5 rounded-full border bg-card px-3 text-xs font-semibold text-heading transition-colors hover:border-primary hover:bg-primary-soft disabled:opacity-55"
                >
                  <span aria-hidden>{c.emoji}</span> {c.label}
                </button>
              ))}
            </div>
          </div>

          {/* Input */}
          <form
            className="px-4 pb-safe sm:px-5 sm:pb-4"
            onSubmit={(e) => {
              e.preventDefault();
              submitTyped();
            }}
          >
            <div className="flex items-end gap-2">
              <label htmlFor="tutor-input" className="sr-only">Ask the tutor</label>
              <textarea
                id="tutor-input"
                ref={inputRef}
                value={input}
                onChange={(e) => setInput(e.target.value.slice(0, TUTOR_MAX_CHARS))}
                onKeyDown={onInputKey}
                maxLength={TUTOR_MAX_CHARS}
                rows={1}
                placeholder={answered ? 'Ask about this question…' : 'Ask about a step (no spoilers)…'}
                className="max-h-32 min-h-11 w-full resize-none rounded-xl border border-input bg-background px-3.5 py-2.5 text-base text-foreground placeholder:text-muted-foreground focus-visible:border-ring focus-visible:outline-2 focus-visible:outline-ring/40 sm:text-sm"
              />
              {busy ? (
                <Button type="button" size="icon" variant="navy" aria-label="Stop" onClick={() => abortRef.current?.abort()}>
                  <Square className="size-4" />
                </Button>
              ) : (
                <Button type="submit" size="icon" aria-label="Send" disabled={!input.trim()}>
                  <SendHorizontal />
                </Button>
              )}
            </div>
            <div className="mt-1.5 flex items-start justify-between gap-3 text-[11px] leading-4 text-muted-foreground">
              <p>Tutor only helps with Aptric questions. AI can make mistakes; the explanation is verified.</p>
              <span className="shrink-0 tabular-nums" aria-hidden>{input.length}/{TUTOR_MAX_CHARS}</span>
            </div>
          </form>
        </DialogPrimitive.Content>
      </DialogPrimitive.Portal>
    </DialogPrimitive.Root>
  );
};
