import { Navigate, Route, Routes } from 'react-router-dom';
import { useAuth } from './lib/auth-context';
import { useScope } from './lib/scope-context';
import { AppShell } from './components/app-shell';
import { Panel } from './components/ui/panel';
import { LoginPage } from './features/auth/login-page';
import { ScansSectionPage } from './features/scans/scans-section-page';
import { ScanDetailPage } from './features/scans/scan-detail-page';
import { VulnerabilitiesSectionPage } from './features/findings/vulnerabilities-section-page';
import { ToolsSectionPage } from './features/tools/tools-section-page';
import { AssetDetailPage } from './features/assets/asset-detail-page';
import { SettingsPage } from './features/settings/settings-page';
import { HuntSearchPage } from './features/hunt/hunt-search-page';
import { HuntRunPage } from './features/hunt/hunt-run-page';
import { EngagementsListPage } from './features/engagements/engagements-list-page';
import { EngagementPage } from './features/engagements/engagement-page';
import { ScanRunPage } from './features/scans/scan-run-page';
import { TemplateRunPage } from './features/template-runs/template-run-page';

function RequireAuth({ children }: { children: JSX.Element }) {
  const { session } = useAuth();
  if (!session) return <Navigate to="/login" replace />;
  return children;
}

function CockpitInterim() {
  const { engagementId } = useScope();
  return <ScansSectionPage engagementId={engagementId ?? undefined} />;
}

function AuditInterim() {
  const { engagementId } = useScope();
  return <VulnerabilitiesSectionPage engagementId={engagementId ?? undefined} />;
}

function ToolsScoped() {
  const { engagementId } = useScope();
  return <ToolsSectionPage engagementId={engagementId ?? undefined} />;
}

function TargetsPlaceholder() {
  return (
    <div className="p-8">
      <Panel aria-label="targets-placeholder">
        <h1 className="text-lg font-semibold text-slate-100">Bibliothèque de cibles</h1>
        <p className="mt-2 text-sm text-slate-400">
          La bibliothèque IP arrive en Phase 3. Les fiches par cible sont déjà accessibles via un
          lien direct (<code>/targets/:id</code>).
        </p>
      </Panel>
    </div>
  );
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
        <Route path="/" element={<CockpitInterim />} />
        <Route path="/targets" element={<TargetsPlaceholder />} />
        <Route path="/targets/:assetId" element={<AssetDetailPage />} />
        <Route path="/audit" element={<AuditInterim />} />
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
        <Route path="/engagements/:engagementId/vulnerabilities" element={<AuditInterim />} />
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
