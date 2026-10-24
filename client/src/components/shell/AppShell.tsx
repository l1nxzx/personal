import { Suspense } from 'react';
import { Outlet, useMatch } from 'react-router-dom';
import { useAuth } from '../../context/AuthContext';
import { useUI } from '../../context/UIContext';
import { cn } from '../../lib/cn';
import { Loading } from '../ui/misc';
import { PAGE_FRAME } from './PageHeader';
import { CaptureDialog } from '../../features/capture/CaptureDialog';
import { useActivityTracking } from '../../features/profile/activityTracker';
import { SearchDialog } from '../../features/search/SearchDialog';
import { TaskDetailHost } from '../../features/tasks/TaskDetail';
import { useRealtime } from '../../hooks/useRealtime';
import { isMod, isTyping, useKeydown } from '../../lib/hotkeys';
import { MobileNav } from './MobileNav';
import { Sidebar } from './Sidebar';

/** Layout for signed-in pages: navigation, global shortcuts, Quick Capture and Search. */
export function AppShell() {
  const { openCapture, openSearch, captureOpen, searchOpen } = useUI();
  const { user } = useAuth();
  // Editors take the whole phone screen; no bottom bar competing with the keyboard.
  const journalEditor = useMatch('/journal/:id');
  const writingEditor = useMatch('/writing/:id');
  const noteEditor = useMatch('/ideas/:id');
  const inEditor = !!(journalEditor || writingEditor || noteEditor);

  useRealtime(true);
  useActivityTracking(user?.id);

  useKeydown((e) => {
    if (e.defaultPrevented) return;
    if (isMod(e) && e.key.toLowerCase() === 'k') {
      e.preventDefault();
      openSearch();
      return;
    }
    if (captureOpen || searchOpen || isTyping(e.target) || e.metaKey || e.ctrlKey || e.altKey)
      return;
    if (e.key === '/') {
      e.preventDefault();
      openSearch();
    } else if (e.key === 'c') {
      e.preventDefault();
      openCapture();
    }
  });

  return (
    <div className="min-h-dvh">
      <Sidebar />
      <main className="lg:pl-[13.5rem]">
        {/* Pages load on demand inside the shell, so the navigation never disappears. */}
        <Suspense fallback={<Loading className={cn(PAGE_FRAME, 'pt-16')} />}>
          <Outlet />
        </Suspense>
      </main>
      {!inEditor && <MobileNav />}
      <CaptureDialog />
      <SearchDialog />
      <TaskDetailHost />
    </div>
  );
}
