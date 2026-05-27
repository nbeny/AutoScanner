import 'reflect-metadata';
import { config as loadEnv } from 'dotenv';
loadEnv();

import argon2 from 'argon2';
import { Prisma, PrismaClient } from '@prisma/client';
import { BUILTIN_TEMPLATES } from '@autoscanner/templates';

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
  } finally {
    await prisma.$disconnect();
  }
}

main().catch((err) => {
  // eslint-disable-next-line no-console
  console.error('[seed] fatal:', err);
  process.exit(1);
});
