import 'reflect-metadata';
import { config as loadEnv } from 'dotenv';
loadEnv();

import argon2 from 'argon2';
import { Prisma, PrismaClient, ReportFormat } from '@prisma/client';
import { BUILTIN_TEMPLATES } from '@autoscanner/templates';
import { TEMPLATE_SOURCES } from '@autoscanner/reporting';

const REPORT_TEMPLATES: {
  slug: string;
  name: string;
  description: string;
  format: ReportFormat;
  templateSource: string;
}[] = [
  {
    slug: 'executive-summary-pdf',
    name: 'Executive summary (PDF)',
    description: '1-2 pages PDF: scorecard, top findings, recommandations.',
    format: ReportFormat.PDF,
    templateSource: TEMPLATE_SOURCES.executiveSummary,
  },
  {
    slug: 'technical-detailed-pdf',
    name: 'Technical detailed (PDF)',
    description: 'PDF: rapport par asset (ports/services/tech/findings).',
    format: ReportFormat.PDF,
    templateSource: TEMPLATE_SOURCES.technicalDetailed,
  },
  {
    slug: 'findings-csv',
    name: 'Findings export (CSV)',
    description: 'CSV: une ligne par finding, colonnes complètes.',
    format: ReportFormat.CSV,
    templateSource: '',
  },
  {
    slug: 'sarif-export',
    name: 'SARIF export',
    description: 'SARIF 2.1.0 pour intégration CI/CD.',
    format: ReportFormat.SARIF,
    templateSource: '',
  },
  {
    slug: 'json-full-export',
    name: 'Full JSON export',
    description: "Dump JSON complet de l'engagement (engagement, scans, assets, findings).",
    format: ReportFormat.JSON,
    templateSource: '',
  },
];

async function seedReportTemplates(prisma: PrismaClient): Promise<void> {
  for (const tpl of REPORT_TEMPLATES) {
    await prisma.reportTemplate.upsert({
      where: { slug: tpl.slug },
      update: {
        name: tpl.name,
        description: tpl.description,
        format: tpl.format,
        templateSource: tpl.templateSource,
        isDefault: true,
      },
      create: {
        slug: tpl.slug,
        name: tpl.name,
        description: tpl.description,
        format: tpl.format,
        templateSource: tpl.templateSource,
        isDefault: true,
      },
    });
    // eslint-disable-next-line no-console
    console.log(`[seed] upserted report template: ${tpl.slug}`);
  }
}

async function seedOperator(prisma: PrismaClient): Promise<void> {
  const email = process.env.OPERATOR_EMAIL;
  const password = process.env.OPERATOR_PASSWORD;
  if (!email || !password) {
    throw new Error('OPERATOR_EMAIL and OPERATOR_PASSWORD must be set in .env');
  }

  const existing = await prisma.user.findUnique({ where: { email } });
  if (existing) {
    // eslint-disable-next-line no-console
    console.log(`[seed] operator user already exists: ${email}`);
    return;
  }
  const passwordHash = await argon2.hash(password, { type: argon2.argon2id });
  const user = await prisma.user.create({
    data: { email, passwordHash, displayName: 'Operator' },
  });
  // eslint-disable-next-line no-console
  console.log(`[seed] created operator user: ${user.email} (id=${user.id})`);
}

async function seedBuiltinTemplates(prisma: PrismaClient): Promise<void> {
  for (const tpl of BUILTIN_TEMPLATES) {
    const steps = tpl.steps as unknown as Prisma.InputJsonValue;
    await prisma.scanTemplate.upsert({
      where: { name: tpl.name },
      update: {
        displayName: tpl.displayName,
        description: tpl.description,
        steps,
        isSeeded: true,
      },
      create: {
        name: tpl.name,
        displayName: tpl.displayName,
        description: tpl.description,
        steps,
        isSeeded: true,
      },
    });
    // eslint-disable-next-line no-console
    console.log(`[seed] upserted scan template: ${tpl.name}`);
  }
}

async function main(): Promise<void> {
  const prisma = new PrismaClient();
  try {
    await seedOperator(prisma);
    await seedBuiltinTemplates(prisma);
    await seedReportTemplates(prisma);
  } finally {
    await prisma.$disconnect();
  }
}

main().catch((err) => {
  // eslint-disable-next-line no-console
  console.error('[seed] fatal:', err);
  process.exit(1);
});
