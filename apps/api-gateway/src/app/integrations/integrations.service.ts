import { Inject, Injectable } from '@nestjs/common';
import { type IntegrationCredential } from '@prisma/client';
import { SecretBox, ValidationError } from '@autoscanner/common';
import { PrismaService } from '@autoscanner/database';

import { SECRET_BOX } from './secret-box.provider';
import type { CreateIntegrationCredentialInput } from './dto/integration.dto';

@Injectable()
export class IntegrationsService {
  constructor(
    private readonly prisma: PrismaService,
    @Inject(SECRET_BOX) private readonly secretBox: SecretBox,
  ) {}

  async createCredential(
    userId: string,
    input: CreateIntegrationCredentialInput,
  ): Promise<IntegrationCredential> {
    let parsed: unknown;
    try {
      parsed = JSON.parse(input.config);
    } catch {
      throw new ValidationError('config must be valid JSON');
    }
    const configEncrypted = this.secretBox.seal(JSON.stringify(parsed));

    // One credential per (user, provider): upsert so re-configuring replaces the secret.
    return this.prisma.integrationCredential.upsert({
      where: { userId_provider: { userId, provider: input.provider } },
      create: {
        userId,
        provider: input.provider,
        name: input.name,
        configEncrypted,
        enabled: true,
      },
      update: { name: input.name, configEncrypted, enabled: true, deletedAt: null },
    });
  }

  listCredentials(userId: string): Promise<IntegrationCredential[]> {
    return this.prisma.integrationCredential.findMany({
      where: { userId, deletedAt: null },
      orderBy: { createdAt: 'desc' },
    });
  }
}
