import { Inject, Injectable } from '@nestjs/common';
import { SecretBox } from '@autoscanner/common';
import { PrismaService } from '@autoscanner/database';

import { ApiCredentialInfo, ApiProvider } from './dto/api-credential.dto';
import { SECRET_BOX } from './secret-box.provider';

@Injectable()
export class ApiCredentialsService {
  constructor(
    private readonly prisma: PrismaService,
    @Inject(SECRET_BOX) private readonly box: SecretBox,
  ) {}

  async set(userId: string, provider: ApiProvider, secret: string): Promise<boolean> {
    const ciphertext = this.box.seal(secret);
    await this.prisma.apiCredential.upsert({
      where: { ownerId_provider: { ownerId: userId, provider } },
      create: { ownerId: userId, provider, ciphertext },
      // ownerId is redundant given the compound where, but makes the
      // owner-scoping explicit/defensive on this security-sensitive path.
      update: { ciphertext, ownerId: userId },
    });
    return true;
  }

  async list(userId: string): Promise<ApiCredentialInfo[]> {
    return this.prisma.apiCredential.findMany({
      where: { ownerId: userId },
      select: { provider: true, createdAt: true, updatedAt: true },
    });
  }

  async delete(userId: string, provider: ApiProvider): Promise<boolean> {
    const result = await this.prisma.apiCredential.deleteMany({
      where: { ownerId: userId, provider },
    });
    return result.count > 0;
  }
}
