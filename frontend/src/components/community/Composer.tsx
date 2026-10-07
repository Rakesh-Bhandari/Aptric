import { useId, useState, type FormEvent } from 'react';
import { Info } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent } from '@/components/ui/dialog';
import { FieldHint, Input, Label, Select, Textarea } from '@/components/ui/input';
import { useToast } from '@/context/ToastContext';
import * as api from '@/lib/api';
import { errorCode, friendlyError } from '@/lib/errors';
import { KIND_LABEL, mentionsAnswer } from '@/lib/posts';
import { invalidateFeeds, useExamTags, useTopics } from '@/lib/queries';
import type { NewPost, PostKind } from '@/lib/types';

const KINDS = Object.keys(KIND_LABEL) as PostKind[];
const MAX = 500;

/** Write a post. It is public for 48 hours, cannot be edited, and can be deleted at any time. */
export const Composer = ({ open, onOpenChange, questionId = null, defaultTopicId = null }: {
  open: boolean; onOpenChange: (open: boolean) => void; questionId?: string | null; defaultTopicId?: string | null;
}) => {
  const toast = useToast();
  const topics = useTopics();
  const exams = useExamTags();
  const [kind, setKind] = useState<PostKind>(questionId ? 'question' : 'tip');
  const [body, setBody] = useState('');
  const [topicId, setTopicId] = useState(defaultTopicId ?? '');
  const [exam, setExam] = useState('');
  const [options, setOptions] = useState(['', '']);
  const [spoiler, setSpoiler] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const ids = { kind: useId(), body: useId(), topic: useId(), exam: useId(), spoiler: useId() };

  const leaks = Boolean(questionId) && mentionsAnswer(body);
  const needsExam = kind === 'study_buddy';
  const valid = body.trim().length > 0 && body.length <= MAX && (!needsExam || exam)
    && (kind !== 'poll' || options.filter((o) => o.trim()).length >= 2);

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    if (!valid) return;
    const post: NewPost = { kind, body: body.trim() };
    if (questionId) { post.question_id = questionId; post.contains_spoiler = spoiler; }
    if (topicId) post.topic_id = topicId;
    if (exam) post.exam_tag = exam;
    if (kind === 'poll') post.poll_options = options.map((o) => o.trim()).filter(Boolean);
    setBusy(true);
    setError('');
    try {
      await api.createPost(post);
      toast.success('Posted. It will disappear in 48 hours.');
      setBody(''); setOptions(['', '']); setSpoiler(false);
      onOpenChange(false);
      await invalidateFeeds();
    } catch (err) {
      const code = errorCode(err);
      if (code === 'SP422') setSpoiler(true);
      // These messages are written for the player.
      setError(['22023', '55000', 'SP422', 'P0002'].includes(code ?? '') ? (err as Error).message : friendlyError(err, "We couldn't post that."));
    } finally {
      setBusy(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent title="New post" description="Visible to everyone for 48 hours.">
        <form className="space-y-4" onSubmit={submit}>
          <div className="space-y-1.5">
            <Label htmlFor={ids.kind}>What is it?</Label>
            <Select id={ids.kind} value={kind} onChange={(e) => setKind(e.target.value as PostKind)}>
              {KINDS.map((k) => <option key={k} value={k}>{KIND_LABEL[k]}</option>)}
            </Select>
          </div>
          <div className="space-y-1.5">
            <Label htmlFor={ids.body}>{kind === 'poll' ? 'Your question' : 'Your post'}</Label>
            <Textarea id={ids.body} value={body} onChange={(e) => setBody(e.target.value)} maxLength={MAX} required aria-describedby={`${ids.body}-hint`} />
            <FieldHint id={`${ids.body}-hint`}>{body.length}/{MAX} · plain text, **bold**, *italic*, $maths$</FieldHint>
          </div>
          {kind === 'poll' && (
            <fieldset className="space-y-2">
              <legend className="text-sm font-semibold text-heading">Options (2 to 4)</legend>
              {options.map((o, i) => (
                <Input key={i} aria-label={`Option ${i + 1}`} value={o} maxLength={40} placeholder={`Option ${i + 1}`}
                  onChange={(e) => setOptions((all) => all.map((x, j) => (j === i ? e.target.value : x)))} />
              ))}
              {options.length < 4 && <Button type="button" variant="ghost" size="sm" onClick={() => setOptions((o) => [...o, ''])}>Add an option</Button>}
            </fieldset>
          )}
          <div className="grid gap-3 sm:grid-cols-2">
            <div className="space-y-1.5">
              <Label htmlFor={ids.topic}>Topic (optional)</Label>
              <Select id={ids.topic} value={topicId} onChange={(e) => setTopicId(e.target.value)}>
                <option value="">None</option>
                {(topics.data ?? []).map((t) => <option key={t.id} value={t.id}>{t.name}</option>)}
              </Select>
            </div>
            <div className="space-y-1.5">
              <Label htmlFor={ids.exam}>Exam{needsExam ? '' : ' (optional)'}</Label>
              <Select id={ids.exam} value={exam} required={needsExam} onChange={(e) => setExam(e.target.value)}>
                <option value="">{needsExam ? 'Choose an exam' : 'None'}</option>
                {(exams.data ?? []).map((t) => <option key={t.slug} value={t.slug}>{t.name}</option>)}
              </Select>
            </div>
          </div>
          {questionId && (
            <div className="space-y-2 rounded-md border bg-muted/40 p-3 text-sm">
              <p>This post is about the question you just solved. People who have not tried it only see its wording.</p>
              <div className="flex items-start gap-2">
                <input id={ids.spoiler} type="checkbox" checked={spoiler} onChange={(e) => setSpoiler(e.target.checked)} className="mt-1 size-4" />
                <Label htmlFor={ids.spoiler} className="font-medium">
                  Contains spoiler
                  <span className="block font-normal text-muted-foreground">Hidden from people who have not attempted the question.</span>
                </Label>
              </div>
              {leaks && !spoiler && <p role="status" className="text-warning-soft-foreground rounded bg-warning-soft px-2 py-1">This looks like it gives away the answer. Tick “Contains spoiler”, or share a hint instead.</p>}
            </div>
          )}
          <p className="flex items-start gap-2 text-xs text-muted-foreground">
            <Info className="mt-0.5 size-3.5 shrink-0" aria-hidden />
            <span>Visible to everyone for 48 hours, then deleted. Posts cannot be edited; you can delete yours at any time. Do not share personal information.</span>
          </p>
          {error && <FieldHint error>{error}</FieldHint>}
          <div className="flex justify-end"><Button type="submit" loading={busy} disabled={!valid}>Post</Button></div>
        </form>
      </DialogContent>
    </Dialog>
  );
};
