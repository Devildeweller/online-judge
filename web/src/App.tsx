import { lazy, type ReactNode, Suspense } from 'react';
import { Navigate, Route, Routes, useLocation } from 'react-router-dom';
import { useAuth } from './auth/AuthContext';
import { Layout } from './components/Layout';
import { RealtimeBridge } from './components/RealtimeBridge';
import { Empty, Loading } from './components/ui';
import { ContestPage } from './pages/Contest';
import { ContestsPage } from './pages/Contests';
import { HomePage } from './pages/Home';
import { LeaderboardPage } from './pages/Leaderboard';
import { LoginPage, RegisterPage } from './pages/Auth';
import { ProblemsPage } from './pages/Problems';
import { ProfilePage } from './pages/Profile';
import { SubmissionsPage } from './pages/Submissions';

// Pages that pull in the code editor or the admin tooling are split into their own chunks.
const ProblemPage = lazy(() => import('./pages/Problem').then((m) => ({ default: m.ProblemPage })));
const ContestProblemPage = lazy(() => import('./pages/Problem').then((m) => ({ default: m.ContestProblemPage })));
const SubmissionPage = lazy(() => import('./pages/Submission').then((m) => ({ default: m.SubmissionPage })));
const AdminLayout = lazy(() => import('./pages/admin/AdminLayout').then((m) => ({ default: m.AdminLayout })));
const AdminDashboard = lazy(() => import('./pages/admin/AdminDashboard').then((m) => ({ default: m.AdminDashboard })));
const AdminProblems = lazy(() => import('./pages/admin/AdminProblems').then((m) => ({ default: m.AdminProblems })));
const AdminProblemEdit = lazy(() => import('./pages/admin/AdminProblemEdit').then((m) => ({ default: m.AdminProblemEdit })));
const AdminContests = lazy(() => import('./pages/admin/AdminContests').then((m) => ({ default: m.AdminContests })));
const AdminContestEdit = lazy(() => import('./pages/admin/AdminContestEdit').then((m) => ({ default: m.AdminContestEdit })));
const AdminUsers = lazy(() => import('./pages/admin/AdminUsers').then((m) => ({ default: m.AdminUsers })));

function RequireAdmin({ children }: { children: ReactNode }) {
  const { user, ready, isAdmin } = useAuth();
  const location = useLocation();
  if (!ready) return <Loading />;
  if (!user) return <Navigate to="/login" replace state={{ from: location.pathname }} />;
  if (!isAdmin) return <Empty title="Administrators only">You do not have access to this area.</Empty>;
  return children;
}

export function App() {
  return (
    <>
      <RealtimeBridge />
      <Suspense fallback={<Loading />}>
        <Routes>
          <Route element={<Layout />}>
            <Route index element={<HomePage />} />
            <Route path="problems" element={<ProblemsPage />} />
            <Route path="problems/:slug" element={<ProblemPage />} />
            <Route path="submissions" element={<SubmissionsPage />} />
            <Route path="submissions/:id" element={<SubmissionPage />} />
            <Route path="contests" element={<ContestsPage />} />
            <Route path="contests/:slug" element={<ContestPage />} />
            <Route path="contests/:slug/problems/:label" element={<ContestProblemPage />} />
            <Route path="leaderboard" element={<LeaderboardPage />} />
            <Route path="users/:username" element={<ProfilePage />} />
            <Route path="login" element={<LoginPage />} />
            <Route path="register" element={<RegisterPage />} />
            <Route
              path="admin"
              element={
                <RequireAdmin>
                  <AdminLayout />
                </RequireAdmin>
              }
            >
              <Route index element={<AdminDashboard />} />
              <Route path="problems" element={<AdminProblems />} />
              <Route path="problems/new" element={<AdminProblemEdit />} />
              <Route path="problems/:id" element={<AdminProblemEdit />} />
              <Route path="contests" element={<AdminContests />} />
              <Route path="contests/new" element={<AdminContestEdit />} />
              <Route path="contests/:id" element={<AdminContestEdit />} />
              <Route path="users" element={<AdminUsers />} />
            </Route>
            <Route path="*" element={<Empty title="Page not found">The page you are looking for does not exist.</Empty>} />
          </Route>
        </Routes>
      </Suspense>
    </>
  );
}
