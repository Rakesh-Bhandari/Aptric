import { useCallback, useEffect, useState } from 'react';
import { Link, useOutletContext, useSearchParams } from 'react-router-dom';
import { useToast } from '@/context/ToastContext';
import { errorMessage, listPostReports, moderatePost } from './api';
import { Badge, Empty, ErrorNote, Pager } from './AdminUi';
import { formatDate, label } from './adminUtils';

const PAGE_SIZE = 20;

const PostCard = ({ post, onChanged }) => {
    const toast = useToast();
    const [note, setNote] = useState('');
    const [busy, setBusy] = useState(false);

    // Audited by admin_moderate_post (audit_log, with a hash of the text, not the text).
    const act = async (action) => {
        setBusy(true);
        try {
            await moderatePost(post.id, action, note);
            toast.success(`Post ${action === 'dismiss' ? 'dismissed' : `${action}${action.endsWith('e') ? 'd' : 'ed'}`}.`);
            onChanged();
        } catch (err) {
            toast.error(errorMessage(err));
        } finally {
            setBusy(false);
        }
    };

    return (
        <article className="adm-card adm-report">
            <header className="adm-report-head">
                <Badge value={post.status} />
                <strong>{label(post.kind)}</strong>
                <span className="adm-sub">
                    by <Link to={`/admin/users/${post.author.id}`}>@{post.author.handle}</Link>
                    {post.author.strikes_30d > 0 && <> · <strong>{post.author.strikes_30d} removal{post.author.strikes_30d === 1 ? '' : 's'} in 30 days</strong></>}
                    {' · '}expires {formatDate(post.expires_at)}
                </span>
            </header>
            <blockquote className="adm-quote" style={{ whiteSpace: 'pre-wrap' }}>{post.body}</blockquote>
            <p className="adm-sub">
                {post.report_count} report{post.report_count === 1 ? '' : 's'}:{' '}
                {post.reports.map((r) => `${label(r.reason)} × ${r.count}`).join(', ') || 'none'}
                {post.reviewed_at ? ` · reviewed ${formatDate(post.reviewed_at)}` : ''}
            </p>
            <div className="adm-report-actions">
                <input type="text" aria-label="Note for the audit log" placeholder="Note (optional)" maxLength={500} value={note} onChange={(e) => setNote(e.target.value)} />
                {post.status !== 'visible' && <button type="button" className="adm-btn" disabled={busy} onClick={() => act('restore')}>Restore</button>}
                {post.status === 'visible' && <button type="button" className="adm-btn" disabled={busy} onClick={() => act('hide')}>Hide</button>}
                {post.status !== 'removed' && <button type="button" className="adm-btn adm-btn-primary" disabled={busy} onClick={() => act('remove')}>Remove</button>}
                {!post.reviewed_at && <button type="button" className="adm-btn" disabled={busy} onClick={() => act('dismiss')}>Dismiss reports</button>}
            </div>
        </article>
    );
};

// Live posts waiting for a moderator: three reporters hide a post; nothing is shown after its 48 hours.
const PostReports = () => {
    const { refreshCounts } = useOutletContext();
    const [params, setParams] = useSearchParams();
    const status = params.get('status') === 'all' ? 'all' : 'pending';
    const page = Number(params.get('page') ?? 0) || 0;
    const [data, setData] = useState(null);
    const [error, setError] = useState(null);

    const load = useCallback(async () => {
        try {
            setError(null);
            setData(await listPostReports({ onlyStatus: status, page, pageSize: PAGE_SIZE }));
        } catch (err) {
            setError(errorMessage(err));
        }
    }, [status, page]);

    useEffect(() => { load(); }, [load]);

    const changed = () => { load(); refreshCounts?.(); };

    return (
        <div className="adm-page">
            <h1>Community posts</h1>
            <p className="adm-sub">Posts last 48 hours. Reports against a deleted post are kept as a snapshot (author, hash of the text, reasons) for 30 days.</p>
            <div className="adm-filters">
                <select aria-label="Show" value={status} onChange={(e) => setParams({ status: e.target.value })}>
                    <option value="pending">Waiting for review</option>
                    <option value="all">All reported or hidden</option>
                </select>
            </div>
            <ErrorNote error={error} onRetry={load} />
            {!data && !error && <p role="status">Loading…</p>}
            {data && data.items.length === 0 && <Empty>Nothing to review.</Empty>}
            {data?.items.map((p) => <PostCard key={p.id} post={p} onChanged={changed} />)}
            {data && data.total > PAGE_SIZE && (
                <Pager page={page} pageSize={PAGE_SIZE} count={data.total} onPage={(n) => setParams({ status, page: String(n) })} />
            )}
        </div>
    );
};

export default PostReports;
