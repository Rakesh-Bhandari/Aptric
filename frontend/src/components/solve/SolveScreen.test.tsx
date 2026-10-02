import { act, fireEvent, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { ToastProvider } from '@/context/ToastContext';
import { SolveScreen, type Reveal, type SolveQuestion } from './SolveScreen';

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

  it('labels the hint with its cost and reveals it', async () => {
    const onHint = vi.fn(async () => 'Count on your fingers.');
    const { user } = setup({ onHint, hintCost: 3 });
    await user.click(screen.getByRole('button', { name: /show hint \(−3\)/i }));
    expect(await screen.findByText('Count on your fingers.')).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /show hint/i })).not.toBeInTheDocument();
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
