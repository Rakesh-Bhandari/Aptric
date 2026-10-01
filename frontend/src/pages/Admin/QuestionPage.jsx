import { useCallback, useEffect, useState } from 'react';
import { Link, useOutletContext, useParams } from 'react-router-dom';
import { useToast } from '../../context/ToastContext';
import { errorMessage, getQuestion, listAudit, listReports, setQuestionStatus, STATUSES } from '../../lib/admin';
import { Badge, Empty, ErrorNote } from './AdminUi';
import { formatDate, label } from './adminUtils';
import { AuditEntries } from './AuditLog';
import QuestionEditor, { QuestionMeta } from './QuestionEditor';

// One question: edit it, change its status, see its reports and history.
const QuestionPage = () => {
    const { id } = useParams();
    const toast = useToast();
    const { refreshCounts } = useOutletContext();
    const [question, setQuestion] = useState(null);
    const [error, setError] = useState('');
    const [reports, setReports] = useState([]);
    const [history, setHistory] = useState([]);
    const [nextStatus, setNextStatus] = useState('');
    const [note, setNote] = useState('');
    const [busy, setBusy] = useState(false);

    const loadSide = useCallback(async () => {
        try {
            const [r, h] = await Promise.all([
                listReports({ status: '', questionId: id }, { pageSize: 50 }),
                listAudit({ questionRef: id }, { pageSize: 50 }),
            ]);
            setReports(r.rows);
            setHistory(h.rows);
        } catch { /* side panels are best-effort */ }
    }, [id]);

    const load = useCallback(async () => {
        setError('');
        try {
            setQuestion(await getQuestion(id));
        } catch (err) {
            setError(errorMessage(err));
        }
        loadSide();
    }, [id, loadSide]);

    useEffect(() => { setQuestion(null); load(); }, [load]);

    const onSaved = (q) => { setQuestion(q); toast.success('Saved.'); loadSide(); };

    const changeStatus = async () => {
        if (!nextStatus) return;
        setBusy(true);
        try {
            const moved = await setQuestionStatus([id], nextStatus, { note, fromStatus: question.status });
            if (!moved) toast.warning('The question changed status meanwhile; reloaded.');
            else toast.success(`Moved to ${label(nextStatus)}.`);
            setNextStatus('');
            setNote('');
            refreshCounts();
            await load();
        } catch (err) {
            toast.error(errorMessage(err));
        } finally {
            setBusy(false);
        }
    };

    if (error) return <div className="adm-page"><ErrorNote error={error} onRetry={load} /></div>;
    if (!question) return <div className="adm-page"><Empty>Loading…</Empty></div>;

    return (
        <div className="adm-page">
            <header className="adm-header">
                <Link to="/admin/questions" className="adm-back">← Questions</Link>
                <h1>{question.section.name} › {question.topic.name} › {question.subtopic.name}</h1>
                <p className="adm-mono">{question.id}</p>
            </header>

            <QuestionMeta question={question} />

            <div className="adm-card adm-status-card">
                <span>Status: <Badge value={question.status} /></span>
                <select value={nextStatus} onChange={(e) => setNextStatus(e.target.value)} aria-label="New status">
                    <option value="">Move to…</option>
                    {STATUSES.filter((s) => s !== question.status).map((s) => <option key={s} value={s}>{label(s)}</option>)}
                </select>
                <input type="text" placeholder="Note (optional)" value={note} maxLength={2000} onChange={(e) => setNote(e.target.value)} />
                <button type="button" className="adm-btn adm-btn-primary" disabled={!nextStatus || busy} onClick={changeStatus}>Apply</button>
                {question.status === 'in_review' && <Link to="/admin/review">Review queue</Link>}
            </div>

            <QuestionEditor
                question={question}
                onSaved={onSaved}
                footer={({ dirty, saving, save }) => (
                    <div className="adm-actions">
                        <button type="button" className="adm-btn adm-btn-primary" disabled={!dirty || saving} onClick={() => save().catch(() => {})}>
                            {saving ? 'Saving…' : 'Save changes'}
                        </button>
                        {question.status === 'published' && dirty && (
                            <span className="adm-warn">This question is live: players see the edit immediately.</span>
                        )}
                    </div>
                )}
            />

            <section className="adm-section">
                <h2>Reports ({reports.length})</h2>
                {!reports.length && <Empty>No reports.</Empty>}
                <ul className="adm-plain-list">
                    {reports.map((r) => (
                        <li key={r.id}>
                            <Badge value={r.status} /> <strong>{label(r.reason)}</strong>
                            {r.details && <> — {r.details}</>}
                            <span className="adm-sub"> · {r.reporter ? <Link to={`/admin/users/${r.reporter.id}`}>@{r.reporter.handle ?? r.reporter.id.slice(0, 8)}</Link> : 'deleted user'} · {formatDate(r.created_at)}</span>
                            {r.resolution_note && <div className="adm-sub">Resolution: {r.resolution_note}</div>}
                        </li>
                    ))}
                </ul>
                {reports.some((r) => r.status === 'open' || r.status === 'triaged') && (
                    <Link to={`/admin/reports?question=${question.id}`}>Handle in the reports inbox →</Link>
                )}
            </section>

            <section className="adm-section">
                <h2>History</h2>
                <p className="adm-sub">Every audited change to this question, its options, answer key, tags and reports. <Link to={`/admin/audit?question=${question.id}`}>Open in the audit log</Link></p>
                <AuditEntries rows={history} />
            </section>
        </div>
    );
};

export default QuestionPage;
