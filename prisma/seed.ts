import 'reflect-metadata';
import { config as loadEnv } from 'dotenv';
loadEnv();

import argon2 from 'argon2';
import { PrismaClient } from '@prisma/client';

async function main(): Promise<void> {
  const email = process.env.OPERATOR_EMAIL;
  const password = process.env.OPERATOR_PASSWORD;
  if (!email || !password) {
    throw new Error('OPERATOR_EMAIL and OPERATOR_PASSWORD must be set in .env');
  }

  const prisma = new PrismaClient();
  try {
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
  } finally {
    await prisma.$disconnect();
  }
}

main().catch((err) => {
  // eslint-disable-next-line no-console
  console.error('[seed] fatal:', err);
  process.exit(1);
});
