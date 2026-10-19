import { ExternalLink, Plus, X } from 'lucide-react';
import { useId, useState } from 'react';
import type { ReactNode } from 'react';
import type {
  DecisionMeta,
  NoteMeta,
  NoteType,
  Perspective,
  Source,
} from '../../../../shared/types';
import { Button } from '../../components/ui/Button';
import { controlClass } from '../../components/ui/Field';
import { useConfirm } from '../../context/ConfirmContext';
import { useAutosize } from '../../hooks/useAutosize';
import { cn } from '../../lib/cn';
import {
  daysBetween,
  formatLongDate,
  formatRelativeDay,
  relativeDayInline,
  today,
} from '../../lib/dates';
import { useTopics } from './api';

export const NOTE_TYPES: { value: NoteType; label: string; hint: string }[] = [
  { value: 'note', label: 'Note', hint: 'Something learned, explained or worth keeping.' },
  {
    value: 'question',
    label: 'Question',
    hint: 'Something you are trying to understand or answer.',
  },
  {
    value: 'belief',
    label: 'Belief',
    hint: 'Where you stand on something. Record new perspectives over time.',
  },
  { value: 'quote', label: 'Quote', hint: 'A passage or saying, with where it came from.' },
  {
    value: 'decision',
    label: 'Decision',
    hint: 'What you decided, why, what you expect, and later what happened.',
  },
];

export const noteTypeLabel = (t: NoteType) => NOTE_TYPES.find((n) => n.value === t)!.label;

const newId = () => Math.random().toString(36).slice(2, 10);

function Row({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="grid grid-cols-1 gap-1.5 py-2 sm:grid-cols-[5.5rem_1fr] sm:items-baseline sm:gap-3">
      <div className="text-[0.8125rem] text-ink-faint">{label}</div>
      <div className="min-w-0">{children}</div>
    </div>
  );
}

/** Type, topic and sources of a knowledge note. Saved immediately; never conflicts with the text. */
export function NotePanel({
  meta,
  onChange,
}: {
  meta: Pick<NoteMeta, 'noteType' | 'topic' | 'sources'>;
  onChange: (patch: Partial<Pick<NoteMeta, 'noteType' | 'topic' | 'sources'>>) => void;
}) {
  const topics = useTopics();
  const listId = useId();
  const [topic, setTopic] = useState(meta.topic ?? '');
  const [adding, setAdding] = useState(false);
  const [label, setLabel] = useState('');
  const [url, setUrl] = useState('');

  const saveTopic = () => {
    const t = topic.trim();
    if (t !== (meta.topic ?? '')) onChange({ topic: t || null });
  };

  const addSource = () => {
    const l = label.trim();
    let u = url.trim();
    if (u && !/^https?:\/\//i.test(u)) u = `https://${u}`;
    if (!l && !u) return setAdding(false);
    onChange({ sources: [...meta.sources, { id: newId(), label: l || u, url: u || null }] });
    setLabel('');
    setUrl('');
    setAdding(false);
  };

  return (
    <div className="mt-4 border-y border-line/70 py-2">
      <Row label="Kind">
        <div className="flex flex-wrap gap-1" role="radiogroup" aria-label="Kind of note">
          {NOTE_TYPES.map((t) => (
            <button
              key={t.value}
              type="button"
              role="radio"
              aria-checked={meta.noteType === t.value}
              title={t.hint}
              onClick={() => meta.noteType !== t.value && onChange({ noteType: t.value })}
              className={cn(
                'h-8 rounded border px-2.5 text-[0.8125rem] transition-colors sm:h-7',
                meta.noteType === t.value
                  ? 'border-accent/60 bg-accent/10 text-ink'
                  : 'border-line text-ink-muted hover:border-line-strong hover:text-ink',
              )}
            >
              {t.label}
            </button>
          ))}
        </div>
      </Row>
      <Row label="Topic">
        <input
          value={topic}
          onChange={(e) => setTopic(e.target.value)}
          onBlur={saveTopic}
          onKeyDown={(e) => e.key === 'Enter' && (e.currentTarget as HTMLInputElement).blur()}
          list={listId}
          maxLength={60}
          placeholder="e.g. Religion, Philosophy, Money"
          aria-label="Topic"
          className="h-9 w-full bg-transparent text-sm text-ink placeholder:text-ink-faint focus:outline-none focus-visible:outline-none sm:h-7"
        />
        <datalist id={listId}>
          {topics.data?.map((t) => (
            <option key={t.topic} value={t.topic} />
          ))}
        </datalist>
      </Row>
      <Row label="Sources">
        <ul className="space-y-0.5">
          {meta.sources.map((s: Source) => (
            <li key={s.id} className="group flex items-center gap-2 text-sm">
              {s.url ? (
                <a
                  href={s.url}
                  target="_blank"
                  rel="noreferrer noopener"
                  className="inline-flex min-w-0 items-center gap-1.5 text-accent hover:underline"
                >
                  <span className="truncate">{s.label}</span>
                  <ExternalLink className="h-3 w-3 shrink-0" />
                </a>
              ) : (
                <span className="min-w-0 truncate text-ink-muted">{s.label}</span>
              )}
              <button
                type="button"
                aria-label={`Remove source ${s.label}`}
                onClick={() => onChange({ sources: meta.sources.filter((x) => x.id !== s.id) })}
                className="flex h-8 w-8 shrink-0 items-center justify-center rounded text-ink-faint hover:text-ink sm:h-6 sm:w-6 [@media(hover:hover)]:opacity-0 [@media(hover:hover)]:group-hover:opacity-100"
              >
                <X className="h-3 w-3" />
              </button>
            </li>
          ))}
        </ul>
        {adding ? (
          <div className="mt-1 flex flex-col gap-2 sm:flex-row">
            <input
              autoFocus
              value={label}
              onChange={(e) => setLabel(e.target.value)}
              onKeyDown={(e) => e.key === 'Enter' && addSource()}
              placeholder="Book, article, person…"
              aria-label="Source"
              className={cn(controlClass, 'h-10 sm:h-8')}
            />
            <input
              value={url}
              onChange={(e) => setUrl(e.target.value)}
              onKeyDown={(e) => e.key === 'Enter' && addSource()}
              placeholder="Link (optional)"
              aria-label="Source link"
              inputMode="url"
              autoCapitalize="none"
              className={cn(controlClass, 'h-10 sm:h-8')}
            />
            <div className="flex gap-1">
              <Button size="sm" variant="primary" onClick={addSource}>
                Add
              </Button>
              <Button size="sm" variant="ghost" onClick={() => setAdding(false)}>
                Cancel
              </Button>
            </div>
          </div>
        ) : (
          <button
            type="button"
            onClick={() => setAdding(true)}
            className="inline-flex h-9 items-center gap-1 text-[0.8125rem] text-ink-faint hover:text-ink-muted sm:h-7"
          >
            <Plus className="h-3.5 w-3.5" /> Add a source
          </button>
        )}
      </Row>
    </div>
  );
}

// ---------------------------------------------------------------- beliefs

const FIELDS: {
  key: keyof Omit<Perspective, 'id' | 'date'>;
  label: string;
  placeholder: string;
}[] = [
  { key: 'position', label: 'What I think', placeholder: 'Where do you stand right now?' },
  { key: 'reasons', label: 'Why', placeholder: 'The reasons that persuade you.' },
  {
    key: 'influences',
    label: 'What shaped this',
    placeholder: 'Evidence, books, experiences, people.',
  },
  {
    key: 'uncertainties',
    label: 'What I’m unsure about',
    placeholder: 'Open questions, doubts, the strongest objection.',
  },
];

function FieldText({ label, text }: { label: string; text: string }) {
  if (!text.trim()) return null;
  return (
    <div className="mt-3">
      <div className="text-2xs uppercase tracking-[0.1em] text-ink-faint">{label}</div>
      <p className="mt-0.5 whitespace-pre-wrap text-[0.9375rem] leading-relaxed text-ink">{text}</p>
    </div>
  );
}

function PerspectiveView({ p, className }: { p: Perspective; className?: string }) {
  return (
    <div className={cn('border-l-2 border-accent/50 pl-4', className)}>
      <div className="text-2xs uppercase tracking-[0.1em] text-ink-faint">
        {formatLongDate(p.date)}
      </div>
      <p
        className="mt-1 whitespace-pre-wrap font-serif text-[1.125rem] leading-snug text-ink"
        style={{ fontVariationSettings: "'opsz' 20" }}
      >
        {p.position || <span className="italic text-ink-faint">No position written</span>}
      </p>
      {FIELDS.slice(1).map((f) => (
        <FieldText key={f.key} label={f.label} text={p[f.key]} />
      ))}
    </div>
  );
}

function AutoText({
  value,
  onChange,
  placeholder,
  label,
}: {
  value: string;
  onChange: (v: string) => void;
  placeholder: string;
  label: string;
}) {
  const [el, setEl] = useState<HTMLTextAreaElement | null>(null);
  useAutosize({ current: el }, value, 2);
  return (
    <label className="block">
      <span className="text-[0.8125rem] text-ink-muted">{label}</span>
      <textarea
        ref={setEl}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
        rows={2}
        className={cn(controlClass, 'mt-1 resize-none overflow-hidden leading-6')}
      />
    </label>
  );
}

/**
 * Evolving beliefs: each perspective is dated and kept. Recording a new one never erases
 * the old; any two can be read side by side. Nothing is scored or judged.
 */
export function PerspectivesPanel({
  perspectives,
  onChange,
}: {
  perspectives: Perspective[];
  onChange: (next: Perspective[]) => void;
}) {
  const confirm = useConfirm();
  const sorted = [...perspectives].sort((a, b) => a.date.localeCompare(b.date));
  const latest = sorted.at(-1);
  const earlier = sorted.slice(0, -1).reverse();
  const [draft, setDraft] = useState<Perspective | null>(null);
  const [compareId, setCompareId] = useState<string | null>(null);
  const compared = earlier.find((p) => p.id === compareId) ?? null;

  const startNew = () =>
    setDraft({
      id: newId(),
      date: today(),
      position: latest?.position ?? '',
      reasons: latest?.reasons ?? '',
      influences: latest?.influences ?? '',
      uncertainties: latest?.uncertainties ?? '',
    });

  const save = () => {
    if (!draft) return;
    onChange([...perspectives.filter((p) => p.id !== draft.id), draft]);
    setDraft(null);
  };

  const remove = async (p: Perspective) => {
    const ok = await confirm({
      title: 'Delete this perspective?',
      message: `The perspective from ${formatLongDate(p.date)} will be removed for good.`,
      confirmLabel: 'Delete',
      danger: true,
    });
    if (ok) onChange(perspectives.filter((x) => x.id !== p.id));
  };

  return (
    <section aria-labelledby="stand-heading" className="mt-12">
      <div className="mb-3 flex items-center gap-3">
        <h2 id="stand-heading" className="section-label flex-1">
          Where I stand
        </h2>
        {latest && !draft && (
          <span className="text-2xs text-ink-faint">
            Last considered {relativeDayInline(latest.date)}
            {daysBetween(latest.date, today()) > 90 ? ' · worth another look?' : ''}
          </span>
        )}
      </div>

      {draft ? (
        <div className="space-y-4 border-l-2 border-accent/50 pl-4">
          <label className="inline-flex items-center gap-2 text-[0.8125rem] text-ink-muted">
            As of
            <input
              type="date"
              value={draft.date}
              onChange={(e) => e.target.value && setDraft({ ...draft, date: e.target.value })}
              className="h-9 rounded border border-line bg-transparent px-2 text-sm text-ink sm:h-8"
            />
          </label>
          {FIELDS.map((f) => (
            <AutoText
              key={f.key}
              label={f.label}
              placeholder={f.placeholder}
              value={draft[f.key]}
              onChange={(v) => setDraft({ ...draft, [f.key]: v })}
            />
          ))}
          <div className="flex gap-2">
            <Button variant="primary" onClick={save} disabled={!draft.position.trim()}>
              Save perspective
            </Button>
            <Button variant="ghost" onClick={() => setDraft(null)}>
              Cancel
            </Button>
          </div>
          {latest && draft.id !== latest.id && (
            <p className="text-2xs text-ink-faint">
              Your earlier perspective stays as it is. This one is added alongside it.
            </p>
          )}
        </div>
      ) : latest ? (
        <>
          <PerspectiveView p={latest} />
          <div className="mt-4 flex flex-wrap gap-2">
            <Button size="sm" onClick={startNew}>
              Record where I stand now
            </Button>
            <Button size="sm" variant="ghost" onClick={() => setDraft(latest)}>
              Edit this one
            </Button>
          </div>
        </>
      ) : (
        <div className="text-sm text-ink-faint">
          <p>
            Write down where you stand on this and why. Months from now you can add a new
            perspective without losing this one.
          </p>
          <Button size="sm" className="mt-3" onClick={startNew}>
            Write my current view
          </Button>
        </div>
      )}

      {earlier.length > 0 && !draft && (
        <div className="mt-8">
          <h3 className="text-[0.8125rem] font-medium text-ink-muted">Earlier perspectives</h3>
          <ul className="mt-1 divide-y divide-line/70">
            {earlier.map((p) => (
              <li key={p.id} className="flex items-baseline gap-3 py-2">
                <span className="w-24 shrink-0 text-2xs text-ink-faint">
                  {formatRelativeDay(p.date)}
                </span>
                <span className="min-w-0 flex-1 truncate text-sm text-ink-muted">
                  {p.position || '—'}
                </span>
                <button
                  type="button"
                  onClick={() => setCompareId(compareId === p.id ? null : p.id)}
                  aria-pressed={compareId === p.id}
                  className={cn(
                    'h-9 shrink-0 rounded px-2 text-[0.8125rem] sm:h-7',
                    compareId === p.id ? 'bg-surface-2 text-ink' : 'text-accent hover:bg-surface-2',
                  )}
                >
                  {compareId === p.id ? 'Comparing' : 'Compare'}
                </button>
                <button
                  type="button"
                  onClick={() => void remove(p)}
                  aria-label={`Delete perspective from ${p.date}`}
                  className="flex h-9 w-9 shrink-0 items-center justify-center rounded text-ink-faint hover:text-bad sm:h-7 sm:w-7"
                >
                  <X className="h-3.5 w-3.5" />
                </button>
              </li>
            ))}
          </ul>
          {compared && latest && (
            <div className="mt-5 grid grid-cols-1 gap-6 md:grid-cols-2" aria-label="Comparison">
              <PerspectiveView p={compared} className="border-line-strong" />
              <PerspectiveView p={latest} />
            </div>
          )}
        </div>
      )}
    </section>
  );
}

// ---------------------------------------------------------------- decisions

const EMPTY_DECISION: DecisionMeta = {
  madeOn: null,
  reasons: '',
  expected: '',
  revisitOn: null,
  outcome: '',
  outcomeOn: null,
};

function DecisionField({
  label,
  value,
  placeholder,
  onSave,
}: {
  label: string;
  value: string;
  placeholder: string;
  onSave: (v: string) => void;
}) {
  const [text, setText] = useState(value);
  const [el, setEl] = useState<HTMLTextAreaElement | null>(null);
  useAutosize({ current: el }, text, 2);
  return (
    <label className="block">
      <span className="text-[0.8125rem] text-ink-muted">{label}</span>
      <textarea
        ref={setEl}
        value={text}
        onChange={(e) => setText(e.target.value)}
        onBlur={() => text !== value && onSave(text)}
        placeholder={placeholder}
        rows={2}
        className={cn(controlClass, 'mt-1 resize-none overflow-hidden leading-6')}
      />
    </label>
  );
}

/**
 * Decision journal: the decision itself goes in the note's text; here are the reasons, what you
 * expect, when to look back, and (later) what actually happened.
 */
export function DecisionPanel({
  decision,
  onChange,
}: {
  decision: DecisionMeta | null;
  onChange: (d: DecisionMeta) => void;
}) {
  const d = decision ?? EMPTY_DECISION;
  const set = (patch: Partial<DecisionMeta>) => onChange({ ...d, ...patch });
  const due = d.revisitOn && d.revisitOn <= today() && !d.outcome.trim();

  return (
    <section aria-labelledby="decision-heading" className="mt-12">
      <h2 id="decision-heading" className="section-label mb-3">
        The decision
      </h2>
      <div className="space-y-4">
        <div className="flex flex-wrap gap-3 text-[0.8125rem] text-ink-muted">
          <label className="inline-flex items-center gap-2">
            Decided on
            <input
              type="date"
              value={d.madeOn ?? ''}
              onChange={(e) => set({ madeOn: e.target.value || null })}
              className="h-9 rounded border border-line bg-transparent px-2 text-sm text-ink sm:h-8"
            />
          </label>
          <label className="inline-flex items-center gap-2">
            Look back on
            <input
              type="date"
              value={d.revisitOn ?? ''}
              onChange={(e) => set({ revisitOn: e.target.value || null })}
              className="h-9 rounded border border-line bg-transparent px-2 text-sm text-ink sm:h-8"
            />
          </label>
        </div>
        <DecisionField
          label="Why"
          value={d.reasons}
          placeholder="The reasons, as you see them now"
          onSave={(reasons) => set({ reasons })}
        />
        <DecisionField
          label="What I expect to happen"
          value={d.expected}
          placeholder="Your honest prediction"
          onSave={(expected) => set({ expected })}
        />
      </div>

      <div className={cn('mt-8 border-l-2 pl-4', due ? 'border-warn' : 'border-line-strong')}>
        <h3 className="text-[0.8125rem] font-medium text-ink-muted">
          What actually happened{due && <span className="ml-2 text-warn">· time to look back</span>}
        </h3>
        <div className="mt-2 space-y-3">
          <DecisionField
            label="Outcome"
            value={d.outcome}
            placeholder={
              d.revisitOn
                ? `Write this around ${formatRelativeDay(d.revisitOn)}`
                : 'Later: how it turned out, and what you would decide now'
            }
            onSave={(outcome) =>
              set({ outcome, outcomeOn: outcome.trim() ? (d.outcomeOn ?? today()) : null })
            }
          />
          {d.outcomeOn && (
            <p className="text-2xs text-ink-faint">Written {formatRelativeDay(d.outcomeOn)}</p>
          )}
        </div>
      </div>
    </section>
  );
}
