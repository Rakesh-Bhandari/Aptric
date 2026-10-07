// Mock API data for Playwright screenshots and a11y checks. Shapes follow
// src/lib/types.ts (player RPCs) and src/admin/api.js (admin routes). Dates are
// relative to FIXED_NOW so countdowns and "today" render the same every run.

export const FIXED_NOW = new Date('2026-10-02T10:30:00+05:30');
const iso = (offsetHours: number) => new Date(FIXED_NOW.getTime() + offsetHours * 3_600_000).toISOString();
const day = (offsetDays: number) => iso(offsetDays * 24).slice(0, 10);

export const ME = 'u-me';

export const profile = (overrides: Record<string, unknown> = {}) => ({
  id: ME,
  handle: 'priya_s',
  display_name: 'Priya Sharma',
  avatar_url: null,
  bio: 'Final-year ECE, prepping for campus placements.',
  role: 'admin',
  timezone: 'Asia/Kolkata',
  exam_goal: 'placements',
  daily_target: 10,
  onboarded_at: iso(-24 * 40),
  placement_level: 3,
  placed_at: iso(-24 * 40),
  ...overrides,
});

const opts = (qid: string, bodies: string[]) => bodies.map((body, i) => ({ id: `${qid}-o${i + 1}`, position: i + 1, body }));

const STEMS = [
  'A train 240 m long passes a pole in 12 seconds. What is its speed in km/h?',
  'If $x^2 - 5x + 6 = 0$, what is the sum of the roots?',
  'Find the odd one out: **Copper, Iron, Bronze, Silver**.',
  'A shopkeeper marks an article 40% above cost and gives a 25% discount. What is the profit percentage?',
  'In a certain code, COMPUTER is written as RFUVQNPC. How is MEDICINE written?',
  'The average of five consecutive odd numbers is 61. What is the largest?',
  'Pointing to a photo, Arun says, "Her mother is my mother\'s only daughter." How is Arun related to the girl?',
  'What is the next number in the series 2, 6, 12, 20, 30, ?',
  'A can do a job in 12 days and B in 18 days. In how many days can they finish it together?',
  'Choose the word most nearly opposite in meaning to **EPHEMERAL**.',
];
const OPTIONS = [
  ['60 km/h', '72 km/h', '80 km/h', '90 km/h'],
  ['5', '6', '−5', '1'],
  ['Copper', 'Iron', 'Bronze', 'Silver'],
  ['5%', '10%', '12.5%', '15%'],
  ['EDJOFMCN', 'NFEJDJOF', 'MFEJDJOF', 'NFEJDJOE'],
  ['63', '65', '67', '69'],
  ['Brother', 'Father', 'Uncle', 'Cousin'],
  ['40', '42', '44', '36'],
  ['7.2 days', '7.5 days', '6 days', '8 days'],
  ['Transient', 'Permanent', 'Fleeting', 'Brief'],
];
const SECTIONS = ['Quantitative Aptitude', 'Logical Reasoning', 'Verbal Ability'];
const DIFFS = ['easy', 'medium', 'hard'] as const;

export const questionCard = (i: number) => {
  const id = `q${i + 1}`;
  return {
    id,
    stem: STEMS[i % STEMS.length],
    difficulty: DIFFS[i % 3],
    est_seconds: 60 + (i % 3) * 30,
    section: { id: `s${i % 3}`, name: SECTIONS[i % 3] },
    topic: { id: `t${i % 3}`, name: ['Speed & Distance', 'Coding-Decoding', 'Antonyms'][i % 3] },
    subtopic: { id: `st${i % 3}`, name: ['Trains', 'Letter shifting', 'Word meaning'][i % 3] },
    has_hint: true,
    options: opts(id, OPTIONS[i % OPTIONS.length]),
  };
};

export const todaySet = (answered = 4) => ({
  set_date: day(0),
  track: { id: 'tr1', slug: 'placements', name: 'Placements' },
  daily_set_id: 'ds-today',
  title: 'Daily challenge',
  questions: Array.from({ length: 10 }, (_, i) => {
    const c = questionCard(i);
    return {
      id: c.id, position: i + 1, stem: c.stem, difficulty: c.difficulty, est_seconds: c.est_seconds,
      section: c.section.name, topic: c.topic.name, subtopic: c.subtopic.name,
      has_hint: true, hint: null, hint_used: false, options: c.options,
      attempt: i < answered
        ? { selected_option_id: `${c.id}-o${i === 2 ? 1 : 2}`, is_correct: i !== 2, gave_up: false, used_hint: i === 1, xp_awarded: i === 2 ? 0 : 10 }
        : null,
    };
  }),
});

/** finish_placement: 7 of 10 right, placed at level 3. */
export const placementResult = () => ({
  test_id: 'pt1', correct: 7, total: 10, score: 70,
  level: { level: 3, slug: 'solver', name: 'Solver' },
  results: Array.from({ length: 10 }, (_, i) => {
    const c = questionCard(i);
    const right = ![2, 5, 8].includes(i);
    return {
      question_id: c.id, difficulty: c.difficulty, selected_option_id: i === 8 ? null : `${c.id}-o${right ? 2 : 1}`,
      correct_option_id: `${c.id}-o2`, is_correct: right, explanation: 'Worked solution.',
    };
  }),
});

export const dailyResult = () => ({
  daily_set_id: 'ds-today',
  set_date: day(0),
  track: { slug: 'placements', name: 'Placements' },
  level: { level: 4, name: 'Analyst' },
  handle: 'priya_s',
  display_name: 'Priya Sharma',
  player_level: 4,
  total: 10,
  answered: 10,
  correct: 7,
  complete: true,
  time_ms: 512_000,
  xp_earned: 85,
  questions: (['correct', 'correct', 'wrong', 'hinted', 'correct', 'gave_up', 'correct', 'correct', 'wrong', 'correct'] as const)
    .map((outcome, i) => ({ position: i + 1, difficulty: DIFFS[i % 3], outcome, time_ms: 30_000 + i * 4_000, xp: outcome === 'correct' ? 10 : outcome === 'hinted' ? 5 : 0 })),
  rating: { before: 1180, after: 1204, delta: 24 },
  current_streak: 12,
  longest_streak: 21,
  league: { tier: 'gold', name: 'Gold', rank: 4, members: 30 },
});

const NAMES = ['Aarav Mehta', 'Diya Patel', 'Rohan Gupta', 'Priya Sharma', 'Kabir Singh', 'Ananya Rao', 'Vihaan Iyer', 'Ishita Das', 'Arjun Nair', 'Meera Joshi', 'Sai Kumar', 'Neha Verma'];
const handleOf = (n: string) => n.toLowerCase().replace(/\s+/g, '_').slice(0, 10);

/** The weekly league, with you at `myRank` (default 4th, just outside promotion). */
export const myLeague = (myRank = 4) => {
  const others = NAMES.filter((n) => n !== 'Priya Sharma');
  const names = [...others.slice(0, myRank - 1), 'Priya Sharma', ...others.slice(myRank - 1)];
  return {
    week_start: day(-4),
    week_ends_at: iso(24 * 3 + 5),
    league_id: 'lg1',
    tier: { tier: 3, slug: 'gold', name: 'Gold', promote_count: 3, demote_count: 3 },
    promote_zone: 3,
    demote_zone: 3,
    members: names.map((n, i) => ({
      rank: i + 1, user_id: n === 'Priya Sharma' ? ME : `u${i}`, handle: handleOf(n), display_name: n, avatar_url: null,
      xp: 980 - i * 63, is_me: n === 'Priya Sharma',
    })),
    last_result: { week_start: day(-11), tier: 2, final_rank: 2, outcome: 'promoted' },
  };
};

export const leaderboard = (board: string) => {
  const entries = NAMES.map((n, i) => ({
    rank: i + 1, user_id: n === 'Priya Sharma' ? ME : `u${i}`, handle: handleOf(n), display_name: n, avatar_url: null,
    level: 9 - Math.floor(i / 2), xp: 15_400 - i * 900, weekly_xp: 980 - i * 63, rating: 1620 - i * 31,
    current_streak: 30 - i * 2, league_tier: 5 - Math.floor(i / 3), is_me: n === 'Priya Sharma', following: i === 1,
  }));
  return { board, refreshed_at: iso(-0.2), total: 2_431, entries, me: entries[3] };
};

const badges = [
  { slug: 'first-blood', name: 'First solve', icon: '🎯', description: 'Solved your first question.', topic: null, awarded_at: iso(-24 * 39) },
  { slug: 'streak-7', name: 'Week warrior', icon: '🔥', description: 'Kept a 7-day streak.', topic: null, awarded_at: iso(-24 * 20) },
  { slug: 'perfect', name: 'Perfect ten', icon: '💯', description: 'Got every daily question right.', topic: null, awarded_at: iso(-24 * 9) },
  { slug: 'trains', name: 'Express', icon: '🚆', description: 'Mastered Trains.', topic: 'Trains', awarded_at: iso(-24 * 3) },
];

export const playerProfile = (handle: string | null) => ({
  user_id: handle && handle !== 'priya_s' ? 'u0' : ME,
  handle: handle ?? 'priya_s',
  display_name: handle && handle !== 'priya_s' ? 'Aarav Mehta' : 'Priya Sharma',
  avatar_url: null,
  bio: 'Final-year ECE, prepping for campus placements.',
  joined_at: iso(-24 * 40),
  is_me: !handle || handle === 'priya_s',
  level: 4,
  xp: 2_340,
  level_xp: 1_800,
  next_level_xp: 3_000,
  rating: 1204,
  rated_sets: 26,
  current_streak: 12,
  longest_streak: 21,
  streak_freezes: 1,
  max_streak_freezes: 2,
  next_freeze_xp: 2_600,
  league_tier: { tier: 3, slug: 'gold', name: 'Gold' },
  solved: 342,
  attempts: 418,
  correct: 301,
  sections: [
    { name: 'Quantitative Aptitude', attempted: 210, correct: 158 },
    { name: 'Logical Reasoning', attempted: 140, correct: 99 },
    { name: 'Verbal Ability', attempted: 68, correct: 44 },
  ],
  badges,
  stats_hidden: false,
  exam_goal: null,
  is_private: false,
  follower_count: 18,
  following_count: 24,
  relationship: { is_me: !handle || handle === 'priya_s', following: false, followed_by: true, friend: false, requested: false },
});

// Community: follow / friends ----------------------------------------------------

export const relationship = (over: Record<string, boolean> = {}) => ({
  is_me: false, following: false, followed_by: false, friend: false, requested: false, ...over,
});

export const userCard = (handle: string, over: Record<string, unknown> = {}) => ({
  handle, display_name: null, avatar_url: null, level: 4, current_streak: 6, is_private: false,
  league_tier: { tier: 3, slug: 'gold', name: 'Gold' }, relationship: relationship(), ...over,
});

export const followingPage = () => ({
  restricted: false,
  items: [userCard('aarav_meht', { relationship: relationship({ following: true, followed_by: true, friend: true }) }),
    userCard('diya_n', { relationship: relationship({ following: true }) })],
  next_cursor: null,
});

export const friendActivity = () => ({
  items: [
    { id: 3, kind: 'daily_set', data: { correct: 9, total: 10 }, created_at: iso(-1), user: userCard('aarav_meht', { relationship: relationship({ following: true }) }) },
    { id: 2, kind: 'streak', data: { days: 7 }, created_at: iso(-5), user: userCard('diya_n', { relationship: relationship({ following: true }) }) },
    { id: 1, kind: 'league_up', data: { tier: 3, slug: 'gold', name: 'Gold' }, created_at: iso(-30), user: userCard('aarav_meht', { relationship: relationship({ following: true }) }) },
  ],
  next_cursor: null,
});

const node = (id: string, name: string, available: number, attempted: number, correct: number, stars: number) =>
  ({ id, slug: id, name, available, attempted, correct, stars });

export const practiceTree = () => SECTIONS.map((s, si) => ({
  ...node(`s${si}`, s, 400 - si * 80, 210 - si * 70, 158 - si * 57, 3 - si),
  description: ['Numbers, arithmetic and data interpretation.', 'Puzzles, series, coding and arrangements.', 'Grammar, vocabulary and reading.'][si],
  topics: [0, 1, 2].map((ti) => ({
    ...node(`t${si}${ti}`, [['Speed & Distance', 'Percentages', 'Time & Work'], ['Coding-Decoding', 'Blood Relations', 'Series'], ['Antonyms', 'Synonyms', 'Reading Comprehension']][si][ti], 60, 30 - ti * 10, 22 - ti * 8, 4 - ti),
    subtopics: [0, 1, 2].map((sti) => ({
      ...node(`st${si}${ti}${sti}`, ['Basics', 'Applied problems', 'Advanced'][sti], 20, 12 - sti * 4, 9 - sti * 4, 3 - sti),
      weak: sti === 2,
    })),
  })),
}));

export const activity = (days: number) => ({
  today: day(0),
  daily_target: 10,
  today_count: 6,
  days: Array.from({ length: days }, (_, i) => {
    const n = (i * 7 + 3) % 13;
    return { date: day(i - days + 1), attempted: i % 5 === 0 ? 0 : n, correct: Math.floor(n * 0.7), xp: n * 9, time_ms: n * 40_000 };
  }),
  recent_sets: Array.from({ length: 6 }, (_, i) => ({ daily_set_id: `ds${i}`, set_date: day(-i - 1), total: 10, answered: 10 - (i % 3), correct: 7 - (i % 4), xp: 70 - i * 5 })),
});

export const mistakes = () => ({
  total: 14,
  resolved: 5,
  entries: [0, 2, 4].map((i) => ({
    ...questionCard(i),
    attempt_id: `a${i}`,
    context: i === 2 ? 'practice' : 'daily',
    answered_at: iso(-24 * (i + 1)),
    selected_option_id: `q${i + 1}-o1`,
    gave_up: false,
    correct_option_id: `q${i + 1}-o2`,
    explanation: 'Speed = distance / time = 240 / 12 = 20 m/s, and $20 \\times \\frac{18}{5} = 72$ km/h.',
    hint: 'Convert m/s to km/h by multiplying by 18/5.',
    resolved: false,
    can_retry: true,
  })),
});

export const contests = () => [
  { id: 'c-live', slug: 'weekend-sprint', title: 'Weekend Sprint #14', description: '20 mixed questions in 30 minutes.', starts_at: iso(-0.5), ends_at: iso(1.5), state: 'live', question_count: 20, participants: 312, my_entry: { score: 640, correct: 8, answered: 9, time_ms: 410_000, rank: 27 } },
  { id: 'c-up', slug: 'quant-blitz', title: 'Quant Blitz', description: 'Fast arithmetic for bank exams.', starts_at: iso(30), ends_at: iso(31), state: 'upcoming', question_count: 15, participants: 88, my_entry: null },
  { id: 'c-old', slug: 'reasoning-cup', title: 'Reasoning Cup', description: null, starts_at: iso(-72), ends_at: iso(-71), state: 'ended', question_count: 25, participants: 540, my_entry: { score: 1_120, correct: 18, answered: 25, time_ms: 3_100_000, rank: 41 } },
];

export const contest = (id: string) => {
  const base = contests().find((c) => c.id === id) ?? contests()[0];
  return {
    ...base,
    joined: base.my_entry !== null,
    questions: base.state === 'upcoming' ? null : Array.from({ length: 5 }, (_, i) => ({
      ...questionCard(i), position: i + 1,
      answer: i < 3 ? { selected_option_id: `q${i + 1}-o2`, is_correct: i !== 1, points: i !== 1 ? 80 : 0 } : null,
      correct_option_id: base.state === 'ended' ? `q${i + 1}-o2` : null,
      explanation: base.state === 'ended' ? 'Work it out step by step.' : null,
    })),
  };
};

export const standings = () => ({
  total: 312,
  entries: NAMES.slice(0, 10).map((n, i) => ({
    rank: i + 1, user_id: n === 'Priya Sharma' ? ME : `u${i}`, handle: handleOf(n), display_name: n, avatar_url: null,
    score: 1_500 - i * 90, correct: 18 - i, answered: 20, time_ms: 900_000 + i * 30_000, is_me: n === 'Priya Sharma',
  })),
  me: { rank: 4, score: 1_230, correct: 15, answered: 20, time_ms: 990_000 },
});

export const examTags = () => [
  { slug: 'placements', name: 'Campus placements' }, { slug: 'cat', name: 'CAT' }, { slug: 'banking', name: 'Banking' },
  { slug: 'ssc', name: 'SSC' }, { slug: 'gate', name: 'GATE' },
];

export const levels = () => ['Beginner', 'Learner', 'Solver', 'Analyst', 'Strategist', 'Expert', 'Master'].map((name, i) => ({ level: i + 1, name, slug: name.toLowerCase() }));

export const answerResult = (questionId: string, optionId: string) => ({
  attempt_id: 'att', context: 'daily', is_correct: optionId.endsWith('o2'), correct_option_id: `${questionId}-o2`,
  explanation: 'Speed = distance / time = 240 / 12 = 20 m/s. Multiply by $\\frac{18}{5}$ to get **72 km/h**.',
  xp_awarded: optionId.endsWith('o2') ? 10 : 0, used_hint: false, current_streak: 12, longest_streak: 21,
});

// Admin ----------------------------------------------------------------------

const subtopicRef = { id: 'st000', name: 'Basics', topic: { id: 't00', name: 'Speed & Distance', section: { id: 's0', name: SECTIONS[0] } } };

export const adminTaxonomy = () => practiceTree().map((s) => ({
  id: s.id, name: s.name, is_active: true,
  topics: s.topics.map((t) => ({ id: t.id, name: t.name, is_active: true, subtopics: t.subtopics.map((st) => ({ id: st.id, name: st.name, is_active: true })) })),
}));

export const adminTags = () => [{ slug: 'speed', name: 'Speed' }, { slug: 'ratio', name: 'Ratio' }, { slug: 'tcs', name: 'TCS' }];

const STATUSES = ['in_review', 'published', 'draft', 'retired'];

export const adminQuestions = () => ({
  count: 128,
  rows: Array.from({ length: 8 }, (_, i) => ({
    id: `aq${i}`, stem: STEMS[i], difficulty: DIFFS[i % 3], status: STATUSES[i % 4], source: i % 2 ? 'ai' : 'manual',
    created_at: iso(-24 * i), open_reports: i === 1 ? 2 : 0, subtopic: subtopicRef, model: i % 2 ? 'google/gemini-2.5-flash' : null,
    explanation: 'Explanation text.', options: opts(`aq${i}`, OPTIONS[i]), answer: { correct_option_id: `aq${i}-o2` }, tags: ['speed'],
  })),
});

export const adminQuestion = (id: string) => ({
  ...adminQuestions().rows[0], id, subtopic_id: 'st000', est_seconds: 60, hint: 'Think in m/s first.',
  section: { id: 's0', name: SECTIONS[0] }, topic: { id: 't00', name: 'Speed & Distance' }, subtopic: { id: 'st000', name: 'Basics' },
  created_by_handle: 'admin', reviewed_by_handle: null, reviewed_at: null, review_note: null, prompt_version: 'v3',
  generation_job_id: null, attempts: 214,
});

export const adminUsers = () => NAMES.slice(0, 8).map((n, i) => ({
  id: `u${i}`, handle: handleOf(n), display_name: n, email: `${handleOf(n)}@example.com`, role: i === 0 ? 'admin' : 'user',
  created_at: iso(-24 * (60 - i)), last_sign_in_at: iso(-i), banned_at: i === 5 ? iso(-24) : null, banned_reason: i === 5 ? 'Spam reports' : null,
  attempts: 400 - i * 30, correct: 300 - i * 25, xp: 5_000 - i * 400, level: 7 - (i % 4), current_streak: 10 - i, longest_streak: 20 - i,
  timezone: 'Asia/Kolkata', total_count: 8,
}));

export const adminReports = () => ({
  count: 3,
  rows: ['wrong_answer', 'ambiguous', 'typo'].map((reason, i) => ({
    id: `r${i}`, reason, status: ['open', 'triaged', 'resolved'][i], details: 'Option B should be correct; 240/12 = 20 m/s = 72 km/h.',
    created_at: iso(-5 * i), resolution_note: i === 2 ? 'Fixed the typo.' : null, resolved_at: i === 2 ? iso(-1) : null,
    reporter: { id: `u${i}xxxxxxxx`, handle: handleOf(NAMES[i]) }, resolver: i === 2 ? { handle: 'admin' } : null,
    question: { id: `aq${i}`, stem: STEMS[i], status: 'published' },
  })),
});

export const adminJobs = () => ({
  count: 2,
  rows: [
    { id: 'job-1aaaaaaa', status: 'running', requested: 30, inserted: 12, batches: 2, max_batches: 5, last_error: null, created_at: iso(-0.3), finished_at: null, subtopic: subtopicRef, difficulty: 'medium', model: 'google/gemini-2.5-flash' },
    { id: 'job-2bbbbbbb', status: 'failed', requested: 20, inserted: 8, batches: 3, max_batches: 3, last_error: 'Rate limited by provider', created_at: iso(-30), finished_at: iso(-29), subtopic: subtopicRef, difficulty: 'hard', model: 'google/gemini-2.5-flash' },
  ],
});

export const adminAudit = () => ({
  count: 3,
  rows: [
    { id: 1, action: 'status_change', entity_type: 'question', entity_id: 'aq0aaaaaaaa', question_ref: 'aq0', created_at: iso(-1), actor: { id: 'u0xxxxxxxx', handle: 'admin' }, before: { status: 'in_review' }, after: { status: 'published' } },
    { id: 2, action: 'update', entity_type: 'question', entity_id: 'aq1aaaaaaaa', question_ref: 'aq1', created_at: iso(-3), actor: { id: 'u0xxxxxxxx', handle: 'admin' }, before: { stem: 'Old' }, after: { stem: 'New' } },
    { id: 3, action: 'ban', entity_type: 'user', entity_id: 'u5aaaaaaaa', question_ref: null, created_at: iso(-24), actor: { id: 'u0xxxxxxxx', handle: 'admin' }, before: null, after: { banned: true } },
  ],
});

export const adminAttempts = () => ({
  count: 2,
  rows: [0, 1].map((i) => ({ id: `at${i}`, created_at: iso(-i), question: { id: `aq${i}`, stem: STEMS[i] }, context: 'daily', is_correct: i === 0, used_hint: false, time_ms: 42_000, xp_awarded: i === 0 ? 10 : 0 })),
});

// Community: 48-hour posts -----------------------------------------------------

/** A live post. `expiresInHours` counts from FIXED_NOW; created_at is 48 hours earlier. */
export const post = (id: string, expiresInHours: number, over: Record<string, unknown> = {}) => ({
  id, kind: 'tip', body: `Post ${id}: convert km/h to m/s by multiplying by 5/18.`, spoiler: false, spoiler_locked: false,
  question: null, topic: { id: 't00', name: 'Speed & Distance' }, exam_tag: null, poll: null,
  created_at: iso(expiresInHours - 48), expires_at: iso(expiresInHours), like_count: 2, reply_count: 1, my_reaction: null,
  is_mine: false, status: null, author_verified: false, author: userCard('aarav_meht'), ...over,
});

export const feedPage = (posts: unknown[] = [post('a', 5.2), post('b', 30)]) => ({
  items: posts, next_cursor: null, server_now: FIXED_NOW.toISOString(),
});

export const replies = () => ({
  items: [{ id: 'r1', post_id: 'a', body: 'Thanks, that helped!', created_at: iso(-1), expires_at: iso(5.2), is_mine: false, can_delete: false, author: userCard('diya_n') }],
  next_cursor: null, server_now: FIXED_NOW.toISOString(),
});

export const adminPostReports = () => ({
  total: 1,
  items: [{
    id: 'p-rep', kind: 'tip', body: 'Totally legit tip, message me on a chat app', status: 'hidden', report_count: 3, created_at: iso(-30),
    expires_at: iso(18), reviewed_at: null, question_id: null,
    author: { id: 'u9', handle: 'spammy_sam', strikes_30d: 2 }, reports: [{ reason: 'spam', count: 2 }, { reason: 'abuse', count: 1 }],
  }],
});
