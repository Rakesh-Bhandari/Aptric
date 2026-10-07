import { useId, useState } from 'react';
import { Dices, Eye, Trash2 } from 'lucide-react';
import { Markdown } from '@/components/markdown/Markdown';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { FieldHint, Label, Select } from '@/components/ui/input';
import { useToast } from '@/context/ToastContext';
import * as api from '@/lib/api';
import { errorCode, friendlyError } from '@/lib/errors';
import { DIFFICULTY_LABEL } from '@/lib/game';
import { MAX_QUESTIONS, seenWarning } from '@/lib/hosting';
import { usePracticeTree } from '@/lib/queries';
import type { Difficulty, PickedQuestion } from '@/lib/types';

export type PickedItem = Pick<PickedQuestion, 'id' | 'stem' | 'difficulty' | 'seen'> & { subtopic?: string };

/**
 * Hosts choose from published, verified Aptric questions only (there is no way to write one). The picker draws
 * random questions inside a section / topic / difficulty; it never shows an answer. A question you wrote or used in
 * your last contests is not offered.
 */
export const QuestionPicker = ({ items, onChange, disabled }: { items: PickedItem[]; onChange: (items: PickedItem[]) => void; disabled?: boolean }) => {
  const toast = useToast();
  const tree = usePracticeTree();
  const [sectionId, setSectionId] = useState('');
  const [topicId, setTopicId] = useState('');
  const [difficulty, setDifficulty] = useState<Difficulty | ''>('');
  const [count, setCount] = useState(5);
  const [busy, setBusy] = useState(false);
  const ids = { section: useId(), topic: useId(), difficulty: useId(), count: useId() };
  const sections = tree.data ?? [];
  const section = sections.find((s) => s.id === sectionId);
  const room = MAX_QUESTIONS - items.length;
  const seen = items.filter((i) => i.seen).length;
  const warning = seenWarning(seen);

  const pick = async (replace: boolean) => {
    setBusy(true);
    try {
      const keep = replace ? [] : items;
      const want = Math.min(count, MAX_QUESTIONS - keep.length);
      const got = await api.hostPickQuestions({
        sectionId: sectionId || undefined, topicId: topicId || undefined, difficulty: difficulty || undefined,
        count: want, excludeIds: keep.map((i) => i.id),
      });
      if (got.length < want) toast.info(got.length === 0 ? 'No more questions match. Try a wider topic.' : `Only ${got.length} matching ${got.length === 1 ? 'question was' : 'questions were'} free.`);
      onChange([...keep, ...got]);
    } catch (err) {
      toast.error(['42501', '22023', 'RL429'].includes(errorCode(err) ?? '') ? (err as Error).message : friendlyError(err, "We couldn't pick questions."));
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="space-y-4">
      {!disabled && (
        <Card className="space-y-3 p-4">
          <div className="grid gap-3 sm:grid-cols-4">
            <div className="space-y-1.5">
              <Label htmlFor={ids.section}>Section</Label>
              <Select id={ids.section} value={sectionId} onChange={(e) => { setSectionId(e.target.value); setTopicId(''); }}>
                <option value="">Any</option>
                {sections.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
              </Select>
            </div>
            <div className="space-y-1.5">
              <Label htmlFor={ids.topic}>Topic</Label>
              <Select id={ids.topic} value={topicId} onChange={(e) => setTopicId(e.target.value)} disabled={!section}>
                <option value="">Any</option>
                {(section?.topics ?? []).map((t) => <option key={t.id} value={t.id}>{t.name}</option>)}
              </Select>
            </div>
            <div className="space-y-1.5">
              <Label htmlFor={ids.difficulty}>Difficulty</Label>
              <Select id={ids.difficulty} value={difficulty} onChange={(e) => setDifficulty(e.target.value as Difficulty | '')}>
                <option value="">Any</option>
                {(Object.keys(DIFFICULTY_LABEL) as Difficulty[]).map((d) => <option key={d} value={d}>{DIFFICULTY_LABEL[d]}</option>)}
              </Select>
            </div>
            <div className="space-y-1.5">
              <Label htmlFor={ids.count}>How many</Label>
              <Select id={ids.count} value={count} onChange={(e) => setCount(Number(e.target.value))}>
                {[5, 10, 15, 20, 30].map((n) => <option key={n} value={n}>{n}</option>)}
              </Select>
            </div>
          </div>
          <div className="flex flex-wrap gap-2">
            <Button type="button" variant="secondary" onClick={() => void pick(false)} loading={busy} disabled={room <= 0}><Dices /> Add random questions</Button>
            {items.length > 0 && <Button type="button" variant="ghost" onClick={() => void pick(true)} disabled={busy}>Draw a new set</Button>}
          </div>
          <FieldHint>Questions are random and come from Aptric's verified bank. You cannot write your own, and you never see the answers.</FieldHint>
        </Card>
      )}

      {warning && <p role="status" className="flex items-start gap-2 rounded-md bg-warning-soft px-3 py-2 text-sm text-warning-soft-foreground"><Eye className="mt-0.5 size-4 shrink-0" aria-hidden /> {warning}</p>}

      {items.length === 0
        ? <p className="text-sm text-muted-foreground">No questions yet. A contest needs 5 to {MAX_QUESTIONS}.</p>
        : (
          <ol aria-label="Questions in this contest" className="divide-y rounded-lg border bg-card">
            {items.map((q, i) => (
              <li key={q.id} className="flex items-start gap-3 px-3 py-3">
                <span className="mt-0.5 w-6 shrink-0 text-right text-sm font-semibold tabular-nums text-muted-foreground">{i + 1}.</span>
                <div className="min-w-0 flex-1 space-y-1">
                  <div className="line-clamp-2 text-sm text-heading"><Markdown text={q.stem} inline /></div>
                  <div className="flex flex-wrap gap-1.5"><Badge variant="muted">{DIFFICULTY_LABEL[q.difficulty]}</Badge>{q.subtopic && <Badge variant="muted">{q.subtopic}</Badge>}{q.seen && <Badge variant="warning">You have seen this</Badge>}</div>
                </div>
                {!disabled && <Button type="button" variant="ghost" size="icon" aria-label={`Remove question ${i + 1}`} onClick={() => onChange(items.filter((x) => x.id !== q.id))}><Trash2 /></Button>}
              </li>
            ))}
          </ol>
        )}
    </div>
  );
};
