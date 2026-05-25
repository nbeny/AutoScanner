import { ApolloClient, InMemoryCache, HttpLink, split, from } from '@apollo/client';
import { setContext } from '@apollo/client/link/context';
import { GraphQLWsLink } from '@apollo/client/link/subscriptions';
import { getMainDefinition } from '@apollo/client/utilities';
import { createClient } from 'graphql-ws';
import type { AuthSession } from './auth';

export function createApolloClient(session: AuthSession | null) {
  if (!session) {
    return new ApolloClient({
      link: new HttpLink({ uri: '/graphql' }),
      cache: new InMemoryCache(),
    });
  }

  const httpLink = new HttpLink({ uri: `${session.apiUrl}/graphql` });
  const wsUrl = session.apiUrl.replace(/^http/, 'ws') + '/graphql';
  const wsLink = new GraphQLWsLink(
    createClient({
      url: wsUrl,
      connectionParams: { authorization: `Bearer ${session.accessToken}` },
    }),
  );

  const authLink = setContext((_, { headers }) => ({
    headers: { ...headers, authorization: `Bearer ${session.accessToken}` },
  }));

  const link = split(
    ({ query }) => {
      const def = getMainDefinition(query);
      return def.kind === 'OperationDefinition' && def.operation === 'subscription';
    },
    wsLink,
    from([authLink, httpLink]),
  );

  return new ApolloClient({ link, cache: new InMemoryCache() });
}
