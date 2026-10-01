import { useEffect, useMemo, useState } from 'react';
import { useToast } from '../../context/ToastContext';
import './DailyResultCard.css';

// Shareable summary of a daily challenge (data from get_daily_result). It
// carries outcomes only, never questions or answers, so sharing spoils nothing.

const OUTCOMES = {
    correct:    { emoji: '🟩', color: '#2ea043', label: 'Correct' },
    hinted:     { emoji: '🟨', color: '#d29922', label: 'Correct with hint' },
    wrong:      { emoji: '🟥', color: '#f85149', label: 'Wrong' },
    gave_up:    { emoji: '⬛', color: '#30363d', label: 'Gave up' },
    unanswered: { emoji: '⬜', color: '#8b949e', label: 'Unanswered' },
};

const formatDate = (isoDate) =>
    new Date(`${isoDate}T00:00:00Z`).toLocaleDateString(undefined, { day: 'numeric', month: 'short', year: 'numeric', timeZone: 'UTC' });

const signed = (n) => (n > 0 ? `+${n}` : `${n}`);

export const shareText = (result, url = window.location.origin) => {
    const grid = result.questions.map(q => OUTCOMES[q.outcome]?.emoji ?? '⬜').join('');
    const parts = [`🔥 ${result.current_streak}-day streak`, `⭐ +${result.xp_earned} XP`];
    if (result.rating) parts.push(`📈 ${result.rating.after} (${signed(result.rating.delta)})`);
    return [
        `Aptric Daily · ${formatDate(result.set_date)} · ${result.track?.name ?? ''}`,
        `${grid} ${result.correct}/${result.total}`,
        parts.join(' · '),
        url,
    ].join('\n');
};

// Draws the card as a 1200×630 PNG (the usual social preview size). Plain
// shapes and text only, so it renders the same without emoji fonts.
const renderImage = (result) => new Promise((resolve, reject) => {
    const W = 1200, H = 630;
    const canvas = document.createElement('canvas');
    canvas.width = W;
    canvas.height = H;
    const ctx = canvas.getContext('2d');

    const bg = ctx.createLinearGradient(0, 0, W, H);
    bg.addColorStop(0, '#05090f');
    bg.addColorStop(1, '#0d1a12');
    ctx.fillStyle = bg;
    ctx.fillRect(0, 0, W, H);
    ctx.strokeStyle = 'rgba(46, 160, 67, 0.6)';
    ctx.lineWidth = 4;
    ctx.strokeRect(24, 24, W - 48, H - 48);

    ctx.fillStyle = '#2ea043';
    ctx.font = 'bold 30px "JetBrains Mono", monospace';
    ctx.fillText('APTRIC // DAILY CHALLENGE', 72, 100);
    ctx.fillStyle = '#7d8590';
    ctx.font = '26px "JetBrains Mono", monospace';
    ctx.fillText(`${formatDate(result.set_date)} · ${result.track?.name ?? ''} · ${result.level?.name ?? ''}`, 72, 145);

    ctx.fillStyle = '#e6edf3';
    ctx.font = 'bold 150px "JetBrains Mono", monospace';
    ctx.fillText(`${result.correct}/${result.total}`, 72, 320);

    const n = result.questions.length;
    const size = Math.min(64, Math.floor((W - 144 - (n - 1) * 14) / Math.max(n, 1)));
    result.questions.forEach((q, i) => {
        const x = 72 + i * (size + 14);
        ctx.fillStyle = OUTCOMES[q.outcome]?.color ?? '#8b949e';
        ctx.beginPath();
        ctx.roundRect(x, 370, size, size, 10);
        ctx.fill();
    });

    const stats = [
        ['STREAK', `${result.current_streak} days`],
        ['XP', `+${result.xp_earned}`],
        ['RATING', result.rating ? `${result.rating.after} (${signed(result.rating.delta)})` : 'pending'],
    ];
    if (result.league) stats.push(['LEAGUE', `${result.league.name} #${result.league.rank}`]);
    const colW = (W - 144) / stats.length;
    stats.forEach(([label, value], i) => {
        const x = 72 + i * colW;
        ctx.fillStyle = '#7d8590';
        ctx.font = '22px "JetBrains Mono", monospace';
        ctx.fillText(label, x, 515);
        ctx.fillStyle = '#e6edf3';
        ctx.font = 'bold 34px "JetBrains Mono", monospace';
        ctx.fillText(value, x, 560);
    });

    ctx.fillStyle = '#7d8590';
    ctx.font = '22px "JetBrains Mono", monospace';
    ctx.textAlign = 'right';
    ctx.fillText(`@${result.handle}`, W - 72, 100);

    canvas.toBlob(blob => (blob ? resolve(blob) : reject(new Error('Could not render the card.'))), 'image/png');
});

const DailyResultCard = ({ result, onClose }) => {
    const toast = useToast();
    const [busy, setBusy] = useState(false);
    const text = useMemo(() => shareText(result), [result]);
    const fileName = `aptric-daily-${result.set_date}.png`;

    useEffect(() => {
        const onKey = (e) => { if (e.key === 'Escape') onClose?.(); };
        window.addEventListener('keydown', onKey);
        return () => window.removeEventListener('keydown', onKey);
    }, [onClose]);

    const copyText = async () => {
        try {
            await navigator.clipboard.writeText(text);
            toast.success('Result copied to clipboard.');
        } catch {
            toast.error('Could not copy. Select the text and copy it manually.');
        }
    };

    const download = async () => {
        setBusy(true);
        try {
            const url = URL.createObjectURL(await renderImage(result));
            const a = document.createElement('a');
            a.href = url;
            a.download = fileName;
            a.click();
            setTimeout(() => URL.revokeObjectURL(url), 1000);
        } catch (err) {
            toast.error(err.message);
        } finally {
            setBusy(false);
        }
    };

    const share = async () => {
        if (!navigator.share) return copyText();
        setBusy(true);
        try {
            const file = new File([await renderImage(result)], fileName, { type: 'image/png' });
            const withImage = navigator.canShare?.({ files: [file] });
            await navigator.share(withImage ? { text, files: [file] } : { text });
        } catch (err) {
            if (err?.name !== 'AbortError') await copyText();
        } finally {
            setBusy(false);
        }
    };

    return (
        <div className="drc-backdrop" onClick={onClose}>
            <div className="drc-modal" role="dialog" aria-modal="true" aria-labelledby="drc-title" onClick={e => e.stopPropagation()}>
                <button type="button" className="drc-close" onClick={onClose} aria-label="Close">✕</button>

                <div className="drc-card">
                    <div className="drc-head">
                        <span id="drc-title" className="drc-brand">APTRIC // DAILY</span>
                        <span className="drc-handle">@{result.handle}</span>
                    </div>
                    <div className="drc-meta">
                        {formatDate(result.set_date)} · {result.track?.name} · {result.level?.name}
                    </div>

                    <div className="drc-score">
                        {result.correct}<span>/{result.total}</span>
                    </div>
                    {!result.complete && (
                        <div className="drc-note">{result.total - result.answered} left to answer</div>
                    )}

                    <div className="drc-grid" aria-label="Question outcomes">
                        {result.questions.map(q => (
                            <span key={q.position} className={`drc-cell ${q.outcome}`}
                                title={`Q${q.position + 1} · ${q.difficulty} · ${OUTCOMES[q.outcome]?.label}`} />
                        ))}
                    </div>

                    <div className="drc-stats">
                        <div><span>STREAK</span><strong>🔥 {result.current_streak}</strong></div>
                        <div><span>XP</span><strong>+{result.xp_earned}</strong></div>
                        <div>
                            <span>RATING</span>
                            {result.rating
                                ? <strong>{result.rating.after} <em className={result.rating.delta >= 0 ? 'up' : 'down'}>{signed(result.rating.delta)}</em></strong>
                                : <strong className="muted" title="Rated when the set is finished, or once the day ends">pending</strong>}
                        </div>
                        {result.league && (
                            <div><span>LEAGUE</span><strong>{result.league.name} #{result.league.rank}</strong></div>
                        )}
                    </div>
                </div>

                <pre className="drc-text">{text}</pre>

                <div className="drc-actions">
                    <button type="button" className="cmd-btn primary" onClick={share} disabled={busy}>SHARE</button>
                    <button type="button" className="cmd-btn" onClick={copyText} disabled={busy}>COPY_TEXT</button>
                    <button type="button" className="cmd-btn" onClick={download} disabled={busy}>DOWNLOAD_PNG</button>
                </div>
            </div>
        </div>
    );
};

export default DailyResultCard;
