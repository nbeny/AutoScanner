import { Injectable, OnModuleInit } from '@nestjs/common';
import { Registry, collectDefaultMetrics } from 'prom-client';

@Injectable()
export class MetricsService implements OnModuleInit {
  readonly registry = new Registry();

  onModuleInit(): void {
    this.registry.setDefaultLabels({ app: 'api-gateway' });
    collectDefaultMetrics({ register: this.registry });
  }
}
