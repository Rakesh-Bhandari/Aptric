// What each notification says. `data` comes from the due-queries in jobs.js.
// url is a path in the frontend; the service worker opens it on click, and
// tag lets a newer notification of the same kind replace an older one.

const ordinal = (n) => `#${n}`;

export function messageFor(type, data = {}) {
  switch (type) {
    case 'daily':
      return { title: 'Your daily set is ready', body: 'A fresh set of questions is waiting. Keep your streak going.', url: '/', tag: 'daily' };
    case 'streak':
      return {
        title: `Keep your ${data.streak}-day streak alive`,
        body: 'Answer a question before midnight to hold on to it.',
        url: '/',
        tag: 'streak',
      };
    case 'contest_start':
      return { title: `${data.title} starts within the hour`, body: 'Get ready: the contest opens soon.', url: `/compete/contests/${data.id}`, tag: `contest-${data.id}` };
    case 'contest_end':
      return {
        title: `${data.title}: results are in`,
        body: data.rank ? `You finished ${ordinal(data.rank)}. See the standings and answers.` : 'See the standings and answers.',
        url: `/compete/contests/${data.id}`,
        tag: `contest-${data.id}`,
      };
    case 'league': {
      const tier = data.tier ?? 'your league';
      const title = {
        promoted: `Promoted to ${tier}!`,
        demoted: `Moved down to ${tier}`,
        stayed: `You stayed in ${tier}`,
      }[data.outcome];
      if (!title) return null;
      return {
        title,
        body: `You finished ${ordinal(data.final_rank)} in last week's league. A new week has started.`,
        url: '/compete',
        tag: 'league',
      };
    }
    default:
      return null;
  }
}
