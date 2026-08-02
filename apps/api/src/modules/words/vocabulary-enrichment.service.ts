import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';

import { enrichVocabularyWord } from './vocabulary-enrichment';
import { AIService } from '../ai/ai.service';
import { PrismaService } from '../prisma/prisma.service';
import { DistributedLockService } from '../redis/distributed-lock.service';
import { RedisService } from '../redis/redis.service';

@Injectable()
export class VocabularyEnrichmentService {
  private readonly logger = new Logger(VocabularyEnrichmentService.name);
  private readonly enabled: boolean;

  constructor(
    configService: ConfigService,
    private readonly prisma: PrismaService,
    private readonly aiService: AIService,
    private readonly locks: DistributedLockService,
    private readonly redis: RedisService,
  ) {
    this.enabled =
      configService.get<string>('AI_ENRICHMENT_ENABLED') === 'true';
  }

  async enrichOnDemand(wordId: string, userId: string) {
    if (!this.enabled) return false;

    try {
      const rateKey = `vocabulary-enrichment:rate:${userId}`;
      const requests = await this.redis.getClient().incr(rateKey);
      if (requests === 1) await this.redis.getClient().expire(rateKey, 60);
      if (requests > 10) return false;

      const task = this.locks.withLock(
        `vocabulary-enrichment:${wordId}`,
        () =>
          enrichVocabularyWord(
            this.prisma,
            this.aiService.getClient(),
            this.aiService.getModel(),
            wordId,
          ),
        { expireSeconds: 120, timeoutMs: 200, retryIntervalMs: 50 },
      );
      const result = await Promise.race([
        task,
        new Promise<undefined>((resolve) =>
          setTimeout(() => resolve(undefined), 8_000),
        ),
      ]);
      return result?.success === true;
    } catch (error) {
      this.logger.warn(
        `On-demand vocabulary enrichment failed for ${wordId}: ${
          error instanceof Error ? error.message : 'unknown error'
        }`,
      );
      return false;
    }
  }
}
