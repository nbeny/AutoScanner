import { INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import request from 'supertest';
import argon2 from 'argon2';
import { PrismaService } from '@autoscanner/database';
import { AppModule } from '../src/app/app.module';

describe('Engagements (e2e)', () => {
  let app: INestApplication;
  let prisma: PrismaService;
  let accessToken: string;
  const testEmail = `eng-${Date.now()}@example.test`;
  const testPassword = 'p@ssw0rd-eng';

  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({ imports: [AppModule] }).compile();
    app = moduleRef.createNestApplication();
    await app.init();
    prisma = app.get(PrismaService);

    const passwordHash = await argon2.hash(testPassword, { type: argon2.argon2id });
    await prisma.user.create({ data: { email: testEmail, passwordHash } });
    const login = await request(app.getHttpServer())
      .post('/auth/login')
      .send({ email: testEmail, password: testPassword });
    accessToken = login.body.accessToken;
  });

  afterAll(async () => {
    await prisma.engagement.deleteMany({ where: { clientName: 'Acme' } });
    await prisma.user.deleteMany({ where: { email: testEmail } });
    await app.close();
  });

  it('createEngagement → engagements → engagement(id)', async () => {
    const create = await request(app.getHttpServer())
      .post('/graphql')
      .set('authorization', `Bearer ${accessToken}`)
      .send({
        query: `mutation($input: CreateEngagementInput!) {
          createEngagement(input: $input) { id name clientName status }
        }`,
        variables: { input: { name: 'Recon Q2', clientName: 'Acme' } },
      });
    expect(create.body.errors).toBeUndefined();
    expect(create.body.data.createEngagement.name).toBe('Recon Q2');
    expect(create.body.data.createEngagement.status).toBe('DRAFT');
    const engagementId = create.body.data.createEngagement.id;

    const list = await request(app.getHttpServer())
      .post('/graphql')
      .set('authorization', `Bearer ${accessToken}`)
      .send({ query: '{ engagements { id name clientName } }' });
    expect(list.body.data.engagements.length).toBeGreaterThanOrEqual(1);
    expect(
      list.body.data.engagements.find((e: { id: string }) => e.id === engagementId),
    ).toBeDefined();

    const one = await request(app.getHttpServer())
      .post('/graphql')
      .set('authorization', `Bearer ${accessToken}`)
      .send({
        query: `query($id: ID!) { engagement(id: $id) { id name clientName status } }`,
        variables: { id: engagementId },
      });
    expect(one.body.data.engagement.id).toBe(engagementId);
  });

  it('rejects engagements query without auth', async () => {
    const res = await request(app.getHttpServer())
      .post('/graphql')
      .send({ query: '{ engagements { id } }' });
    expect(res.body.errors?.[0]?.extensions?.code).toBe('UNAUTHENTICATED');
  });
});
