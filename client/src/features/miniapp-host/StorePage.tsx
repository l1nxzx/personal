import { ShoppingBag } from 'lucide-react';
import { Link } from 'react-router-dom';
import { Button } from '../../components/ui/Button';
import { Checkbox } from '../../components/ui/Checkbox';
import { ErrorNote, Loading } from '../../components/ui/misc';
import { useConfirm } from '../../context/ConfirmContext';
import { useToast } from '../../context/ToastContext';
import { errorMessage } from '../../lib/apiFetch';
import { useDeleteData, useMiniappState, useSetInstall } from './api';
import { MiniappFrame } from './Frame';
import { MiniappIcon } from './MiniappIcon';
import { MINIAPPS } from './registry';

/** Every miniapp there is: get (enable) or remove (disable) it, widget on Home, delete data. */
export default function StorePage() {
  const state = useMiniappState();
  const setInstall = useSetInstall();
  const deleteData = useDeleteData();
  const confirm = useConfirm();
  const toast = useToast();

  const icon = (
    <MiniappIcon
      glyph={ShoppingBag}
      background="linear-gradient(160deg, #6f93d6 0%, #3c5d9c 100%)"
      size="sm"
    />
  );
  const change = (id: string, patch: { enabled?: boolean; onHome?: boolean }, message: string) =>
    setInstall.mutate(
      { id, patch },
      {
        onSuccess: () => toast({ message }),
        onError: (err) => toast({ message: errorMessage(err), tone: 'error' }),
      },
    );

  return (
    <MiniappFrame title="Store" icon={icon}>
      {state.isLoading ? (
        <Loading />
      ) : state.isError ? (
        <ErrorNote onRetry={() => void state.refetch()}>{errorMessage(state.error)}</ErrorNote>
      ) : !MINIAPPS.length ? (
        <p className="text-sm text-ink-muted">There are no miniapps yet.</p>
      ) : (
        <ul className="divide-y divide-line/70 border-y border-line/70">
          {MINIAPPS.map((m) => {
            const install = state.data?.apps[m.id];
            const enabled = !!install?.enabled;
            return (
              <li key={m.id} className="flex gap-4 py-4">
                <MiniappIcon
                  glyph={m.icon.glyph}
                  background={m.icon.background}
                  color={m.icon.color}
                />
                <div className="min-w-0 flex-1">
                  <div className="flex items-start gap-3">
                    <div className="min-w-0 flex-1">
                      <h2 className="font-medium text-ink">{m.name}</h2>
                      <p className="mt-0.5 text-sm text-ink-muted">{m.description}</p>
                    </div>
                    {enabled ? (
                      <Link
                        to={`/miniapps/${m.id}`}
                        className="inline-flex h-9 shrink-0 items-center rounded border border-line-strong px-3 text-sm text-ink hover:bg-surface-2 active:bg-surface-2/60 sm:h-8"
                      >
                        Open
                      </Link>
                    ) : (
                      <Button
                        size="sm"
                        variant="primary"
                        onClick={() => change(m.id, { enabled: true }, `${m.name} added`)}
                      >
                        Get
                      </Button>
                    )}
                  </div>
                  {enabled ? (
                    <div className="mt-3 flex flex-wrap items-center gap-x-5 gap-y-2">
                      {m.Widget && (
                        <span
                          className="flex cursor-pointer select-none items-center gap-2 text-sm text-ink-muted"
                          onClick={() => {
                            const on = !install?.onHome;
                            change(
                              m.id,
                              { onHome: on },
                              on ? 'Widget added to Home' : 'Widget removed from Home',
                            );
                          }}
                        >
                          <Checkbox
                            checked={!!install?.onHome}
                            onChange={(on) =>
                              change(
                                m.id,
                                { onHome: on },
                                on ? 'Widget added to Home' : 'Widget removed from Home',
                              )
                            }
                            label="Widget on Home"
                          />
                          Widget on Home
                        </span>
                      )}
                      <button
                        type="button"
                        onClick={() => change(m.id, { enabled: false }, `${m.name} removed`)}
                        className="text-sm text-ink-muted hover:text-ink"
                      >
                        Remove
                      </button>
                    </div>
                  ) : (
                    install?.hasData && (
                      <p className="mt-2 text-2xs text-ink-faint">
                        Your data is kept: getting it again brings it back.{' '}
                        <button
                          type="button"
                          className="text-bad hover:underline"
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
                                onError: (err) =>
                                  toast({ message: errorMessage(err), tone: 'error' }),
                              });
                          }}
                        >
                          Delete data
                        </button>
                      </p>
                    )
                  )}
                </div>
              </li>
            );
          })}
        </ul>
      )}
    </MiniappFrame>
  );
}
