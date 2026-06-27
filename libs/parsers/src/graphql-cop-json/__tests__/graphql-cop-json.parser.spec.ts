import { GraphqlCopJsonParser } from '../graphql-cop-json.parser';
import type { ParserContext } from '../../types';

const ctx: ParserContext = {
  scanJobId: 'j',
  scannerName: 'graphql-cop',
  target: 'https://acme.tld/graphql',
  engagementId: 'e',
};

const SAMPLE = JSON.stringify([
  {
    title: 'Mutation is allowed over GET (possible CSRF)',
    impact: 'High',
    curl_verify: 'curl ...',
  },
  { title: 'Alias Overloading', impact: 'High', curl_verify: 'curl ...' },
  { title: 'Introspection Query', impact: 'Medium', curl_verify: 'curl ...' },
  { title: 'Field Suggestions', impact: 'Low', curl_verify: 'curl ...' },
  { title: 'Array-based Query Batching', impact: 'Medium', curl_verify: 'curl ...' },
  { title: 'Directive Overloading', impact: 'Medium', curl_verify: 'curl ...' },
  { title: 'Some Unknown Check', impact: 'Info', curl_verify: 'curl ...' },
]);

describe('GraphqlCopJsonParser', () => {
  const parser = new GraphqlCopJsonParser();

  it('maps Mutation-over-GET → HIGH with stable title', async () => {
    const out = await parser.parse(SAMPLE, ctx);
    const f = out.findings.find((x) => x.title === 'GRAPHQL_COP_MUTATION_OVER_GET');
    expect(f?.severity).toBe('HIGH');
  });

  it('maps Alias Overloading → HIGH', async () => {
    const out = await parser.parse(SAMPLE, ctx);
    const f = out.findings.find((x) => x.title === 'GRAPHQL_COP_ALIAS_OVERLOADING');
    expect(f?.severity).toBe('HIGH');
  });

  it('maps Introspection Query → MEDIUM', async () => {
    const out = await parser.parse(SAMPLE, ctx);
    const f = out.findings.find((x) => x.title === 'GRAPHQL_COP_INTROSPECTION_ENABLED');
    expect(f?.severity).toBe('MEDIUM');
  });

  it('maps Array Batching → MEDIUM', async () => {
    const out = await parser.parse(SAMPLE, ctx);
    const f = out.findings.find((x) => x.title === 'GRAPHQL_COP_BATCHING_ENABLED');
    expect(f?.severity).toBe('MEDIUM');
  });

  it('maps Directive Overloading → MEDIUM', async () => {
    const out = await parser.parse(SAMPLE, ctx);
    const f = out.findings.find((x) => x.title === 'GRAPHQL_COP_DIRECTIVE_OVERLOADING');
    expect(f?.severity).toBe('MEDIUM');
  });

  it('emits Field Suggestions → LOW (no parser-level filter; severity filter is a UI concern)', async () => {
    const out = await parser.parse(SAMPLE, ctx);
    const f = out.findings.find((x) => x.title === 'GRAPHQL_COP_FIELD_SUGGESTIONS');
    expect(f?.severity).toBe('LOW');
  });

  it('drops unrecognised upstream titles entirely', async () => {
    const out = await parser.parse(SAMPLE, ctx);
    expect(out.findings.find((x) => x.title === 'GRAPHQL_COP_UNKNOWN')).toBeUndefined();
  });

  it('sets location to the scanned endpoint', async () => {
    const out = await parser.parse(SAMPLE, ctx);
    expect(out.findings.every((f) => f.location === 'https://acme.tld/graphql')).toBe(true);
  });

  it('handles malformed JSON without throwing', async () => {
    expect((await parser.parse('not-json', ctx)).findings).toHaveLength(0);
  });
});
