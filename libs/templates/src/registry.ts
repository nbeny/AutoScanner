import { Injectable } from '@nestjs/common';
import type { TemplateDefinition } from './types';

export class TemplateNotFoundError extends Error {
  constructor(name: string) {
    super(`Template "${name}" not found in registry`);
    this.name = 'TemplateNotFoundError';
  }
}

export class DuplicateTemplateError extends Error {
  constructor(name: string) {
    super(`Template "${name}" already registered`);
    this.name = 'DuplicateTemplateError';
  }
}

@Injectable()
export class TemplateRegistry {
  private readonly templates = new Map<string, TemplateDefinition>();

  register(def: TemplateDefinition): void {
    if (this.templates.has(def.name)) throw new DuplicateTemplateError(def.name);
    this.templates.set(def.name, def);
  }

  get(name: string): TemplateDefinition {
    const def = this.templates.get(name);
    if (!def) throw new TemplateNotFoundError(name);
    return def;
  }

  list(): TemplateDefinition[] {
    return Array.from(this.templates.values());
  }
}
