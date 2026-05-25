import { INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import request from 'supertest';
import { AppModule } from '../src/app/app.module';

describe('GraphQL (e2e)', () => {
  let app: INestApplication;

  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({ imports: [AppModule] }).compile();
    app = moduleRef.createNestApplication();
    await app.init();
  });

  afterAll(async () => {
    await app.close();
  });

  it('exposes /graphql and answers a version query', async () => {
    const res = await request(app.getHttpServer()).post('/graphql').send({ query: '{ version }' });
    expect(res.status).toBe(200);
    expect(res.body.data.version).toMatch(/^autoscanner-api-gateway@/);
  });
});
