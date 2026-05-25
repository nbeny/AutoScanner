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

  describe('GraphQL me with bearer', () => {
    let accessToken: string;

    beforeAll(async () => {
      const res = await request(app.getHttpServer())
        .post('/auth/login')
        .send({ email: testEmail, password: testPassword });
      accessToken = res.body.accessToken;
    });

    it('returns the current user when bearer is valid', async () => {
      const res = await request(app.getHttpServer())
        .post('/graphql')
        .set('authorization', `Bearer ${accessToken}`)
        .send({ query: '{ me { id email displayName } }' });
      expect(res.status).toBe(200);
      expect(res.body.errors).toBeUndefined();
      expect(res.body.data.me).not.toBeNull();
      expect(res.body.data.me.email).toBe(testEmail);
      expect(res.body.data.me.displayName).toBe('E2E User');
    });

    it('returns errors when bearer is missing', async () => {
      const res = await request(app.getHttpServer())
        .post('/graphql')
        .send({ query: '{ me { id email } }' });
      expect(res.body.errors?.[0]?.extensions?.code).toBe('UNAUTHENTICATED');
    });

    it('returns errors when bearer is invalid', async () => {
      const res = await request(app.getHttpServer())
        .post('/graphql')
        .set('authorization', 'Bearer not-a-real-token')
        .send({ query: '{ me { id email } }' });
      expect(res.body.errors?.[0]?.extensions?.code).toBe('UNAUTHENTICATED');
    });
  });

  describe('POST /auth/refresh', () => {
    let loginPayload: { accessToken: string; refreshToken: string };

    beforeEach(async () => {
      const res = await request(app.getHttpServer())
        .post('/auth/login')
        .send({ email: testEmail, password: testPassword });
      loginPayload = res.body;
    });

    it('returns new tokens and rotates (old refresh becomes invalid)', async () => {
      const res = await request(app.getHttpServer())
        .post('/auth/refresh')
        .send({ refreshToken: loginPayload.refreshToken });
      expect(res.status).toBe(200);
      expect(res.body.accessToken).toMatch(/^eyJ/);
      expect(res.body.refreshToken).toMatch(/^[a-f0-9]{64}$/);
      expect(res.body.refreshToken).not.toBe(loginPayload.refreshToken);

      const replay = await request(app.getHttpServer())
        .post('/auth/refresh')
        .send({ refreshToken: loginPayload.refreshToken });
      expect(replay.status).toBe(401);
    });

    it('rejects an unknown refresh token with 401', async () => {
      const res = await request(app.getHttpServer())
        .post('/auth/refresh')
        .send({ refreshToken: 'f'.repeat(64) });
      expect(res.status).toBe(401);
    });

    it('rejects a malformed refresh token with 400', async () => {
      const res = await request(app.getHttpServer())
        .post('/auth/refresh')
        .send({ refreshToken: 'bad' });
      expect(res.status).toBe(400);
    });
  });

  describe('POST /auth/logout', () => {
    it('revokes the current session (subsequent access token rejected)', async () => {
      const login = await request(app.getHttpServer())
        .post('/auth/login')
        .send({ email: testEmail, password: testPassword });
      const { accessToken, refreshToken } = login.body;

      const logoutRes = await request(app.getHttpServer())
        .post('/auth/logout')
        .set('authorization', `Bearer ${accessToken}`)
        .send();
      expect(logoutRes.status).toBe(204);

      const meRes = await request(app.getHttpServer())
        .post('/graphql')
        .set('authorization', `Bearer ${accessToken}`)
        .send({ query: '{ me { id } }' });
      expect(meRes.body.errors?.[0]?.extensions?.code).toBe('UNAUTHENTICATED');

      const refreshRes = await request(app.getHttpServer())
        .post('/auth/refresh')
        .send({ refreshToken });
      expect(refreshRes.status).toBe(401);
    });

    it('returns 401 if no bearer is provided', async () => {
      const res = await request(app.getHttpServer()).post('/auth/logout').send();
      expect(res.status).toBe(401);
    });
  });
});
