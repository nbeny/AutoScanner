import { useMemo } from 'react';
import { ApolloProvider } from '@apollo/client';
import { BrowserRouter, Navigate, Route, Routes } from 'react-router-dom';
import { AuthProvider, useAuth } from './lib/auth-context';
import { createApolloClient } from './lib/apollo';

function Placeholder({ title }: { title: string }) {
  return (
    <div className="p-8">
      <h1 className="text-2xl font-semibold">{title}</h1>
      <p className="text-slate-400 mt-2">Coming in Task 16.</p>
    </div>
  );
}

function RequireAuth({ children }: { children: JSX.Element }) {
  const { session } = useAuth();
  if (!session) return <Navigate to="/login" replace />;
  return children;
}

function AppShell() {
  const { session } = useAuth();
  const client = useMemo(() => createApolloClient(session), [session]);

  return (
    <ApolloProvider client={client}>
      <Routes>
        <Route path="/login" element={<Placeholder title="Login" />} />
        <Route
          path="/engagements"
          element={
            <RequireAuth>
              <Placeholder title="Engagements" />
            </RequireAuth>
          }
        />
        <Route
          path="/scans/new"
          element={
            <RequireAuth>
              <Placeholder title="Run a scan" />
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
