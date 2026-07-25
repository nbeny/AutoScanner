import { useMemo } from 'react';
import { ApolloProvider } from '@apollo/client';
import { BrowserRouter } from 'react-router-dom';
import { AuthProvider, useAuth } from './lib/auth-context';
import { ScopeProvider } from './lib/scope-context';
import { createApolloClient } from './lib/apollo';
import { AppRoutes } from './app-routes';

function AppRoot() {
  const { session, logout } = useAuth();
  const client = useMemo(() => createApolloClient(session), [session]);
  return (
    <ApolloProvider client={client}>
      <AppRoutes email={session?.email ?? ''} onLogout={logout} />
    </ApolloProvider>
  );
}

export function App() {
  return (
    <BrowserRouter>
      <AuthProvider>
        <ScopeProvider>
          <AppRoot />
        </ScopeProvider>
      </AuthProvider>
    </BrowserRouter>
  );
}
