import { validateChain } from './schema';
import type { ChainDefinition } from './types';

export class ChainRegistry {
  private readonly byName = new Map<string, ChainDefinition>();

  register(chain: ChainDefinition): void {
    const validated = validateChain(chain);
    if (this.byName.has(validated.name)) {
      throw new Error(`Chain "${validated.name}" already registered`);
    }
    this.byName.set(validated.name, validated);
  }

  has(name: string): boolean {
    return this.byName.has(name);
  }

  get(name: string): ChainDefinition {
    const chain = this.byName.get(name);
    if (!chain) throw new Error(`Unknown chain: ${name}`);
    return chain;
  }

  list(): ChainDefinition[] {
    return [...this.byName.values()];
  }
}
