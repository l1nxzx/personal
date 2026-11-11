import { Link, useParams } from 'react-router-dom';
import { Button } from '../../components/ui/Button';
import { Checkbox } from '../../components/ui/Checkbox';
import { Loading } from '../../components/ui/misc';
import { useConfirm } from '../../context/ConfirmContext';
import { useToast } from '../../context/ToastContext';
import { errorMessage } from '../../lib/apiFetch';
import { useDeleteData, useMiniappState, useSetInstall } from './api';
import { MiniappFrame } from './Frame';
import { MiniappIcon } from './MiniappIcon';
import { miniappById } from './registry';
import { MiniappRuntime } from './Runtime';

/** One miniapp's Store page: a large header, get or open it, what it does, its widget. */
export default function StoreAppPage() {
  const { appId = '' } = useParams();
  const m = miniappById(appId);
  const state = useMiniappState();
  const setInstall = useSetInstall();
  const deleteData = useDeleteData();
  const confirm = useConfirm();
  const toast = useToast();
  const back = { to: '/miniapps/store', label: 'Store' };

  if (!m)
    return (
      <MiniappFrame title="Not found" back={back}>
        <p className="text-sm text-ink-muted">There is no miniapp called “{appId}”.</p>
      </MiniappFrame>
    );
  if (state.isLoading)
    return (
      <MiniappFrame title={m.name} back={back} hideTitle>
        <Loading />
      </MiniappFrame>
    );

  const install = state.data?.apps[m.id];
  const enabled = !!install?.enabled;
  const change = (patch: { enabled?: boolean; onHome?: boolean }, message: string) =>
    setInstall.mutate(
      { id: m.id, patch },
      {
        onSuccess: () => toast({ message }),
        onError: (err) => toast({ message: errorMessage(err), tone: 'error' }),
      },
    );
  const Widget = m.Widget;

  return (
    <MiniappFrame title={m.name} back={back} hideTitle>
      {/* Header */}
      <div className="flex items-center gap-5">
        <MiniappIcon
          glyph={m.icon.glyph}
          background={m.icon.background}
          color={m.icon.color}
          size="lg"
        />
        <div className="min-w-0">
          <h1 className="page-title">{m.name}</h1>
          <p className="mt-1 text-sm text-ink-faint">
            Miniapp{Widget && ' · Home widget'}
            {enabled && <span className="text-ok"> · On your screen</span>}
          </p>
        </div>
      </div>

      {/* Get / Open */}
      <div className="mt-6 flex gap-2">
        {enabled ? (
          <>
            <Link
              to={`/miniapps/${m.id}`}
              className="inline-flex h-10 flex-1 items-center justify-center rounded bg-accent-strong px-4 text-sm font-medium text-accent-ink hover:bg-accent-strong/85 active:bg-accent-strong/75"
            >
              Open
            </Link>
            <Button
              className="flex-1"
              onClick={() => change({ enabled: false }, `${m.name} removed from your screen`)}
            >
              Remove
            </Button>
          </>
        ) : (
          <Button
            variant="primary"
            className="flex-1"
            busy={setInstall.isPending}
            onClick={() => change({ enabled: true }, `${m.name} added to your screen`)}
          >
            Get
          </Button>
        )}
      </div>
      {enabled && Widget && (
        <label
          className="mt-4 flex cursor-pointer select-none items-center gap-3 text-sm text-ink-muted"
          onClick={(e) => {
            if ((e.target as HTMLElement).closest('[role=checkbox]')) return;
            const on = !install?.onHome;
            change({ onHome: on }, on ? 'Widget added to Home' : 'Widget removed from Home');
          }}
        >
          <Checkbox
            checked={!!install?.onHome}
            onChange={(on) =>
              change({ onHome: on }, on ? 'Widget added to Home' : 'Widget removed from Home')
            }
            label="Show the widget on Home"
          />
          Show the widget on Home
        </label>
      )}

      {/* About */}
      <section className="mt-10">
        <h2 className="section-label mb-3">About this app</h2>
        <p className="text-[0.9375rem] leading-7 text-ink">{m.description}</p>
        {m.about && m.about.length > 0 && (
          <ul className="mt-3 list-disc space-y-1 pl-5 text-sm leading-6 text-ink-muted marker:text-ink-faint">
            {m.about.map((line) => (
              <li key={line}>{line}</li>
            ))}
          </ul>
        )}
      </section>

      {/* Widget preview */}
      {Widget && (
        <section className="mt-10">
          <h2 className="section-label mb-3">Home widget</h2>
          <div
            aria-hidden
            // A picture of the widget, not a working one (React 18's types lack `inert`).
            ref={(el) => el?.setAttribute('inert', '')}
            className="pointer-events-none select-none rounded-md border border-line bg-surface p-3"
          >
            <MiniappRuntime definition={m} place="widget">
              <Widget />
            </MiniappRuntime>
          </div>
        </section>
      )}

      {/* Data */}
      {install?.hasData && (
        <section className="mt-10">
          <h2 className="section-label mb-3">Your data</h2>
          <p className="text-sm text-ink-muted">
            Saved to your account
            {enabled
              ? '.'
              : ', and kept while the app is off your screen: getting it again brings it back.'}
          </p>
          <button
            type="button"
            className="mt-2 text-sm text-bad hover:underline"
            onClick={async () => {
              const ok = await confirm({
                title: `Delete ${m.name}'s data?`,
                message: 'Everything it saved is deleted for good.',
                confirmLabel: 'Delete data',
                danger: true,
              });
              if (ok)
                deleteData.mutate(m.id, {
                  onSuccess: () => toast({ message: 'Data deleted' }),
                  onError: (err) => toast({ message: errorMessage(err), tone: 'error' }),
                });
            }}
          >
            Delete data
          </button>
        </section>
      )}
    </MiniappFrame>
  );
}
