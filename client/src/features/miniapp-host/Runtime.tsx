import { Component, Suspense, useMemo } from 'react';
import type { ReactNode } from 'react';
import { useNavigate } from 'react-router-dom';
import { Loading } from '../../components/ui/misc';
import { MiniappContext } from './sdk/context';
import type { MiniappDefinition } from './sdk/types';

/** A miniapp crashing shows a note in its own box; the rest of the site keeps working. */
class Boundary extends Component<{ name: string; children: ReactNode }, { failed: boolean }> {
  state = { failed: false };
  static getDerivedStateFromError() {
    return { failed: true };
  }
  render() {
    if (this.state.failed)
      return (
        <p className="py-4 text-sm text-bad">
          {this.props.name} ran into a problem. Reload the page to try again.
        </p>
      );
    return this.props.children;
  }
}

/** Everything a miniapp runs inside: its identity (for `useAppData`), loading and errors. */
export function MiniappRuntime({
  definition,
  place,
  children,
}: {
  definition: MiniappDefinition;
  place: 'app' | 'widget';
  children: ReactNode;
}) {
  const navigate = useNavigate();
  const value = useMemo(
    () => ({ definition, place, open: () => navigate(`/miniapps/${definition.id}`) }),
    [definition, place, navigate],
  );
  return (
    <MiniappContext.Provider value={value}>
      <Boundary name={definition.name}>
        <Suspense fallback={<Loading className="py-4" />}>{children}</Suspense>
      </Boundary>
    </MiniappContext.Provider>
  );
}
