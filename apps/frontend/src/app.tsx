import { useMemo } from 'react';
import { ApolloProvider } from '@apollo/client';
import { BrowserRouter, Navigate, Route, Routes } from 'react-router-dom';
import { AuthProvider, useAuth } from './lib/auth-context';
import { createApolloClient } from './lib/apollo';
import { LoginPage } from './features/auth/login-page';
import { DashboardPage } from './features/dashboard/dashboard-page';
import { EngagementPage } from './features/engagements/engagement-page';
import { EngagementsListPage } from './features/engagements/engagements-list-page';
import { ScanRunPage } from './features/scans/scan-run-page';
import { ScanDetailPage } from './features/scans/scan-detail-page';
import { TemplateRunPage } from './features/template-runs/template-run-page';
import { AssetDetailPage } from './features/assets/asset-detail-page';
import { SettingsPage } from './features/settings/settings-page';
import { MainNav } from './components/main-nav';
import { ScansSectionPage } from './features/scans/scans-section-page';
import { VulnerabilitiesSectionPage } from './features/findings/vulnerabilities-section-page';
import { ToolsSectionPage } from './features/tools/tools-section-page';
import { HuntSearchPage } from './features/hunt/hunt-search-page';

function RequireAuth({ children }: { children: JSX.Element }) {
  const { session } = useAuth();
  if (!session) return <Navigate to="/login" replace />;
  return children;
}

function AppShell() {
  const { session, logout } = useAuth();
  const client = useMemo(() => createApolloClient(session), [session]);

  return (
    <ApolloProvider client={client}>
      {session ? <MainNav email={session.email} onLogout={logout} /> : null}
      <Routes>
        <Route path="/login" element={<LoginPage />} />
        <Route
          path="/dashboard"
          element={
            <RequireAuth>
              <DashboardPage />
            </RequireAuth>
          }
        />
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
          path="/scans/:scanId"
          element={
            <RequireAuth>
              <ScanDetailPage />
            </RequireAuth>
          }
        />
        <Route
          path="/engagements/:engagementId/scans/:scanId"
          element={
            <RequireAuth>
              <ScanDetailPage />
            </RequireAuth>
          }
        />
        <Route
          path="/engagements/:engagementId/vulnerabilities"
          element={
            <RequireAuth>
              <VulnerabilitiesSectionPage />
            </RequireAuth>
          }
        />
        <Route
          path="/engagements/:engagementId/tools"
          element={
            <RequireAuth>
              <ToolsSectionPage />
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
        <Route
          path="/settings"
          element={
            <RequireAuth>
              <SettingsPage />
            </RequireAuth>
          }
        />
        <Route
          path="/scans"
          element={
            <RequireAuth>
              <ScansSectionPage />
            </RequireAuth>
          }
        />
        <Route
          path="/vulnerabilities"
          element={
            <RequireAuth>
              <VulnerabilitiesSectionPage />
            </RequireAuth>
          }
        />
        <Route
          path="/tools"
          element={
            <RequireAuth>
              <ToolsSectionPage />
            </RequireAuth>
          }
        />
        <Route
          path="/hunt"
          element={
            <RequireAuth>
              <HuntSearchPage />
            </RequireAuth>
          }
        />
        {/* TODO(hunt-run): add /hunt/:aiRunId route in task 5.3 */}
        <Route path="*" element={<Navigate to={session ? '/dashboard' : '/login'} replace />} />
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
