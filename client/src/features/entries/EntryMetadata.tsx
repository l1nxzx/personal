import type { Entry, EntryKind } from '../../../../shared/types';
import { MetadataDialog, timeRow, type MetadataSection } from '../../components/ui/Metadata';
import { formatLongDate, formatRelativeDay } from '../../lib/dates';
import { formatSize } from '../library/api';
import { useLinks } from '../links/api';
import { noteTypeLabel } from './NoteDetails';
import { useVersions } from './VersionHistory';

const KIND_LABEL: Record<EntryKind, string> = {
  journal: 'Journal entry',
  writing: 'Writing',
  note: 'Note',
};

const nf = new Intl.NumberFormat();
/** A calm reading pace for prose. */
const WORDS_PER_MINUTE = 230;

/** Counts for the text as it is in the editor now (unsaved changes included). */
function textFacts(title: string, body: string) {
  const words = body.match(/[\p{L}\p{N}][\p{L}\p{N}'’-]*/gu)?.length ?? 0;
  return {
    words,
    chars: [...body].length,
    charsNoSpaces: [...body.replace(/\s/g, '')].length,
    paragraphs: body.split(/\n\s*\n/).filter((p) => p.trim()).length,
    lines: body ? body.split('\n').length : 0,
    minutes: Math.max(1, Math.round(words / WORDS_PER_MINUTE)),
    bytes: new TextEncoder().encode(title + body).length,
  };
}

/** Everything known about one journal entry, writing or note (Three dots → Metadata). */
export function EntryMetadata({
  open,
  onClose,
  kind,
  entry,
  title,
  body,
  tags,
}: {
  open: boolean;
  onClose: () => void;
  kind: EntryKind;
  /** The saved entry (dates, revisions, note details). */
  entry: Entry;
  /** The text as currently in the editor. */
  title: string;
  body: string;
  tags: string[];
}) {
  // Only asked for while the dialog is open.
  const versions = useVersions(kind, open ? entry.id : null);
  const links = useLinks(open ? { type: kind, id: entry.id } : null);
  const t = textFacts(title, body);
  const note = entry.note;
  const latestVersion = versions.data
    ?.map((v) => v.savedAt)
    .sort()
    .at(-1);
  const perspectives = note?.perspectives ?? [];
  const pending = <span className="text-ink-faint">…</span>;

  const sections: MetadataSection[] = [
    {
      title: 'Dates',
      rows: [
        kind === 'journal' &&
          entry.date && { label: 'Entry for', value: formatLongDate(entry.date) },
        timeRow('Created', entry.createdAt),
        timeRow('Last modified', entry.updatedAt),
      ],
    },
    {
      title: 'Text',
      rows: [
        { label: 'Words', value: nf.format(t.words) },
        {
          label: 'Characters',
          value: nf.format(t.chars),
          hint: `${nf.format(t.charsNoSpaces)} without spaces`,
        },
        { label: 'Paragraphs', value: nf.format(t.paragraphs) },
        { label: 'Lines', value: nf.format(t.lines) },
        t.words > 0 && { label: 'Reading time', value: `About ${t.minutes} min` },
        {
          label: 'Size',
          value: formatSize(t.bytes),
          hint: `${nf.format(t.bytes)} bytes of text, formatting included`,
        },
      ],
    },
    {
      title: 'History',
      rows: [
        {
          label: 'Saves',
          value: nf.format(entry.rev),
          hint: 'Every save of the text counts once',
        },
        {
          label: 'Versions kept',
          value: versions.data
            ? nf.format(versions.data.length)
            : versions.isError
              ? 'Couldn’t load'
              : pending,
        },
        timeRow('Latest version', latestVersion),
      ],
    },
    {
      title: 'Organisation',
      rows: [
        { label: 'Kind', value: note ? noteTypeLabel(note.noteType) : KIND_LABEL[kind] },
        note?.topic && { label: 'Topic', value: note.topic },
        {
          label: 'Tags',
          value: tags.length ? tags.map((x) => `#${x}`).join(' ') : 'None',
        },
        kind !== 'journal' && { label: 'Pinned', value: entry.pinned ? 'Yes' : 'No' },
        kind === 'writing' && { label: 'Archived', value: entry.archived ? 'Yes' : 'No' },
        {
          label: 'Linked items',
          value: links.data
            ? nf.format(links.data.length)
            : links.isError
              ? 'Couldn’t load'
              : pending,
        },
        note &&
          note.sources.length > 0 && { label: 'Sources', value: nf.format(note.sources.length) },
        note?.noteType === 'belief' && {
          label: 'Positions',
          value: nf.format(perspectives.length),
          hint: perspectives.length
            ? `Latest ${formatRelativeDay(perspectives.at(-1)!.date)}`
            : undefined,
        },
        note?.decision?.madeOn && {
          label: 'Decided',
          value: formatLongDate(note.decision.madeOn),
        },
        note?.decision?.revisitOn && {
          label: 'Look back',
          value: formatLongDate(note.decision.revisitOn),
        },
      ],
    },
    {
      title: 'Identity',
      rows: [
        { label: 'ID', value: <span className="select-all font-mono text-xs">{entry.id}</span> },
      ],
    },
  ];

  return (
    <MetadataDialog
      open={open}
      onClose={onClose}
      name={title || (entry.date ? formatLongDate(entry.date) : 'Untitled')}
      sections={sections}
    />
  );
}
