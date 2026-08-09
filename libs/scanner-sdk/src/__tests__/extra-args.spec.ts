import { EXTRA_ARGS_KEY, sanitizeExtraArgs, injectExtraArgs } from '../extra-args';

describe('extra-args', () => {
  it('EXTRA_ARGS_KEY vaut "extraArgs"', () => {
    expect(EXTRA_ARGS_KEY).toBe('extraArgs');
  });

  it('sanitizeExtraArgs ne garde que des chaînes non vides', () => {
    expect(sanitizeExtraArgs(['-sC', '', '  ', '-p80', 3 as unknown])).toEqual(['-sC', '-p80']);
    expect(sanitizeExtraArgs('nope')).toEqual([]);
    expect(sanitizeExtraArgs(undefined)).toEqual([]);
  });

  it('sanitizeExtraArgs borne le nombre et la longueur des arguments', () => {
    const many = Array.from({ length: 100 }, (_, i) => `-a${i}`);
    expect(sanitizeExtraArgs(many).length).toBe(50);
    const longArg = 'x'.repeat(5000);
    expect(sanitizeExtraArgs([longArg])[0].length).toBe(1024);
  });

  it('injectExtraArgs insère juste après le binaire', () => {
    expect(injectExtraArgs(['nmap', '-p', '80', 'host'], ['-sC'])).toEqual([
      'nmap',
      '-sC',
      '-p',
      '80',
      'host',
    ]);
  });

  it('injectExtraArgs sur cmd vide renvoie juste les extra', () => {
    expect(injectExtraArgs([], ['-h'])).toEqual(['-h']);
  });

  it('injectExtraArgs sans extra renvoie la cmd inchangée', () => {
    expect(injectExtraArgs(['nmap', 'host'], [])).toEqual(['nmap', 'host']);
  });
});
