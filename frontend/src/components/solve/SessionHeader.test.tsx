import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { SessionHeader, type SegmentState } from './SessionHeader';

const setup = (index: number, total: number, results?: SegmentState[]) =>
  render(<SessionHeader title="Practice" index={index} total={total} onExit={() => {}} results={results} />);

const bar = () => screen.getByRole('progressbar', { name: 'Session progress' });
const stars = () => screen.queryByRole('img', { name: /Mastery/ });

describe('SessionHeader', () => {
  it('fills by questions attempted out of the total', () => {
    setup(3, 10, ['correct', 'wrong', 'wrong']);
    expect(bar()).toHaveAttribute('aria-valuenow', '3');
    expect(bar()).toHaveAttribute('aria-valuetext', '3 of 10 attempted, 1 correct');
    expect(stars()).toHaveAttribute('aria-label', expect.stringContaining('1 of 3'));
  });

  it('fills for wrong answers but shows no stars with 0 correct', () => {
    setup(2, 10, ['wrong', 'answered']);
    expect(bar()).toHaveAttribute('aria-valuenow', '2');
    expect(stars()).toHaveAttribute('aria-label', expect.stringContaining('0 of 3'));
  });

  it('is empty before any question is attempted', () => {
    setup(0, 5, []);
    expect(bar()).toHaveAttribute('aria-valuenow', '0');
    expect(stars()).toHaveAttribute('aria-label', expect.stringContaining('0 of 3'));
  });

  it('counts a skipped (unanswered) question as attempted but not correct', () => {
    setup(2, 4, ['correct', 'answered']);
    expect(bar()).toHaveAttribute('aria-valuenow', '2');
    expect(bar()).toHaveAttribute('aria-valuetext', '2 of 4 attempted, 1 correct');
  });

  it('gives three stars when everything is correct, for a variable session size', () => {
    setup(2, 3, ['correct', 'correct', 'correct']);
    expect(bar()).toHaveAttribute('aria-valuenow', '3');
    expect(stars()).toHaveAttribute('aria-label', expect.stringContaining('3 of 3'));
  });

  it('uses a continuous attempted fill for long sessions', () => {
    const results: SegmentState[] = Array.from({ length: 20 }, (_, i) => (i % 2 ? 'wrong' : 'correct'));
    const { container } = setup(20, 40, results);
    expect(bar()).toHaveAttribute('aria-valuenow', '20');
    expect((container.querySelector('[style*="width"]') as HTMLElement).style.width).toBe('50%');
  });

  it('keeps position-based progress where nothing is graded (placement test)', () => {
    setup(4, 10);
    expect(bar()).toHaveAttribute('aria-valuenow', '4');
    expect(stars()).toBeNull();
  });
});
