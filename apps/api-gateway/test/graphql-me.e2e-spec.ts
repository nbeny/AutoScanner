import { INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import request from 'supertest';
import { AppModule } from '../src/app/app.module';

describe('GraphQL me query (e2e)', () => {
  let app: INestApplication;

  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({ imports: [AppModule] }).compile();
    app = moduleRef.createNestApplication();
    await app.init();
  });

  afterAll(async () => {
    await app.close();
  });

  it('me returns UNAUTHENTICATED when no bearer is provided', async () => {
    const res = await request(app.getHttpServer())
      .post('/graphql')
      .send({ query: '{ me { id email } }' });
    expect(res.status).toBe(200);
    expect(res.body.errors).toBeDefined();
    expect(res.body.errors[0].extensions.code).toBe('UNAUTHENTICATED');
  });

  it('introspection exposes User type', async () => {
    const res = await request(app.getHttpServer())
      .post('/graphql')
      .send({ query: '{ __type(name: "User") { name fields { name } } }' });
    expect(res.body.data.__type.name).toBe('User');
    const names = res.body.data.__type.fields.map((f: { name: string }) => f.name);
    expect(names).toEqual(
      expect.arrayContaining([
        'id',
        'email',
        'displayName',
        'isActive',
        'totpEnabled',
        'createdAt',
      ]),
    );
  });
});
