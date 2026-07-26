import { describe, expect, it } from 'vitest';
import { detectSeedType } from '../detect-seed-type';

describe('detectSeedType', () => {
  it('classifies an email address', () => {
    expect(detectSeedType('alice@corp.com')).toBe('EMAIL');
    expect(detectSeedType('  bob.smith@sub.example.co.uk ')).toBe('EMAIL');
  });

  it('classifies a bare domain', () => {
    expect(detectSeedType('corp.com')).toBe('DOMAIN');
    expect(detectSeedType('app.example.org')).toBe('DOMAIN');
  });

  it('classifies a multi-word input as a person', () => {
    expect(detectSeedType('John Doe')).toBe('PERSON');
    expect(detectSeedType('jean pierre martin')).toBe('PERSON');
  });

  it('classifies a single bare token as a username', () => {
    expect(detectSeedType('neo')).toBe('USERNAME');
    expect(detectSeedType('h4ck3r_01')).toBe('USERNAME');
  });

  it('defaults an empty seed to username', () => {
    expect(detectSeedType('   ')).toBe('USERNAME');
  });
});
