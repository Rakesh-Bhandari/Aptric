import { Fragment, useCallback, useEffect, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { errorMessage, getContest, getContestResults } from './api';
import { Badge, Empty, ErrorNote, Pager } from './AdminUi';
import { formatDate } from './adminUtils';

const PAGE_SIZE = 50;

const clock = (ms) => `${Math.floor(ms / 60_000)}:${String(Math.floor(ms / 1000) % 60).padStart(2, '0')}`;

// Standings with each player's submissions. Banned players are listed and flagged.
const ContestResults = () => {
    const { id } = useParams();
    const [contest, setContest] = useState(null);
    const [result, setResult] = useState({ total: 0, entries: [] });
    const [page, setPage] = useState(0);
    const [open, setOpen] = useState(null);
    const [error, setError] = useState('');

    const load = useCallback(async () => {
        setError('');
        try {
            const [c, r] = await Promise.all([getContest(id), getContestResults(id, { page, pageSize: PAGE_SIZE })]);
            setContest(c);
            setResult(r);
        } catch (err) {
            setError(errorMessage(err));
        }
    }, [id, page]);
    useEffect(() => { load(); }, [load]);

    return (
        <div className="adm-page">
            <header className="adm-header">
                <Link to="/admin/contests" className="adm-back">← Contests</Link>
                <h1>{contest ? `${contest.title}: results` : 'Results'}</h1>
                {contest && <p><Badge value={contest.state} /> <span className="adm-sub">{result.total} participant{result.total === 1 ? '' : 's'} · <Link to={`/admin/contests/${id}`}>Edit contest</Link></span></p>}
            </header>
            <ErrorNote error={error} onRetry={load} />
            <div className="adm-table-wrap">
                <table className="adm-table">
                    <thead>
                        <tr><th>Rank</th><th>Player</th><th>Score</th><th>Correct</th><th>Answered</th><th>Time</th><th>Joined</th><th><span className="sr-only">Submissions</span></th></tr>
                    </thead>
                    <tbody>
                        {result.entries.map((e) => (
                            <Fragment key={e.user_id}>
                                <tr>
                                    <td>{e.rank}</td>
                                    <td>
                                        <Link to={`/admin/users/${e.user_id}`}>@{e.handle ?? e.user_id.slice(0, 8)}</Link>
                                        {e.banned && <> <Badge value="banned" /></>}
                                    </td>
                                    <td>{e.score}</td>
                                    <td>{e.correct}</td>
                                    <td>{e.answered}</td>
                                    <td>{clock(e.time_ms)}</td>
                                    <td>{formatDate(e.joined_at)}</td>
                                    <td>
                                        <button type="button" className="adm-link" aria-expanded={open === e.user_id}
                                            onClick={() => setOpen(open === e.user_id ? null : e.user_id)}>
                                            {open === e.user_id ? 'Hide' : 'Submissions'}
                                        </button>
                                    </td>
                                </tr>
                                {open === e.user_id && (
                                    <tr>
                                        <td colSpan={8}>
                                            {e.answers.length ? (
                                                <ul className="adm-plain-list">
                                                    {e.answers.map((a) => (
                                                        <li key={a.question_id}>
                                                            Q{a.position + 1} · <Link to={`/admin/questions/${a.question_id}`}>question</Link>
                                                            {' '}<Badge value={a.is_correct ? 'correct' : 'wrong'} /> {a.points} pts
                                                            <span className="adm-sub"> · {clock(a.time_ms ?? 0)} · {formatDate(a.created_at)}</span>
                                                        </li>
                                                    ))}
                                                </ul>
                                            ) : <span className="adm-sub">No answers yet.</span>}
                                        </td>
                                    </tr>
                                )}
                            </Fragment>
                        ))}
                    </tbody>
                </table>
                {contest && !result.entries.length && !error && <Empty>Nobody has joined yet.</Empty>}
            </div>
            <Pager page={page} pageSize={PAGE_SIZE} count={result.total} onPage={setPage} />
        </div>
    );
};

export default ContestResults;
