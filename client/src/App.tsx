import { lazy, Suspense } from 'react';
import { Navigate, Outlet, Route, Routes, useLocation } from 'react-router-dom';
import { AppShell } from './components/shell/AppShell';
import { Loading } from './components/ui/misc';
import { useAuth } from './context/AuthContext';
import { EditorPage } from './features/entries/EditorPage';
import HomePage from './features/home/HomePage';
import TasksPage from './features/tasks/TasksPage';
import LoginPage from './pages/LoginPage';

// Less frequent pages load on demand.
const JournalPage = lazy(() => import('./features/entries/JournalPage'));
const WritingPage = lazy(() => import('./features/entries/WritingPage'));
const ThinkingPage = lazy(() => import('./features/entries/ThinkingPage'));
const IdeasPage = lazy(() => import('./features/entries/IdeasPage'));
const InboxPage = lazy(() => import('./features/inbox/InboxPage'));
const ProjectPage = lazy(() => import('./features/projects/ProjectPage'));
const LibraryPage = lazy(() => import('./features/library/LibraryPage'));
const BookPage = lazy(() => import('./features/library/BookPage'));
const MoneyPage = lazy(() => import('./features/money/MoneyPage'));
const ExpensesPage = lazy(() => import('./features/money/ExpensesPage'));
const MoneyIdeasPage = lazy(() => import('./features/money/MoneyIdeasPage'));
const MoneyIdeaPage = lazy(() => import('./features/money/MoneyIdeaPage'));
const ReviewsPage = lazy(() => import('./features/reviews/ReviewsPage'));
const TimelinePage = lazy(() => import('./features/timeline/TimelinePage'));
const VaultPage = lazy(() => import('./features/vault/VaultPage'));
const SettingsPage = lazy(() => import('./pages/SettingsPage'));
const ProfilePage = lazy(() => import('./features/profile/ProfilePage'));
const NotFoundPage = lazy(() => import('./pages/NotFoundPage'));

function RequireUser() {
  const { user, isLoading } = useAuth();
  const location = useLocation();
  if (isLoading) return null; // usually a few ms; avoids a flash of the login page
  if (!user)
    return <Navigate to="/login" replace state={{ from: location.pathname + location.search }} />;
  return <Outlet />;
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
          <Route element={<AppShell />}>
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

            <Route path="library" element={<LibraryPage tab="books" />} />
            <Route path="library/documents" element={<LibraryPage tab="documents" />} />
            <Route path="library/books/:id" element={<BookPage />} />

            <Route path="vault" element={<VaultPage />} />
            <Route path="profile" element={<ProfilePage />} />
            <Route path="settings" element={<SettingsPage />} />
            <Route path="*" element={<NotFoundPage />} />
          </Route>
        </Route>
      </Routes>
    </Suspense>
  );
}
