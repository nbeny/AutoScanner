import { Injectable } from '@nestjs/common';
import { AppConfigService } from '@autoscanner/config';

import type {
  AnnotationRequest,
  FindingBatchRequest,
  FindingBatchResponse,
  TriageRequest,
} from './dto';

/**
 * HTTP client to finding-service. Failures throw, so a caller's job fails and is re-driven
 * through the Kafka retry topic — the same semantics the in-process persister had.
 */
@Injectable()
export class FindingClient {
  constructor(private readonly cfg: AppConfigService) {}

  async batch(req: FindingBatchRequest): Promise<FindingBatchResponse> {
    return this.post<FindingBatchResponse>('/internal/findings/batch', req);
  }

  async correlate(engagementId: string): Promise<{ clusters: number }> {
    return this.post<{ clusters: number }>('/internal/findings/correlate', { engagementId });
  }

  async dedup(engagementId: string): Promise<{ merged: number }> {
    return this.post<{ merged: number }>('/internal/findings/dedup', { engagementId });
  }

  async setStatus(req: TriageRequest): Promise<{ id: string; status: string }> {
    return this.post<{ id: string; status: string }>('/internal/findings/status', req);
  }

  async annotate(req: AnnotationRequest): Promise<{ id: string }> {
    return this.post<{ id: string }>('/internal/findings/annotate', req);
  }

  private async post<T>(path: string, body: unknown): Promise<T> {
    const res = await fetch(`${this.cfg.env.FINDING_SERVICE_URL}${path}`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(body),
    });
    if (!res.ok) {
      const text = await res.text().catch(() => '');
      throw new Error(`finding-service ${res.status} on ${path}: ${text.slice(0, 200)}`);
    }
    return (await res.json()) as T;
  }
}
