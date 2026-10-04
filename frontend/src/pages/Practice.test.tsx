import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { MemoryRouter } from 'react-router-dom';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import * as api from '@/lib/api';
import Practice from './Practice';

vi.mock('@/lib/api');

const tree = [{
  id: 'sec', name: 'Quant', slug: 'quant', stars: 0, attempted: 0, correct: 0, available: 5,
  topics: [{
    id: 't', name: 'Arithmetic', stars: 0, attempted: 0, correct: 0, available: 5,
    subtopics: [{ id: 's1', name: 'Percentages', stars: 0, attempted: 0, correct: 0, available: 5, weak: false }],
  }],
}];

const renderPage = () => render(
  <QueryClientProvider client={new QueryClient()}><MemoryRouter><Practice /></MemoryRouter></QueryClientProvider>,
);

describe('Practice difficulty picker', () => {
  beforeEach(() => {
    localStorage.clear();
    vi.mocked(api.getPracticeTree).mockResolvedValue(tree as never);
  });

  it('puts the chosen difficulty into every practice link', async () => {
    const user = userEvent.setup();
    renderPage();
    await user.click(await screen.findByRole('button', { name: /Arithmetic/ }));
    expect(screen.getByRole('link', { name: /Percentages/ }).getAttribute('href')).not.toContain('difficulty=');
    await user.click(screen.getByLabelText('Hard'));
    expect(screen.getByRole('link', { name: /Percentages/ }).getAttribute('href')).toContain('difficulty=hard');
    expect(screen.getByRole('link', { name: /Practice weak areas/ }).getAttribute('href')).toContain('difficulty=hard');
    expect(localStorage.getItem('aptric.practiceDifficulty')).toBe('hard');
  });
});
