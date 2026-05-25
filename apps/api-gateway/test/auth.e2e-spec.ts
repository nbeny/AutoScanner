import { INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import request from 'supertest';
import argon2 from 'argon2';
import { PrismaService } from '@autoscanner/database';
import { AppModule } from '../src/app/app.module';

describe('Auth (e2e)', () => {
  let app: INestApplication;
  let prisma: PrismaService;
  const testEmail = `e2e-${Date.now()}@example.test`;
  const testPassword = 'correct-horse-battery-staple';

  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({ imports: [AppModule] }).compile();
    app = moduleRef.createNestApplication();
    await app.init();
    prisma = app.get(PrismaService);

    const passwordHash = await argon2.hash(testPassword, { type: argon2.argon2id });
    await prisma.user.create({
      data: { email: testEmail, passwordHash, displayName: 'E2E User' },
    });
  });

  afterAll(async () => {
    await prisma.user.deleteMany({ where: { email: testEmail } });
    await app.close();
  });

  describe('POST /auth/login', () => {
    it('returns access + refresh tokens for valid creds', async () => {
      const res = await request(app.getHttpServer())
        .post('/auth/login')
        .send({ email: testEmail, password: testPassword });
      expect(res.status).toBe(200);
      expect(res.body.accessToken).toMatch(/^eyJ/);
      expect(res.body.refreshToken).toMatch(/^[a-f0-9]{64}$/);
      expect(res.body.expiresIn).toBeGreaterThan(0);
    });

    it('rejects wrong password with 401', async () => {
      const res = await request(app.getHttpServer())
        .post('/auth/login')
        .send({ email: testEmail, password: 'wrong' });
      expect(res.status).toBe(401);
    });

    it('rejects unknown user with 401 (same error to prevent enum)', async () => {
      const res = await request(app.getHttpServer())
        .post('/auth/login')
        .send({ email: 'noone@example.test', password: 'any' });
      expect(res.status).toBe(401);
    });

    it('rejects malformed body with 400', async () => {
      const res = await request(app.getHttpServer())
        .post('/auth/login')
        .send({ email: 'not-an-email', password: '' });
      expect(res.status).toBe(400);
    });
  });
});
