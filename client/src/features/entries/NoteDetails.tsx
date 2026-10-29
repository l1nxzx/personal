import { ChevronRight, Ellipsis, ExternalLink, Plus, Trash2, X } from 'lucide-react';
import { useCallback, useEffect, useId, useRef, useState } from 'react';
import type { ReactNode } from 'react';
import type {
  DecisionMeta,
  NoteMeta,
  NoteType,
  Perspective,
  Source,
} from '../../../../shared/types';
import { Button, IconButton } from '../../components/ui/Button';
import { Menu } from '../../components/ui/Menu';
import { controlClass } from '../../components/ui/Field';
import { useConfirm } from '../../context/ConfirmContext';
import { useAutosize } from '../../hooks/useAutosize';
import { cn } from '../../lib/cn';
import { formatLongDate, formatRelativeDay, today } from '../../lib/dates';
import { useTopics } from './api';
import { writingTextClass, writingTextStyle, type WritingFont } from './writingStyle';

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

/** One part of a position, written in place in the same type as the note's text. */
function StandField({
  label,
  value,
  placeholder,
  font,
  autoFocus,
  onChange,
  onBlur,
}: {
  label: string;
  value: string;
  placeholder: string;
  font: WritingFont;
  autoFocus?: boolean;
  onChange: (v: string) => void;
  onBlur: () => void;
}) {
  const [el, setEl] = useState<HTMLTextAreaElement | null>(null);
  useAutosize({ current: el }, value, 1);
  return (
    <label className="mt-4 block first:mt-0">
      <span className="text-2xs uppercase tracking-[0.1em] text-ink-faint">{label}</span>
      <textarea
        ref={setEl}
        value={value}
        rows={1}
        autoFocus={autoFocus}
        onChange={(e) => onChange(e.target.value)}
        onBlur={onBlur}
        placeholder={placeholder}
        className={cn(
          'block w-full resize-none overflow-hidden bg-transparent text-ink placeholder:text-ink-faint/80 focus:outline-none focus-visible:outline-none',
          writingTextClass(font),
        )}
        style={writingTextStyle(font)}
      />
    </label>
  );
}

/** One dated position: a header row that opens and closes it, and its four parts. */
function PositionItem({
  p,
  latest,
  open,
  font,
  readOnly,
  autoFocus,
  onToggle,
  onSave,
  onDelete,
}: {
  p: Perspective;
  latest: boolean;
  open: boolean;
  font: WritingFont;
  readOnly?: boolean;
  autoFocus?: boolean;
  onToggle: () => void;
  onSave: (p: Perspective) => void;
  onDelete: (p: Perspective) => void;
}) {
  const [draft, setDraftState] = useState(p);
  const draftRef = useRef(p);
  const dirty = useRef(false);
  const timer = useRef<ReturnType<typeof setTimeout>>();
  const saveRef = useRef(onSave);
  saveRef.current = onSave;

  // Follow changes made elsewhere (another device), unless in the middle of typing.
  useEffect(() => {
    if (dirty.current) return;
    draftRef.current = p;
    setDraftState(p);
  }, [p]);

  const save = useCallback(() => {
    clearTimeout(timer.current);
    if (!dirty.current) return;
    dirty.current = false;
    saveRef.current(draftRef.current);
  }, []);
  useEffect(() => save, [save]); // anything typed is saved when it closes

  const edit = (patch: Partial<Perspective>) => {
    const next = { ...draftRef.current, ...patch };
    draftRef.current = next;
    setDraftState(next);
    dirty.current = true;
    clearTimeout(timer.current);
    timer.current = setTimeout(save, SAVE_AFTER_MS);
  };

  const filled = FIELDS.filter((f) => draft[f.key].trim());
  return (
    <li className="py-1">
      <div className="flex items-center gap-1">
        <button
          type="button"
          onClick={() => {
            save();
            onToggle();
          }}
          aria-expanded={open}
          className="-ml-1 flex min-w-0 flex-1 items-baseline gap-2 rounded px-1 py-2 text-left hover:bg-surface/70"
        >
          <ChevronRight
            className={cn(
              'h-3.5 w-3.5 shrink-0 self-center text-ink-faint transition-transform',
              open && 'rotate-90',
            )}
            aria-hidden
          />
          <span className="shrink-0 text-2xs uppercase tracking-[0.1em] text-ink-muted">
            {formatLongDate(draft.date)}
          </span>
          {latest && <span className="shrink-0 text-2xs text-accent">Latest</span>}
          {!open && (
            <span className="min-w-0 flex-1 truncate text-sm text-ink-muted">
              {draft.position.trim() || <span className="italic text-ink-faint">Not written</span>}
            </span>
          )}
        </button>
        {!readOnly && (
          <Menu
            trigger={(t) => (
              <IconButton
                label={`Actions for the position of ${formatLongDate(draft.date)}`}
                {...t}
              >
                <Ellipsis className="h-4 w-4" />
              </IconButton>
            )}
            items={[
              {
                label: 'Delete position…',
                icon: <Trash2 />,
                danger: true,
                onSelect: () => onDelete(draftRef.current),
              },
            ]}
          />
        )}
      </div>

      {open && (
        <div className="mb-4 ml-[0.4375rem] mt-1 border-l-2 border-accent/50 pl-4">
          {readOnly ? (
            filled.length ? (
              filled.map((f) => (
                <div key={f.key} className="mt-4 first:mt-0">
                  <div className="text-2xs uppercase tracking-[0.1em] text-ink-faint">
                    {f.label}
                  </div>
                  <p
                    className={cn('whitespace-pre-wrap text-ink', writingTextClass(font))}
                    style={writingTextStyle(font)}
                  >
                    {draft[f.key]}
                  </p>
                </div>
              ))
            ) : (
              <p className="text-sm italic text-ink-faint">Nothing written.</p>
            )
          ) : (
            <>
              <label className="relative mb-3 inline-flex cursor-pointer items-center overflow-hidden text-2xs text-ink-faint hover:text-ink-muted">
                Change date
                <input
                  type="date"
                  value={draft.date}
                  max="9999-12-31"
                  onChange={(e) => e.target.value && edit({ date: e.target.value })}
                  aria-label="Date of this position"
                  className="absolute inset-0 h-full w-full min-w-0 cursor-pointer opacity-0"
                />
              </label>
              {FIELDS.map((f, i) => (
                <StandField
                  key={f.key}
                  label={f.label}
                  placeholder={f.placeholder}
                  font={font}
                  autoFocus={autoFocus && i === 0}
                  value={draft[f.key]}
                  onChange={(v) => edit({ [f.key]: v })}
                  onBlur={save}
                />
              ))}
            </>
          )}
        </div>
      )}
    </li>
  );
}

/**
 * The heart of a belief: where you stand on it, as a list of dated positions, newest first.
 * The latest is open and the earlier ones are folded to one line; any can be opened, closed,
 * edited or deleted. A new position starts blank and is only kept once something is written.
 */
export function BeliefStand({
  perspectives,
  onChange,
  font,
  readOnly,
}: {
  perspectives: Perspective[];
  onChange: (next: Perspective[]) => void;
  font: WritingFont;
  /** The reading view: positions as text. */
  readOnly?: boolean;
}) {
  const confirm = useConfirm();
  const known = [...perspectives].sort((a, b) => b.date.localeCompare(a.date));
  // A new, blank position waiting for its first words (a belief with none starts with one).
  const [fresh, setFresh] = useState<Perspective | null>(() =>
    !readOnly && !perspectives.length ? blankPerspective() : null,
  );
  const pending = fresh && !known.some((p) => p.id === fresh.id) ? fresh : null;
  const list = pending ? [pending, ...known] : known;
  const [open, setOpen] = useState<Set<string>>(() => new Set(list[0] ? [list[0].id] : []));
  const [focusId, setFocusId] = useState<string | null>(null);
  const all = useRef(perspectives);
  all.current = perspectives;

  const toggle = (id: string) =>
    setOpen((s) => {
      const next = new Set(s);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });

  const save = (p: Perspective) => {
    const exists = all.current.some((x) => x.id === p.id);
    if (isEmpty(p) && !exists) return; // nothing written yet: not kept
    onChange([...all.current.filter((x) => x.id !== p.id), p]);
  };

  const startNew = () => {
    if (pending) {
      setOpen(new Set([pending.id]));
      setFocusId(pending.id);
      return;
    }
    const p = blankPerspective();
    setFresh(p);
    setOpen(new Set([p.id])); // fold the others away, so the new one has the room
    setFocusId(p.id);
  };

  const remove = async (p: Perspective) => {
    const saved = all.current.some((x) => x.id === p.id);
    if (saved && !isEmpty(p)) {
      const ok = await confirm({
        title: 'Delete this position?',
        message: `Where you stood on ${formatLongDate(p.date)} will be removed for good.`,
        confirmLabel: 'Delete',
        danger: true,
      });
      if (!ok) return;
    }
    if (fresh?.id === p.id) setFresh(null);
    if (saved) onChange(all.current.filter((x) => x.id !== p.id));
  };

  return (
    <section aria-labelledby="stand-heading" className="mt-8">
      <div className="mb-1 flex items-center gap-3">
        <h2 id="stand-heading" className="section-label flex-1">
          Where I stand
        </h2>
        {!readOnly && (
          <button
            type="button"
            onClick={startNew}
            className="-my-1 inline-flex h-9 items-center gap-1 rounded px-2 text-[0.8125rem] text-ink-muted hover:bg-surface-2 hover:text-ink sm:h-7"
          >
            <Plus className="h-3.5 w-3.5" /> New position
          </button>
        )}
      </div>
      {list.length ? (
        <ul>
          {list.map((p, i) => (
            <PositionItem
              key={p.id}
              p={p}
              latest={i === 0 && list.length > 1}
              open={open.has(p.id)}
              font={font}
              readOnly={readOnly}
              autoFocus={focusId === p.id}
              onToggle={() => toggle(p.id)}
              onSave={save}
              onDelete={(x) => void remove(x)}
            />
          ))}
        </ul>
      ) : (
        <p className="py-2 text-sm text-ink-faint">
          {readOnly ? 'No position written yet.' : 'Write down where you stand on this, and why.'}
        </p>
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
