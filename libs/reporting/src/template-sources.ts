import fs from 'node:fs';
import path from 'node:path';

const TEMPLATES_DIR = path.join(__dirname, 'templates');

function read(name: string): string {
  return fs.readFileSync(path.join(TEMPLATES_DIR, name), 'utf8');
}

export const TEMPLATE_SOURCES = {
  executiveSummary: read('executive-summary.hbs'),
  technicalDetailed: read('technical-detailed.hbs'),
} as const;
