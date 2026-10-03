import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { ApiError } from '@/lib/http';
import { getTutorHistory, streamTutor, type TutorDone, type TutorRequest as StreamRequest } from '@/lib/tutor';
import { AskTutorButton } from './AskTutor';
import { TutorPanel, type TutorPanelProps } from './TutorPanel';

vi.mock('@/lib/tutor', () => ({ streamTutor: vi.fn(), getTutorHistory: vi.fn() }));
const stream = vi.mocked(streamTutor);
const history = vi.mocked(getTutorHistory);

const done: TutorDone = { message_id: 'a1', model: 'llama:free', phase: 'solving', hint_used: false, blocked: 0 };

const setup = (props: Partial<TutorPanelProps> = {}) => {
  const handlers = {
    onOpenChange: vi.fn(),
    onHintUsed: vi.fn(),
    onRequireGiveUp: vi.fn(),
    onAvailability: vi.fn(),
  };
  const view = render(
    <TutorPanel
      open
      questionId="q1"
      context="practice"
      topic="Trains"
      answered={false}
      request={null}
      hintUsed={false}
      hintCost={5}
      {...handlers}
      {...props}
    />,
  );
  return { ...handlers, ...view, user: userEvent.setup() };
};

const dialog = () => screen.findByRole('dialog', { name: 'Aptric Tutor' });

describe('TutorPanel', () => {
  beforeEach(() => {
    history.mockResolvedValue({ available: true, messages: [] });
    stream.mockImplementation(async (req, handlers) => {
      handlers?.onMeta?.({
        phase: 'solving', context: 'practice', intent: req.intent, hint_used: false, hint_charged: false, user_message_id: 'u1',
      });
      handlers?.onDelta?.(`Reply to **${req.intent}**`);
      return done;
    });
  });
  afterEach(() => vi.clearAllMocks());

  it('shows the topic, the phase and the footer note', async () => {
    setup();
    const d = await dialog();
    expect(within(d).getByText('Trains')).toBeInTheDocument();
    expect(within(d).getByText('Solving: no spoilers')).toBeInTheDocument();
    expect(within(d).getByText(/Tutor only helps with Aptric questions\. AI can make mistakes; the explanation is verified\./)).toBeInTheDocument();
    expect(within(d).getByRole('textbox', { name: /ask the tutor/i })).toHaveFocus();
  });

  it.each([
    ['Hint', 'hint'],
    ['Understand the question', 'understand'],
    ['Solving steps', 'steps'],
    ['Next step', 'next_step'],
    ['Concept', 'concept'],
    ['My training plan', 'training'],
  ] as const)('the %s chip sends the %s intent', async (label, intent) => {
    const { user } = setup();
    const d = await dialog();
    await waitFor(() => expect(history).toHaveBeenCalled());
    await user.click(within(d).getByRole('button', { name: new RegExp(label) }));
    await waitFor(() => expect(stream).toHaveBeenCalledWith(
      expect.objectContaining({ questionId: 'q1', context: 'practice', intent }), expect.anything(), expect.any(AbortSignal)));
    // Markdown renders the streamed reply.
    expect(await within(d).findByText(intent)).toHaveProperty('tagName', 'STRONG');
  });

  it('full explanation asks for a give-up while solving, and streams once answered', async () => {
    const { user, onRequireGiveUp, rerender } = setup();
    const d = await dialog();
    await user.click(within(d).getByRole('button', { name: /full explanation/i }));
    expect(onRequireGiveUp).toHaveBeenCalledTimes(1);
    expect(stream).not.toHaveBeenCalled();

    rerender(
      <TutorPanel open questionId="q1" context="practice" topic="Trains" answered request={null} hintUsed={false}
        onOpenChange={vi.fn()} onHintUsed={vi.fn()} onRequireGiveUp={onRequireGiveUp} />,
    );
    expect(within(d).getByText('Answered: full explanations')).toBeInTheDocument();
    await user.click(within(d).getByRole('button', { name: /full explanation/i }));
    await waitFor(() => expect(stream).toHaveBeenCalledWith(expect.objectContaining({ intent: 'explain' }), expect.anything(), expect.anything()));
  });

  it('a request from the solve screen is sent once the history is in', async () => {
    history.mockResolvedValue({
      available: true,
      messages: [
        { id: 'old1', role: 'user', intent: 'concept', content: '📘 Concept' },
        { id: 'old2', role: 'assistant', intent: 'concept', content: 'Speed is distance over time.' },
      ],
    });
    setup({ request: { intent: 'hint', nonce: 1 } });
    const d = await dialog();
    expect(await within(d).findByText('Speed is distance over time.')).toBeInTheDocument();
    await waitFor(() => expect(stream).toHaveBeenCalledTimes(1));
    expect(stream.mock.calls[0][0].intent).toBe('hint');
    expect(await within(d).findByText('💡 Hint')).toBeInTheDocument();
  });

  it('reports the hint as used when the server charged it', async () => {
    stream.mockImplementation(async (req, handlers) => {
      handlers?.onMeta?.({ phase: 'solving', context: 'practice', intent: req.intent, hint_used: true, hint_charged: true, user_message_id: 'u1' });
      return done;
    });
    const { onHintUsed } = setup({ request: { intent: 'hint', nonce: 1 } });
    await waitFor(() => expect(onHintUsed).toHaveBeenCalled());
  });

  it('Enter sends a typed question, Shift+Enter adds a line, 500 characters max', async () => {
    const { user } = setup();
    const d = await dialog();
    const box = within(d).getByRole('textbox', { name: /ask the tutor/i });
    await user.type(box, 'Why divide{Shift>}{Enter}{/Shift}by 6?');
    expect(box).toHaveValue('Why divide\nby 6?');
    await user.keyboard('{Enter}');
    await waitFor(() => expect(stream).toHaveBeenCalledWith(
      expect.objectContaining({ intent: 'free', message: 'Why divide\nby 6?' }), expect.anything(), expect.anything()));
    expect(box).toHaveValue('');
    expect(box).toHaveAttribute('maxlength', '500');
  });

  it('a 409 from the server hands over to the give-up flow', async () => {
    stream.mockRejectedValue(new ApiError(409, 'tutor_requires_give_up', 'Give up first.'));
    const { user, onRequireGiveUp } = setup();
    const d = await dialog();
    await user.type(within(d).getByRole('textbox', { name: /ask the tutor/i }), 'what is the answer{Enter}');
    await waitFor(() => expect(onRequireGiveUp).toHaveBeenCalledTimes(1));
    expect(within(d).getByText(/give up on this question first/i)).toBeInTheDocument();
  });

  it('retries a failed reply with the stored question', async () => {
    stream.mockRejectedValueOnce(new ApiError(503, 'tutor_unavailable', 'The tutor is busy right now.', { user_message_id: 'u9' }));
    const { user } = setup();
    const d = await dialog();
    await user.click(within(d).getByRole('button', { name: /concept/i }));
    expect(await within(d).findByRole('alert')).toHaveTextContent('The tutor is busy right now.');
    await user.click(within(d).getByRole('button', { name: /retry/i }));
    await waitFor(() => expect(stream).toHaveBeenCalledTimes(2));
    expect(stream.mock.calls[1][0]).toEqual(expect.objectContaining<Partial<StreamRequest>>({ intent: 'concept', historyId: 'u9' }));
    expect(await within(d).findByText('concept')).toBeInTheDocument();
    expect(within(d).getAllByText('📘 Concept')).toHaveLength(1);
  });

  it('stop aborts the stream and keeps what arrived', async () => {
    stream.mockImplementation((_req, handlers, signal) => new Promise((_resolve, reject) => {
      handlers?.onDelta?.('Partial thought');
      signal?.addEventListener('abort', () => reject(new DOMException('aborted', 'AbortError')));
    }));
    const { user } = setup();
    const d = await dialog();
    await user.click(within(d).getByRole('button', { name: /concept/i }));
    await user.click(await within(d).findByRole('button', { name: 'Stop' }));
    expect(await within(d).findByText('Stopped.')).toBeInTheDocument();
    expect(within(d).getByText('Partial thought')).toBeInTheDocument();
    expect(within(d).getByRole('button', { name: 'Send' })).toBeInTheDocument();
  });

  it('without the tutor (503) shows the stored hint, then the official explanation', async () => {
    history.mockResolvedValue({ available: false, messages: [] });
    const fallbackHint = vi.fn(async () => 'Think in m/s first.');
    const { user, onAvailability, onHintUsed, rerender } = setup({ fallbackHint });
    const d = await dialog();
    await waitFor(() => expect(onAvailability).toHaveBeenCalledWith(false));
    await user.click(within(d).getByRole('button', { name: /^hint$/i }));
    expect(await within(d).findByText('Think in m/s first.')).toBeInTheDocument();
    expect(onHintUsed).toHaveBeenCalled();
    expect(stream).not.toHaveBeenCalled();

    rerender(
      <TutorPanel open questionId="q1" context="practice" topic="Trains" answered request={null} hintUsed
        onOpenChange={vi.fn()} onHintUsed={vi.fn()} onRequireGiveUp={vi.fn()} fallbackExplanation="Speed is 72 km/h." />,
    );
    await user.click(within(d).getByRole('button', { name: /full explanation/i }));
    expect(await within(d).findByText('Speed is 72 km/h.')).toBeInTheDocument();
  });

  it('a 503 on send switches to the fallback', async () => {
    stream.mockRejectedValue(new ApiError(503, 'tutor_unavailable', 'The tutor is not available right now.'));
    const fallbackHint = vi.fn(async () => 'Stored hint text.');
    const { user, onAvailability } = setup({ fallbackHint });
    const d = await dialog();
    await user.click(within(d).getByRole('button', { name: /^hint$/i }));
    expect(await within(d).findByText('Stored hint text.')).toBeInTheDocument();
    expect(onAvailability).toHaveBeenCalledWith(false);
  });

  it('a database without the tutor migration falls back instead of erroring', async () => {
    history.mockRejectedValue(new ApiError(503, 'tutor_not_ready', 'Apply the migration.'));
    const fallbackHint = vi.fn(async () => 'Stored hint text.');
    const { user, onAvailability } = setup({ fallbackHint });
    const d = await dialog();
    await waitFor(() => expect(onAvailability).toHaveBeenCalledWith(false));
    await user.click(within(d).getByRole('button', { name: /^hint$/i }));
    expect(await within(d).findByText('Stored hint text.')).toBeInTheDocument();
    expect(stream).not.toHaveBeenCalled();
  });

  it('other server errors show their code', async () => {
    stream.mockRejectedValue(new ApiError(500, 'internal', 'boom'));
    const { user } = setup();
    const d = await dialog();
    await user.click(within(d).getByRole('button', { name: /concept/i }));
    expect(await within(d).findByRole('alert')).toHaveTextContent('(internal)');
  });
});

describe('AskTutorButton', () => {
  beforeEach(() => history.mockResolvedValue({ available: true, messages: [] }));
  afterEach(() => vi.clearAllMocks());

  it('opens the tutor for a reviewed question in its answered phase, loading nothing before', async () => {
    render(<AskTutorButton questionId="q9" context="daily" topic="Percentages" explanation="Official." />);
    expect(history).not.toHaveBeenCalled();
    await userEvent.setup().click(screen.getByRole('button', { name: /ask tutor/i }));
    const d = await dialog();
    expect(within(d).getByText('Answered: full explanations')).toBeInTheDocument();
    await waitFor(() => expect(history).toHaveBeenCalledWith('q9', 'daily'));
  });
});

