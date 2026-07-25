import { Navigate, Route, Routes } from 'react-router-dom';
import { useAuth } from './lib/auth-context';
import { useScope } from './lib/scope-context';
import { AppShell } from './components/app-shell';
import { LoginPage } from './features/auth/login-page';
import { ScanDetailPage } from './features/scans/scan-detail-page';
import { ToolsSectionPage } from './features/tools/tools-section-page';
import { AssetDetailPage } from './features/assets/asset-detail-page';
import { SettingsPage } from './features/settings/settings-page';
import { HuntSearchPage } from './features/hunt/hunt-search-page';
import { HuntRunPage } from './features/hunt/hunt-run-page';
import { EngagementsListPage } from './features/engagements/engagements-list-page';
import { EngagementPage } from './features/engagements/engagement-page';
import { ScanRunPage } from './features/scans/scan-run-page';
import { TemplateRunPage } from './features/template-runs/template-run-page';
import { CockpitPage } from './features/cockpit/cockpit-page';
import { TargetsLibraryPage } from './features/targets/targets-library-page';
import { AuditPage } from './features/audit/audit-page';

function RequireAuth({ children }: { children: JSX.Element }) {
  const { session } = useAuth();
  if (!session) return <Navigate to="/login" replace />;
  return children;
}

function ToolsScoped() {
  const { engagementId } = useScope();
  return <ToolsSectionPage engagementId={engagementId ?? undefined} />;
}

export interface AppRoutesProps {
  email: string;
  onLogout: () => void;
}

export function AppRoutes({ email, onLogout }: AppRoutesProps) {
  const { session } = useAuth();
  return (
    <Routes>
      <Route path="/login" element={<LoginPage />} />

      <Route
        element={
          <RequireAuth>
            <AppShell email={email} onLogout={onLogout} />
          </RequireAuth>
        }
      >
        {/* Target IA */}
        <Route path="/" element={<CockpitPage />} />
        <Route path="/targets" element={<TargetsLibraryPage />} />
        <Route path="/targets/:assetId" element={<AssetDetailPage />} />
        <Route path="/audit" element={<AuditPage />} />
        <Route path="/tools" element={<ToolsScoped />} />
        <Route path="/hunt" element={<HuntSearchPage />} />
        <Route path="/hunt/:aiRunId" element={<HuntRunPage />} />
        <Route path="/settings" element={<SettingsPage />} />
        <Route path="/scans/:scanId" element={<ScanDetailPage />} />

        {/* Redirects for consolidated pages */}
        <Route path="/dashboard" element={<Navigate to="/" replace />} />
        <Route path="/scans" element={<Navigate to="/" replace />} />
        <Route path="/vulnerabilities" element={<Navigate to="/audit" replace />} />

        {/* Legacy engagement deep-pages (off primary nav; re-homed in P3/P4) */}
        <Route path="/engagements" element={<EngagementsListPage />} />
        <Route path="/engagements/:engagementId" element={<EngagementPage />} />
        <Route path="/engagements/:engagementId/scans" element={<ScanRunPage />} />
        <Route path="/engagements/:engagementId/scans/:scanId" element={<ScanDetailPage />} />
        <Route path="/engagements/:engagementId/vulnerabilities" element={<AuditPage />} />
        <Route path="/engagements/:engagementId/tools" element={<ToolsScoped />} />
        <Route
          path="/engagements/:engagementId/template-runs/:templateRunId"
          element={<TemplateRunPage />}
        />
        <Route path="/engagements/:engagementId/assets/:assetId" element={<AssetDetailPage />} />
      </Route>

      <Route path="*" element={<Navigate to={session ? '/' : '/login'} replace />} />
    </Routes>
  );
}
