import { Injectable, Logger } from '@nestjs/common';
import type { Parser } from './types';

@Injectable()
export class ParserRegistry {
  private readonly logger = new Logger(ParserRegistry.name);
  private readonly parsers = new Map<string, Parser>();

  register(parser: Parser): void {
    if (this.parsers.has(parser.name)) {
      throw new Error(`Parser "${parser.name}" is already registered`);
    }
    this.parsers.set(parser.name, parser);
    this.logger.log(`Registered parser: ${parser.name}`);
  }

  has(name: string): boolean {
    return this.parsers.has(name);
  }

  get(name: string): Parser {
    const parser = this.parsers.get(name);
    if (!parser) {
      throw new Error(`Parser "${name}" not found in registry`);
    }
    return parser;
  }

  list(): Parser[] {
    return Array.from(this.parsers.values());
  }
}
