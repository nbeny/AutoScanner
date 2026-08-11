import {
  DuplicateTemplateError,
  TemplateDefinition,
  TemplateNotFoundError,
  TemplateRegistry,
} from '../index';

const makeTemplate = (
  name: string,
  overrides: Partial<TemplateDefinition> = {},
): TemplateDefinition => ({
  name,
  displayName: `Display ${name}`,
  description: `Description for ${name}`,
  steps: [{ scannerName: 'noop', args: '-h' }],
  ...overrides,
});

describe('TemplateRegistry', () => {
  let registry: TemplateRegistry;

  beforeEach(() => {
    registry = new TemplateRegistry();
  });

  it('registers a template definition', () => {
    const def = makeTemplate('recon-passive');

    expect(() => registry.register(def)).not.toThrow();
    expect(registry.get('recon-passive')).toBe(def);
  });

  it('throws DuplicateTemplateError when registering the same name twice', () => {
    const def = makeTemplate('recon-passive');
    registry.register(def);

    expect(() => registry.register(makeTemplate('recon-passive'))).toThrow(DuplicateTemplateError);
  });

  it('throws TemplateNotFoundError when getting an unknown template', () => {
    expect(() => registry.get('does-not-exist')).toThrow(TemplateNotFoundError);
  });

  it('reports membership via has()', () => {
    expect(registry.has('alpha')).toBe(false);
    registry.register(makeTemplate('alpha'));
    expect(registry.has('alpha')).toBe(true);
    expect(registry.has('beta')).toBe(false);
  });

  it('lists all registered template definitions', () => {
    const a = makeTemplate('alpha');
    const b = makeTemplate('beta');

    registry.register(a);
    registry.register(b);

    const all = registry.list();
    expect(all).toHaveLength(2);
    expect(all).toEqual(expect.arrayContaining([a, b]));
  });
});
