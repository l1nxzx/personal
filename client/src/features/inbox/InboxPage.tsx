import { BookOpen, Ellipsis, Lightbulb, ListChecks, PenLine, Trash2 } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import type {
  Capture,
  CaptureResult,
  ConvertCaptureRequest,
  RefType,
} from '../../../../shared/types';
import { hrefFor } from '../../lib/routes';
import { Page, PageHeader } from '../../components/shell/PageHeader';
import { IconButton } from '../../components/ui/Button';
import { Menu } from '../../components/ui/Menu';
import { Empty, ErrorNote, Loading } from '../../components/ui/misc';
import { useToast } from '../../context/ToastContext';
import { useUI } from '../../context/UIContext';
import { errorMessage } from '../../lib/apiFetch';
import { formatAgo, localTime, today } from '../../lib/dates';
import { useConvertCapture, useDeleteCapture, useInbox } from './api';

const DESTINATION_LABEL: Record<ConvertCaptureRequest['to'], string> = {
  note: 'Moved to Ideas',
  task: 'Moved to Tasks',
  journal: "Added to today's journal",
  writing: 'Moved to Writing',
};

/** Things captured without a home yet. Nothing here is urgent; sort it whenever. */
export default function InboxPage() {
  const inbox = useInbox();
  const { openCapture } = useUI();

  return (
    <Page width="narrow">
      <PageHeader title="Inbox" />
      <p className="mt-1 max-w-prose text-sm text-ink-muted">
        Everything you capture without choosing a place waits here. File it, or just leave it.
      </p>
      {inbox.isLoading ? (
        <Loading />
      ) : inbox.isError ? (
        <ErrorNote onRetry={() => void inbox.refetch()}>{errorMessage(inbox.error)}</ErrorNote>
      ) : !inbox.data?.length ? (
        <Empty
          action={
            <button
              type="button"
              onClick={() => openCapture()}
              className="text-accent underline-offset-2 hover:underline"
            >
              Capture something
            </button>
          }
        >
          The inbox is empty.
        </Empty>
      ) : (
        <ul className="mt-6 divide-y divide-line/70 border-y border-line/70">
          {inbox.data.map((c) => (
            <li key={c.id}>
              <InboxItem c={c} />
            </li>
          ))}
        </ul>
      )}
    </Page>
  );
}

function InboxItem({ c }: { c: Capture }) {
  const convert = useConvertCapture();
  const del = useDeleteCapture();
  const toast = useToast();
  const navigate = useNavigate();

  // The row disappears optimistically, so use the promise rather than per-call callbacks.
  const fileTo = (to: ConvertCaptureRequest['to']) =>
    convert
      .mutateAsync({ id: c.id, to, localDate: today(), localTime: localTime() })
      .then((r: CaptureResult) =>
        toast({
          message: DESTINATION_LABEL[to],
          action: {
            label: 'Open',
            onClick: () => navigate(hrefFor(r.destination as RefType, r.id)),
          },
        }),
      )
      .catch((err) => toast({ message: errorMessage(err), tone: 'error' }));

  const remove = () =>
    del
      .mutateAsync(c.id)
      .then(() => toast({ message: 'Deleted from inbox' }))
      .catch((err) => toast({ message: errorMessage(err), tone: 'error' }));

  const actions = [
    { to: 'note' as const, label: 'Ideas', menu: 'Move to Ideas', icon: <Lightbulb /> },
    { to: 'task' as const, label: 'Task', menu: 'Move to Tasks', icon: <ListChecks /> },
    { to: 'journal' as const, label: 'Journal', menu: 'Add to journal', icon: <BookOpen /> },
    { to: 'writing' as const, label: 'Draft', menu: 'Move to Writing', icon: <PenLine /> },
  ];

  return (
    <div className="py-4">
      <p className="whitespace-pre-wrap break-words text-[0.9375rem] leading-6 text-ink">
        {c.text}
      </p>
      <div className="mt-2 flex items-center gap-1">
        <span className="mr-auto text-2xs text-ink-faint">
          {c.kind && <span className="mr-2 uppercase tracking-wider">{c.kind}</span>}
          {formatAgo(c.createdAt)}
        </span>
        <span className="hidden text-2xs text-ink-faint sm:inline">Move to</span>
        {actions.map((a) => (
          <button
            key={a.to}
            type="button"
            onClick={() => fileTo(a.to)}
            disabled={convert.isPending}
            className="hidden h-8 items-center gap-1.5 rounded px-2 text-[0.8125rem] text-ink-muted hover:bg-surface-2 hover:text-ink sm:inline-flex [&>svg]:h-3.5 [&>svg]:w-3.5"
          >
            {a.icon}
            {a.label}
          </button>
        ))}
        <IconButton label="Delete" className="hidden sm:inline-flex" onClick={() => void remove()}>
          <Trash2 className="h-3.5 w-3.5" />
        </IconButton>
        <div className="sm:hidden">
          <Menu
            trigger={(p) => (
              <IconButton label="Move or delete" {...p}>
                <Ellipsis className="h-4 w-4" />
              </IconButton>
            )}
            items={[
              ...actions.map((a) => ({
                label: a.menu,
                icon: a.icon,
                onSelect: () => fileTo(a.to),
              })),
              {
                label: 'Delete',
                icon: <Trash2 />,
                danger: true,
                onSelect: () => void remove(),
              },
            ]}
          />
        </div>
      </div>
    </div>
  );
}
