import { ExternalLink, Plus, X } from 'lucide-react';
import { useCallback, useEffect, useId, useRef, useState } from 'react';
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
import { daysBetween, formatLongDate, formatRelativeDay, today } from '../../lib/dates';
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

/** Typing pauses this long before a position is saved. */
const SAVE_AFTER_MS = 800;

const blankPerspective = (): Perspective => ({
  id: newId(),
  date: today(),
  position: '',
  reasons: '',
  influences: '',
  uncertainties: '',
});

const isEmpty = (p: Perspective) =>
  !p.position.trim() && !p.reasons.trim() && !p.influences.trim() && !p.uncertainties.trim();

/** One part of where you stand, written in place like the rest of the note. */
function StandField({
  label,
  value,
  placeholder,
  large,
  onChange,
  onBlur,
}: {
  label: string;
  value: string;
  placeholder: string;
  large?: boolean;
  onChange: (v: string) => void;
  onBlur: () => void;
}) {
  const [el, setEl] = useState<HTMLTextAreaElement | null>(null);
  useAutosize({ current: el }, value, large ? 2 : 1);
  return (
    <label className="mt-5 block first:mt-0">
      <span className="text-2xs uppercase tracking-[0.1em] text-ink-faint">{label}</span>
      <textarea
        ref={setEl}
        value={value}
        rows={large ? 2 : 1}
        onChange={(e) => onChange(e.target.value)}
        onBlur={onBlur}
        placeholder={placeholder}
        className={cn(
          'mt-1 block w-full resize-none overflow-hidden bg-transparent text-ink placeholder:text-ink-faint/80 focus:outline-none focus-visible:outline-none',
          large
            ? 'font-serif text-[1.3125rem] leading-snug sm:text-[1.4375rem]'
            : 'text-[1.0625rem] leading-7',
        )}
        style={large ? { fontVariationSettings: "'opsz' 28" } : undefined}
      />
    </label>
  );
}

/**
 * The heart of a belief: where you stand on it now, written in place and saved as you type.
 * Each position is dated and kept. Recording a new one never erases the old; any earlier one
 * can be read beside the current. Nothing is scored or judged.
 */
export function BeliefStand({
  perspectives,
  onChange,
  readOnly,
}: {
  perspectives: Perspective[];
  onChange: (next: Perspective[]) => void;
  /** The reading view: the current position as text. */
  readOnly?: boolean;
}) {
  const confirm = useConfirm();
  const sorted = [...perspectives].sort((a, b) => a.date.localeCompare(b.date));
  const latest = sorted.at(-1);
  const earlier = sorted.slice(0, -1).reverse();
  const [compareId, setCompareId] = useState<string | null>(null);
  const compared = earlier.find((p) => p.id === compareId) ?? null;

  // The position being written: the latest one, or a new one dated today.
  const [draft, setDraftState] = useState<Perspective>(() => latest ?? blankPerspective());
  const draftRef = useRef(draft);
  const dirty = useRef(false);
  const timer = useRef<ReturnType<typeof setTimeout>>();
  const latestProps = useRef({ perspectives, onChange });
  latestProps.current = { perspectives, onChange };

  const setDraft = (next: Perspective) => {
    draftRef.current = next;
    setDraftState(next);
  };

  // Follow changes made elsewhere (another device, a deleted position), unless mid-edit.
  useEffect(() => {
    if (dirty.current) return;
    const next = latest ?? (isEmpty(draftRef.current) ? draftRef.current : blankPerspective());
    draftRef.current = next;
    setDraftState(next);
  }, [latest]);

  const save = useCallback(() => {
    clearTimeout(timer.current);
    if (!dirty.current) return;
    dirty.current = false;
    const d = draftRef.current;
    const { perspectives: all, onChange: change } = latestProps.current;
    const known = all.some((p) => p.id === d.id);
    if (isEmpty(d) && !known) return; // nothing written yet
    change([...all.filter((p) => p.id !== d.id), d]);
  }, []);
  useEffect(() => save, [save]); // anything typed is saved when the note closes

  const edit = (patch: Partial<Perspective>) => {
    setDraft({ ...draftRef.current, ...patch });
    dirty.current = true;
    clearTimeout(timer.current);
    timer.current = setTimeout(save, SAVE_AFTER_MS);
  };

  const recordNew = () => {
    clearTimeout(timer.current);
    dirty.current = false;
    const current = draftRef.current;
    const next = { ...current, id: newId(), date: today() };
    onChange([...perspectives.filter((p) => p.id !== current.id), current, next]);
    setDraft(next);
  };

  const remove = async (p: Perspective) => {
    const ok = await confirm({
      title: 'Delete this position?',
      message: `Where you stood on ${formatLongDate(p.date)} will be removed for good.`,
      confirmLabel: 'Delete',
      danger: true,
    });
    if (ok) onChange(perspectives.filter((x) => x.id !== p.id));
  };

  const t = today();
  const stale = !!latest && daysBetween(latest.date, t) > 90;

  return (
    <section aria-labelledby="stand-heading" className="mt-8">
      <div className="mb-3 flex flex-wrap items-baseline gap-x-3 gap-y-1">
        <h2 id="stand-heading" className="section-label flex-1">
          Where I stand
        </h2>
        {/* The reading view shows the date with the position itself. */}
        {!readOnly && (
          <label className="relative inline-flex cursor-pointer items-center overflow-hidden text-2xs text-ink-faint hover:text-ink-muted">
            As of {formatLongDate(draft.date)}
            <input
              type="date"
              value={draft.date}
              max="9999-12-31"
              onChange={(e) => e.target.value && edit({ date: e.target.value })}
              aria-label="Date of this position"
              className="absolute inset-0 h-full w-full min-w-0 cursor-pointer opacity-0"
            />
          </label>
        )}
      </div>

      {readOnly ? (
        latest ? (
          <PerspectiveView p={latest} />
        ) : (
          <p className="text-sm italic text-ink-faint">No position written yet.</p>
        )
      ) : (
        <div className="border-l-2 border-accent/50 pl-4">
          {FIELDS.map((f, i) => (
            <StandField
              key={f.key}
              large={i === 0}
              label={f.label}
              placeholder={f.placeholder}
              value={draft[f.key]}
              onChange={(v) => edit({ [f.key]: v })}
              onBlur={save}
            />
          ))}
        </div>
      )}

      {!readOnly && latest && (
        <div className="mt-4 flex flex-wrap items-center gap-x-3 gap-y-2">
          {latest.date < t && (
            <Button size="sm" onClick={recordNew}>
              Record a new position
            </Button>
          )}
          <span className="text-2xs text-ink-faint">
            {latest.date < t
              ? `Keeps this one from ${formatRelativeDay(latest.date)} as it was${stale ? '. Worth another look?' : ''}`
              : 'Saved as you write'}
          </span>
        </div>
      )}

      {earlier.length > 0 && (
        <div className="mt-8">
          <h3 className="text-[0.8125rem] font-medium text-ink-muted">Earlier positions</h3>
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
                {!readOnly && (
                  <button
                    type="button"
                    onClick={() => void remove(p)}
                    aria-label={`Delete position from ${p.date}`}
                    className="flex h-9 w-9 shrink-0 items-center justify-center rounded text-ink-faint hover:text-bad sm:h-7 sm:w-7"
                  >
                    <X className="h-3.5 w-3.5" />
                  </button>
                )}
              </li>
            ))}
          </ul>
          {compared && latest && (
            <div className="mt-5 grid grid-cols-1 gap-6 md:grid-cols-2" aria-label="Comparison">
              <PerspectiveView p={compared} className="border-line-strong" />
              <PerspectiveView p={readOnly ? latest : draft} />
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
