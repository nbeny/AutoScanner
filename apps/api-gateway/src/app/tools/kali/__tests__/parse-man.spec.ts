import { parseManOptions } from '../parse-man';

const NMAP_MAN = [
  'NAME',
  '       nmap - Network exploration tool',
  '',
  'OPTIONS SUMMARY',
  '       -sS, --syn-scan',
  '              TCP SYN scan.',
  '',
  '       -p <port ranges>, --ports <port ranges>',
  '              Only scan specified ports.',
  '',
  '       -sV',
  '              Probe open ports to determine service/version info.',
  '',
  'EXAMPLES',
  '       nmap -sV target',
].join('\n');

describe('parseManOptions', () => {
  it('extrait les options de la section OPTIONS', () => {
    const { options, confidence } = parseManOptions(NMAP_MAN);
    const flags = options.map((o) => o.flag);
    expect(flags).toEqual(['-sS', '-p', '-sV']);
    expect(confidence).toBe('high');
    expect(options[1].argHint).toBe('<port ranges>');
    expect(options[0].description).toContain('SYN scan');
  });

  it('renvoie none sur texte vide', () => {
    expect(parseManOptions('').confidence).toBe('none');
  });

  it('ne déborde pas hors de la section OPTIONS', () => {
    const { options } = parseManOptions(NMAP_MAN);
    expect(options.every((o) => o.flag.startsWith('-'))).toBe(true);
    expect(options).toHaveLength(3);
  });
});
