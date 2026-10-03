import { act, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { ToastProvider } from '@/context/ToastContext';
import { getTutorHistory, streamTutor, type TutorDone } from '@/lib/tutor';
import { SolveScreen, type Reveal, type SolveQuestion } from './SolveScreen';

vi.mock('@/lib/tutor', () => ({ streamTutor: vi.fn(), getTutorHistory: vi.fn() }));
const stream = vi.mocked(streamTutor);
const history = vi.mocked(getTutorHistory);
const done = (over: Partial<TutorDone> = {}): TutorDone => ({ message_id: 'm2', model: 'llama:free', phase: 'solving', hint_used: false, blocked: 0, ...over });

const question: SolveQuestion = {
  id: 'q1',
  stem: 'What is $2 + 2$?',
  difficulty: 'easy',
  est_seconds: 60,
  section: 'Quant',
  topic: 'Arithmetic',
  subtopic: 'Addition',
  has_hint: true,
  options: ['3', '4', '5', '22'].map((body, i) => ({ id: `o${i}`, position: i, body })),
};

const reveal = (selectedOptionId: string | null): Reveal => ({
  isCorrect: selectedOptionId === 'o1', selectedOptionId, gaveUp: selectedOptionId === null, correctOptionId: 'o1',
  explanation: 'Two plus two is **four**.', usedHint: false, reward: selectedOptionId === 'o1' ? '+10 XP' : null, timeMs: 1000,
});

const setup = (props: Partial<Parameters<typeof SolveScreen>[0]> = {}) => {
  const onSubmit = vi.fn(async (id: string) => reveal(id));
  const onNext = vi.fn();
  render(
    <ToastProvider>
      <SolveScreen question={question} kind="practice" onSubmit={onSubmit} onNext={onNext} nextLabel="Next question" {...props} />
    </ToastProvider>,
  );
  return { onSubmit, onNext, user: userEvent.setup() };
};

describe('SolveScreen', () => {
  it('renders the question with math and a visible timer', () => {
    setup();
    expect(document.querySelector('.katex')).not.toBeNull();
    expect(screen.getByRole('timer')).toHaveTextContent('0:00');
    expect(screen.getByRole('button', { name: /check answer/i })).toBeDisabled();
  });

  it('picks with number keys and checks with Enter', async () => {
    const { onSubmit, onNext, user } = setup();
    await user.keyboard('2');
    expect(screen.getByRole('button', { name: /option B/i })).toHaveAttribute('aria-pressed', 'true');
    await user.keyboard('{Enter}');
    await waitFor(() => expect(onSubmit).toHaveBeenCalledWith('o1', expect.any(Number)));
    expect(await screen.findByRole('heading', { name: 'Correct!' })).toBeInTheDocument();
    expect(screen.getByText('+10 XP')).toBeInTheDocument();
    expect(screen.getByText('four')).toBeInTheDocument();
    // Focus lands on "Next", so Enter moves on.
    expect(screen.getByRole('button', { name: /next question/i })).toHaveFocus();
    await user.keyboard('{Enter}');
    expect(onNext).toHaveBeenCalledTimes(1);
  });

  it('ignores keys for options that do not exist', async () => {
    const { user } = setup();
    await user.keyboard('7');
    for (const b of screen.getAllByRole('button', { pressed: false })) expect(b).toHaveAttribute('aria-pressed', 'false');
  });

  it('shows the right answer after a wrong one', async () => {
    const { user } = setup();
    await user.click(screen.getByRole('button', { name: /option A/i }));
    await user.click(screen.getByRole('button', { name: /check answer/i }));
    expect(await screen.findByRole('heading', { name: 'Not quite' })).toBeInTheDocument();
    expect(screen.getByText(/the right answer is/i)).toHaveTextContent('option B');
  });

  describe('Aptric Tutor', () => {
    beforeEach(() => {
      history.mockResolvedValue({ available: true, messages: [] });
      stream.mockImplementation(async (req, handlers) => {
        handlers?.onMeta?.({
          phase: 'solving', context: 'practice', intent: req.intent, hint_used: req.intent === 'hint',
          hint_charged: req.intent === 'hint', user_message_id: 'm1',
        });
        handlers?.onDelta?.(req.intent === 'explain' ? 'Two plus two: count up.' : 'Count on your fingers.');
        return done();
      });
    });
    afterEach(() => vi.clearAllMocks());

    it('the Hint button keeps its cost and opens the tutor with a hint', async () => {
      const onHint = vi.fn(async () => 'stored hint');
      const { user } = setup({ onHint, hintCost: 3, tutor: true });
      await user.click(screen.getByRole('button', { name: /show hint \(−3\)/i }));
      const dialog = await screen.findByRole('dialog', { name: 'Aptric Tutor' });
      expect(await within(dialog).findByText('Count on your fingers.')).toBeInTheDocument();
      expect(stream).toHaveBeenCalledWith(expect.objectContaining({ questionId: 'q1', context: 'practice', intent: 'hint' }), expect.anything(), expect.anything());
      expect(within(dialog).getByText('Solving: no spoilers')).toBeInTheDocument();
      // Charged server-side through use_hint, not the static RPC.
      expect(within(dialog).getByText('Hint used (−3 XP)')).toBeInTheDocument();
      expect(onHint).not.toHaveBeenCalled();
      await user.keyboard('{Escape}');
      await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument());
      // The cost chip goes once the hint is paid for.
      expect(screen.getByRole('button', { name: 'Show hint' })).toBeInTheDocument();
    });

    it('the floating chatbot icon opens the tutor', async () => {
      const { user } = setup({ tutor: true });
      await user.click(screen.getByRole('button', { name: 'Open Aptric Tutor' }));
      expect(await screen.findByRole('dialog', { name: 'Aptric Tutor' })).toBeInTheDocument();
      expect(stream).not.toHaveBeenCalled();
      // Hidden while the tutor is open.
      expect(screen.queryByRole('button', { name: 'Open Aptric Tutor' })).not.toBeInTheDocument();
    });

    it('H opens the tutor without sending anything', async () => {
      const { user } = setup({ tutor: true });
      await user.keyboard('h');
      expect(await screen.findByRole('dialog', { name: 'Aptric Tutor' })).toBeInTheDocument();
      expect(stream).not.toHaveBeenCalled();
    });

    it('giving up opens the tutor in explain mode; Ask Tutor stays after', async () => {
      const onGiveUp = vi.fn(async () => reveal(null));
      const { user } = setup({ onGiveUp, tutor: true });
      await user.click(screen.getByRole('button', { name: /more actions/i }));
      await user.click(await screen.findByRole('menuitem', { name: /give up & see answer/i }));
      await user.click(await screen.findByRole('button', { name: /show me the answer/i }));
      expect(await screen.findByRole('heading', { name: "Here's the answer" })).toBeInTheDocument();
      const dialog = await screen.findByRole('dialog', { name: 'Aptric Tutor' });
      expect(await within(dialog).findByText('Two plus two: count up.')).toBeInTheDocument();
      expect(stream).toHaveBeenCalledWith(expect.objectContaining({ intent: 'explain' }), expect.anything(), expect.anything());
      expect(within(dialog).getByText('Answered: full explanations')).toBeInTheDocument();
      await user.keyboard('{Escape}');
      await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument());
      // The official explanation is collapsed while the tutor is around.
      const toggle = screen.getByRole('button', { name: /official explanation/i });
      expect(toggle).toHaveAttribute('aria-expanded', 'false');
      await user.click(toggle);
      expect(screen.getByText('four')).toBeInTheDocument();
      await user.click(screen.getByRole('button', { name: 'Ask Tutor' }));
      expect(await screen.findByRole('dialog', { name: 'Aptric Tutor' })).toBeInTheDocument();
    });

    it('the tutor asking for a give-up runs the usual confirm', async () => {
      const onGiveUp = vi.fn(async () => reveal(null));
      const { user } = setup({ onGiveUp, tutor: true });
      await user.keyboard('h');
      const dialog = await screen.findByRole('dialog', { name: 'Aptric Tutor' });
      await user.click(within(dialog).getByRole('button', { name: /full explanation/i }));
      expect(await screen.findByRole('dialog', { name: /give up on this question/i })).toBeInTheDocument();
      expect(stream).not.toHaveBeenCalled();
      await user.click(screen.getByRole('button', { name: /keep trying/i }));
      expect(onGiveUp).not.toHaveBeenCalled();
      expect(await screen.findByRole('dialog', { name: 'Aptric Tutor' })).toBeInTheDocument();
    });

    it.each(['contest', 'placement'] as const)('no tutor in %s', async (kind) => {
      const { user } = setup({ kind, tutor: true, onHint: vi.fn(async () => 'x'), hintCost: 3 });
      expect(screen.queryByRole('button', { name: /show hint/i })).not.toBeInTheDocument();
      expect(screen.queryByRole('button', { name: 'Open Aptric Tutor' })).not.toBeInTheDocument();
      await user.keyboard('h');
      expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
      if (kind === 'contest') {
        await user.keyboard('2{Enter}');
        await screen.findByRole('heading', { name: 'Correct!' });
        expect(screen.queryByRole('button', { name: 'Ask Tutor' })).not.toBeInTheDocument();
      }
      expect(history).not.toHaveBeenCalled();
    });

    it('falls back to the stored hint and explanation without the tutor (503)', async () => {
      history.mockResolvedValue({ available: false, messages: [] });
      const onHint = vi.fn(async () => 'Count on your fingers.');
      const { user } = setup({ onHint, hintCost: 3, tutor: true });
      await user.click(screen.getByRole('button', { name: /show hint/i }));
      const dialog = await screen.findByRole('dialog', { name: 'Aptric Tutor' });
      expect(await within(dialog).findByText('Count on your fingers.')).toBeInTheDocument();
      expect(onHint).toHaveBeenCalledTimes(1);
      expect(stream).not.toHaveBeenCalled();
      await user.keyboard('{Escape}');
      await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument());
      await user.keyboard('2{Enter}');
      await screen.findByRole('heading', { name: 'Correct!' });
      // Without the tutor the explanation is open.
      expect(screen.getByText('four')).toBeInTheDocument();
    });
  });

  it('asks before giving up, then shows the answer', async () => {
    const onGiveUp = vi.fn(async () => reveal(null));
    const { user } = setup({ onGiveUp });
    // Give up lives in the action bar's overflow menu.
    await user.click(screen.getByRole('button', { name: /more actions/i }));
    await user.click(await screen.findByRole('menuitem', { name: /give up & see answer/i }));
    expect(await screen.findByRole('dialog', { name: /give up on this question/i })).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: /show me the answer/i }));
    expect(await screen.findByRole('heading', { name: "Here's the answer" })).toBeInTheDocument();
    expect(onGiveUp).toHaveBeenCalledTimes(1);
  });

  it('keeps the player on the question when submitting fails', async () => {
    const onSubmit = vi.fn(async () => { throw Object.assign(new Error('x'), { code: '23505' }); });
    const { user } = setup({ onSubmit });
    await user.keyboard('1{Enter}');
    expect(await screen.findByRole('alert')).toHaveTextContent(/already answered/i);
  });

  describe('exam guard', () => {
    afterEach(() => {
      sessionStorage.clear();
      vi.restoreAllMocks();
    });

    it('blocks copying, the context menu and select-all on the question', () => {
      setup();
      expect(document.documentElement).toHaveAttribute('data-protected');
      const stem = document.querySelector('.katex')!;
      expect(fireEvent.copy(stem)).toBe(false);
      expect(fireEvent.cut(stem)).toBe(false);
      expect(fireEvent.contextMenu(stem)).toBe(false);
      expect(fireEvent.keyDown(stem, { key: 'a', ctrlKey: true })).toBe(false);
      expect(fireEvent.keyDown(stem, { key: 'p', metaKey: true })).toBe(false);
    });

    it('hides the question while away and warns on return', async () => {
      const { user } = setup();
      const hasFocus = vi.spyOn(document, 'hasFocus').mockReturnValue(false);
      act(() => { window.dispatchEvent(new Event('blur')); });
      // A second signal for the same departure doesn't count twice.
      act(() => { document.dispatchEvent(new Event('visibilitychange')); });
      expect(screen.getByText('Question hidden')).toBeInTheDocument();

      hasFocus.mockReturnValue(true);
      act(() => { window.dispatchEvent(new Event('focus')); });
      const dialog = await screen.findByRole('dialog', { name: /tab switch detected/i });
      expect(dialog).toHaveTextContent('1 tab switch this session');
      expect(screen.queryByText('Question hidden')).not.toBeInTheDocument();

      await user.click(screen.getByRole('button', { name: /back to the question/i }));
      await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument());
      expect(screen.getByText('1 tab switch')).toBeInTheDocument();
    });

    it('stops watching once the question is answered', async () => {
      const { user } = setup();
      await user.keyboard('2{Enter}');
      await screen.findByRole('heading', { name: 'Correct!' });
      act(() => { window.dispatchEvent(new Event('blur')); });
      expect(screen.queryByText('Question hidden')).not.toBeInTheDocument();
    });
  });
});
