import { ChevronRight } from 'lucide-react';
import { Link } from 'react-router-dom';
import { Button } from '../../components/ui/Button';
import { ErrorNote, Loading } from '../../components/ui/misc';
import { useToast } from '../../context/ToastContext';
import { errorMessage } from '../../lib/apiFetch';
import { useMiniappState, useSetInstall } from './api';
import { STORE_ICON } from './builtins';
import { MiniappFrame } from './Frame';
import { MiniappIcon } from './MiniappIcon';
import { MINIAPPS } from './registry';
import type { MiniappDefinition } from './sdk/types';

/** Every miniapp there is, in two groups: on the screen, and the rest. Each opens its page. */
export default function StorePage() {
  const state = useMiniappState();
  const installed = MINIAPPS.filter((m) => state.data?.apps[m.id]?.enabled);
  const available = MINIAPPS.filter((m) => !state.data?.apps[m.id]?.enabled);

  return (
    <MiniappFrame title="Store" icon={<MiniappIcon {...STORE_ICON} size="sm" />}>
      {state.isLoading ? (
        <Loading />
      ) : state.isError ? (
        <ErrorNote onRetry={() => void state.refetch()}>{errorMessage(state.error)}</ErrorNote>
      ) : !MINIAPPS.length ? (
        <p className="text-sm text-ink-muted">There are no miniapps yet.</p>
      ) : (
        <div className="space-y-10">
          {available.length > 0 && <Group title="Available" apps={available} installed={false} />}
          {installed.length > 0 && <Group title="On your screen" apps={installed} installed />}
        </div>
      )}
    </MiniappFrame>
  );
}

function Group({
  title,
  apps,
  installed,
}: {
  title: string;
  apps: MiniappDefinition[];
  installed: boolean;
}) {
  return (
    <section>
      <h2 className="section-label mb-1">{title}</h2>
      <ul className="divide-y divide-line/70">
        {apps.map((m) => (
          <Row key={m.id} m={m} installed={installed} />
        ))}
      </ul>
    </section>
  );
}

function Row({ m, installed }: { m: MiniappDefinition; installed: boolean }) {
  const setInstall = useSetInstall();
  const toast = useToast();
  return (
    <li className="flex items-center gap-3 py-3">
      <Link
        to={`/miniapps/store/${m.id}`}
        className="-mx-2 flex min-w-0 flex-1 items-center gap-4 rounded px-2 py-1 hover:bg-surface/70 active:bg-surface"
      >
        <MiniappIcon {...m.icon} />
        <div className="min-w-0 flex-1">
          <p className="font-medium text-ink">{m.name}</p>
          <p className="line-clamp-2 text-sm text-ink-muted">{m.description}</p>
        </div>
        <ChevronRight className="h-4 w-4 shrink-0 text-ink-faint" aria-hidden />
      </Link>
      {installed ? (
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
          busy={setInstall.isPending}
          onClick={() =>
            setInstall.mutate(
              { id: m.id, patch: { enabled: true } },
              {
                onSuccess: () => toast({ message: `${m.name} added to your screen` }),
                onError: (err) => toast({ message: errorMessage(err), tone: 'error' }),
              },
            )
          }
        >
          Get
        </Button>
      )}
    </li>
  );
}
