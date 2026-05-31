import { useMemo } from 'react';
import { ApolloProvider } from '@apollo/client';
import { BrowserRouter, Link, Navigate, Route, Routes } from 'react-router-dom';
import { AuthProvider, useAuth } from './lib/auth-context';
import { createApolloClient } from './lib/apollo';
import { LoginPage } from './features/auth/login-page';
import { EngagementPage } from './features/engagements/engagement-page';
import { EngagementsListPage } from './features/engagements/engagements-list-page';
import { ScanRunPage } from './features/scans/scan-run-page';
import { TemplateRunPage } from './features/template-runs/template-run-page';
import { AssetDetailPage } from './features/assets/asset-detail-page';

function RequireAuth({ children }: { children: JSX.Element }) {
  const { session } = useAuth();
  if (!session) return <Navigate to="/login" replace />;
  return children;
}

function TopBar() {
  const { session, logout } = useAuth();
  if (!session) return null;
  return (
    <nav className="bg-slate-900 px-6 py-3 flex items-center justify-between border-b border-slate-800">
      <div className="flex items-center gap-6">
        <span className="font-semibold">AutoScanner</span>
        <Link to="/engagements" className="text-sm text-slate-300 hover:text-white">
          Engagements
        </Link>
      </div>
      <div className="text-sm text-slate-400 flex items-center gap-3">
        <span>{session.email}</span>
        <button onClick={logout} className="hover:underline">
          Logout
        </button>
      </div>
    </nav>
  );
}

function AppShell() {
  const { session } = useAuth();
  const client = useMemo(() => createApolloClient(session), [session]);

  return (
    <ApolloProvider client={client}>
      <TopBar />
      <Routes>
        <Route path="/login" element={<LoginPage />} />
        <Route
          path="/engagements"
          element={
            <RequireAuth>
              <EngagementsListPage />
            </RequireAuth>
          }
        />
        <Route
          path="/engagements/:engagementId"
          element={
            <RequireAuth>
              <EngagementPage />
            </RequireAuth>
          }
        />
        <Route
          path="/engagements/:engagementId/scans"
          element={
            <RequireAuth>
              <ScanRunPage />
            </RequireAuth>
          }
        />
        <Route
          path="/engagements/:engagementId/template-runs/:templateRunId"
          element={
            <RequireAuth>
              <TemplateRunPage />
            </RequireAuth>
          }
        />
        <Route
          path="/engagements/:engagementId/assets/:assetId"
          element={
            <RequireAuth>
              <AssetDetailPage />
            </RequireAuth>
          }
        />
        <Route path="*" element={<Navigate to={session ? '/engagements' : '/login'} replace />} />
      </Routes>
    </ApolloProvider>
  );
}

export function App() {
  return (
    <BrowserRouter>
      <AuthProvider>
        <AppShell />
      </AuthProvider>
    </BrowserRouter>
  );
}
