import { lazy, Suspense } from 'react';
import { Navigate, Outlet, Route, Routes, useLocation } from 'react-router-dom';
import { AppShell, PageSkeleton, ShellFrame } from './components/shell/AppShell';
import { Loading } from './components/ui/misc';
import { useAuth } from './context/AuthContext';
import { EditorPage, preloadRichEditor } from './features/entries/EditorPage';
import HomePage from './features/home/HomePage';
import JournalPage from './features/entries/JournalPage';
import TasksPage from './features/tasks/TasksPage';
import LoginPage from './pages/LoginPage';

// The bottom navigation's pages (Home, Journal, Tasks) and the editor are in the main bundle.
// Every other page loads on demand, and is fetched in the background once the app is idle.
const pages = {
  WritingPage: () => import('./features/entries/WritingPage'),
  ThinkingPage: () => import('./features/entries/ThinkingPage'),
  IdeasPage: () => import('./features/entries/IdeasPage'),
  InboxPage: () => import('./features/inbox/InboxPage'),
  ProjectPage: () => import('./features/projects/ProjectPage'),
  LibraryPage: () => import('./features/library/LibraryPage'),
  BookPage: () => import('./features/library/BookPage'),
  DocumentsPage: () => import('./features/documents/DocumentsPage'),
  MoneyPage: () => import('./features/money/MoneyPage'),
  ExpensesPage: () => import('./features/money/ExpensesPage'),
  MoneyIdeasPage: () => import('./features/money/MoneyIdeasPage'),
  MoneyIdeaPage: () => import('./features/money/MoneyIdeaPage'),
  ReviewsPage: () => import('./features/reviews/ReviewsPage'),
  TimelinePage: () => import('./features/timeline/TimelinePage'),
  VaultPage: () => import('./features/vault/VaultPage'),
  SettingsPage: () => import('./pages/SettingsPage'),
  ProfilePage: () => import('./features/profile/ProfilePage'),
  NotFoundPage: () => import('./pages/NotFoundPage'),
  MiniappsPage: () => import('./features/miniapp-host/MiniappsPage'),
  MiniappStorePage: () => import('./features/miniapp-host/StorePage'),
  MiniappStoreAppPage: () => import('./features/miniapp-host/StoreAppPage'),
  MiniappWallpaperPage: () => import('./features/miniapp-host/WallpaperPage'),
  MiniappScreen: () => import('./features/miniapp-host/MiniappScreen'),
};
const preloadPages = () => {
  Object.values(pages).forEach((load) => void load().catch(() => {}));
  preloadRichEditor();
};

const WritingPage = lazy(pages.WritingPage);
const ThinkingPage = lazy(pages.ThinkingPage);
const IdeasPage = lazy(pages.IdeasPage);
const InboxPage = lazy(pages.InboxPage);
const ProjectPage = lazy(pages.ProjectPage);
const LibraryPage = lazy(pages.LibraryPage);
const BookPage = lazy(pages.BookPage);
const DocumentsPage = lazy(pages.DocumentsPage);
const MoneyPage = lazy(pages.MoneyPage);
const ExpensesPage = lazy(pages.ExpensesPage);
const MoneyIdeasPage = lazy(pages.MoneyIdeasPage);
const MoneyIdeaPage = lazy(pages.MoneyIdeaPage);
const ReviewsPage = lazy(pages.ReviewsPage);
const TimelinePage = lazy(pages.TimelinePage);
const VaultPage = lazy(pages.VaultPage);
const SettingsPage = lazy(pages.SettingsPage);
const ProfilePage = lazy(pages.ProfilePage);
const NotFoundPage = lazy(pages.NotFoundPage);
const MiniappsPage = lazy(pages.MiniappsPage);
const MiniappStorePage = lazy(pages.MiniappStorePage);
const MiniappStoreAppPage = lazy(pages.MiniappStoreAppPage);
const MiniappWallpaperPage = lazy(pages.MiniappWallpaperPage);
const MiniappScreen = lazy(pages.MiniappScreen);

function RequireUser() {
  const { user, isLoading, expectUser } = useAuth();
  const location = useLocation();
  // While the session is checked, show the navigation if this device was signed in last time;
  // otherwise nothing, to avoid a flash of it before the login page.
  if (isLoading)
    return expectUser ? (
      <ShellFrame>
        <PageSkeleton />
      </ShellFrame>
    ) : null;
  if (!user)
    return <Navigate to="/login" replace state={{ from: location.pathname + location.search }} />;
  return <Outlet />;
}

/** Documents used to live under Library; old addresses (bookmarks, history) still open. */
function MovedToDocuments() {
  const { search, hash } = useLocation();
  return <Navigate to={{ pathname: '/documents', search, hash }} replace />;
}

function GuestOnly() {
  const { user, isLoading } = useAuth();
  if (isLoading) return null;
  if (user) return <Navigate to="/" replace />;
  return <Outlet />;
}

export default function App() {
  return (
    <Suspense fallback={<Loading className="px-6" />}>
      <Routes>
        <Route element={<GuestOnly />}>
          <Route path="/login" element={<LoginPage />} />
        </Route>
        <Route element={<RequireUser />}>
          <Route element={<AppShell preload={preloadPages} />}>
            <Route index element={<HomePage />} />
            <Route path="inbox" element={<InboxPage />} />

            <Route path="journal" element={<JournalPage />} />
            <Route path="journal/:id" element={<EditorPage kind="journal" />} />
            <Route path="writing" element={<WritingPage />} />
            <Route path="writing/:id" element={<EditorPage kind="writing" />} />
            <Route path="thinking" element={<ThinkingPage />} />
            <Route path="reviews" element={<ReviewsPage />} />
            <Route path="timeline" element={<TimelinePage />} />

            <Route path="ideas" element={<IdeasPage />} />
            <Route path="ideas/:id" element={<EditorPage kind="note" />} />

            <Route path="money" element={<MoneyPage />} />
            <Route path="money/expenses" element={<ExpensesPage />} />
            <Route path="money/ideas" element={<MoneyIdeasPage />} />
            <Route path="money/ideas/:id" element={<MoneyIdeaPage />} />

            <Route path="tasks" element={<TasksPage view="today" />} />
            <Route path="tasks/upcoming" element={<TasksPage view="upcoming" />} />
            <Route path="tasks/done" element={<TasksPage view="done" />} />
            <Route path="tasks/all" element={<TasksPage view="all" />} />
            <Route path="tasks/projects" element={<TasksPage view="projects" />} />
            <Route path="tasks/projects/:id" element={<ProjectPage />} />

            <Route path="library" element={<LibraryPage />} />
            <Route path="library/books/:id" element={<BookPage />} />

            <Route path="documents" element={<DocumentsPage />} />
            <Route path="library/documents" element={<MovedToDocuments />} />

            <Route path="vault" element={<VaultPage />} />

            <Route path="miniapps" element={<MiniappsPage />} />
            <Route path="miniapps/store" element={<MiniappStorePage />} />
            <Route path="miniapps/store/:appId" element={<MiniappStoreAppPage />} />
            <Route path="miniapps/wallpaper" element={<MiniappWallpaperPage />} />
            <Route path="miniapps/:appId" element={<MiniappScreen />} />
            <Route path="profile" element={<ProfilePage />} />
            <Route path="settings" element={<SettingsPage />} />
            <Route path="*" element={<NotFoundPage />} />
          </Route>
        </Route>
      </Routes>
    </Suspense>
  );
}
