import { describe, expect, it } from 'vitest';
import { buildOsintGraph } from '../build-osint-graph';

describe('buildOsintGraph', () => {
  it('places each entity kind in its column', () => {
    const { nodes } = buildOsintGraph(
      [{ id: 'i1', service: 'github', seed: 'neo' }],
      [{ id: 'e1', address: 'neo@corp.com' }],
      [{ id: 'a1', value: 'corp.com', type: 'DOMAIN' }],
    );
    expect(nodes.find((n) => n.kind === 'identity')?.column).toBe(0);
    expect(nodes.find((n) => n.kind === 'email')?.column).toBe(1);
    expect(nodes.find((n) => n.kind === 'asset')?.column).toBe(2);
  });

  it('links an identity to an email by full address or local-part', () => {
    const graph = buildOsintGraph(
      [
        { id: 'i1', service: 'holehe', seed: 'neo@corp.com' },
        { id: 'i2', service: 'github', seed: 'neo' },
      ],
      [{ id: 'e1', address: 'neo@corp.com' }],
      [],
    );
    expect(graph.edges).toContainEqual({ from: 'identity:i1', to: 'email:neo@corp.com' });
    expect(graph.edges).toContainEqual({ from: 'identity:i2', to: 'email:neo@corp.com' });
  });

  it('links an email to a matching domain asset', () => {
    const graph = buildOsintGraph(
      [],
      [{ id: 'e1', address: 'admin@corp.com' }],
      [
        { id: 'a1', value: 'corp.com', type: 'DOMAIN' },
        { id: 'a2', value: 'other.com', type: 'DOMAIN' },
      ],
    );
    expect(graph.edges).toContainEqual({ from: 'email:admin@corp.com', to: 'asset:a1' });
    expect(graph.edges.some((e) => e.to === 'asset:a2')).toBe(false);
  });

  it('excludes non domain/subdomain/ip asset types and dedupes emails', () => {
    const graph = buildOsintGraph(
      [],
      [
        { id: 'e1', address: 'a@corp.com' },
        { id: 'e2', address: 'a@corp.com' },
      ],
      [{ id: 'a1', value: 'https://corp.com/login', type: 'URL' }],
    );
    expect(graph.nodes.filter((n) => n.kind === 'email')).toHaveLength(1);
    expect(graph.nodes.filter((n) => n.kind === 'asset')).toHaveLength(0);
  });

  it('keeps isolated identities with no edges', () => {
    const graph = buildOsintGraph([{ id: 'i1', service: 'reddit', seed: 'ghost' }], [], []);
    expect(graph.nodes).toHaveLength(1);
    expect(graph.edges).toHaveLength(0);
  });
});
