import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import OpenAI from 'openai';

import { createAIClient } from './ai-client';
import { TestConnectionReqDto, TestConnectionResDto } from './dto/test.dto';

@Injectable()
export class AIService {
  private readonly logger = new Logger(AIService.name);
  private readonly client: OpenAI;
  private readonly model: string;

  constructor(configService: ConfigService) {
    this.model = configService.getOrThrow<string>('AI_MODEL');
    this.client = createAIClient({
      apiKey: configService.getOrThrow<string>('AI_API_KEY'),
      baseURL: configService.getOrThrow<string>('AI_BASE_URL'),
      model: this.model,
    });
  }

  getClient() {
    return this.client;
  }

  getModel() {
    return this.model;
  }

  getConfig() {
    return {
      model: this.model,
      hasApiKey: true,
    };
  }

  async testConnection(
    params: TestConnectionReqDto,
  ): Promise<TestConnectionResDto> {
    const startTime = Date.now();
    const testMessage = params.testMessage || 'Hello, this is a test message.';

    try {
      this.logger.log('Testing AI provider connection...');

      // 测试简单的聊天完成
      const response = await this.client.chat.completions.create({
        model: this.model,
        messages: [
          {
            role: 'user',
            content: testMessage,
          },
        ],
        max_tokens: 50,
        temperature: 0.1,
      });

      const responseTime = Date.now() - startTime;
      const testResponse = response.choices[0]?.message?.content || '';

      this.logger.log(
        `AI provider connection test successful in ${responseTime}ms`,
      );

      return {
        success: true,
        status: 'connected',
        responseTime,
        testResponse,
        model: this.model,
        hasApiKey: true,
      };
    } catch {
      const responseTime = Date.now() - startTime;
      this.logger.error(`AI connection test failed after ${responseTime}ms`);

      return {
        success: false,
        status: 'failed',
        responseTime,
        error: 'AI provider connection failed',
        model: this.model,
        hasApiKey: true,
      };
    }
  }
}
