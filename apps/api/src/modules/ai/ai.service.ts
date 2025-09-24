import { Injectable, Logger } from '@nestjs/common';
import OpenAI from 'openai';

import { TestConnectionReqDto, TestConnectionResDto } from './dto/test.dto';

@Injectable()
export class AIService {
  private readonly AI_CONFIG = {
    apiKey: process.env.AI_KEY || '',
    baseURL: process.env.AI_URL || '',
    model: process.env.AI_MODEL || 'gpt-3.5-turbo',
  };
  private readonly logger = new Logger(AIService.name);
  private readonly client = new OpenAI({
    apiKey: this.AI_CONFIG.apiKey,
    baseURL: this.AI_CONFIG.baseURL,
  });

  getClient() {
    return this.client;
  }

  getModel() {
    return this.AI_CONFIG.model;
  }

  getConfig() {
    return {
      model: this.AI_CONFIG.model,
      baseUrl: this.AI_CONFIG.baseURL,
      hasApiKey: !!this.AI_CONFIG.apiKey,
    };
  }

  async testConnection(
    params: TestConnectionReqDto,
  ): Promise<TestConnectionResDto> {
    const startTime = Date.now();
    const testMessage = params.testMessage || 'Hello, this is a test message.';

    try {
      this.logger.log('Testing OpenAI connection...');

      // 测试简单的聊天完成
      const response = await this.client.chat.completions.create({
        model: this.AI_CONFIG.model,
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

      this.logger.log(`OpenAI connection test successful in ${responseTime}ms`);

      return {
        success: true,
        status: 'connected',
        responseTime,
        testResponse,
        model: this.AI_CONFIG.model,
        baseUrl: this.AI_CONFIG.baseURL,
        hasApiKey: !!this.AI_CONFIG.apiKey,
      };
    } catch (error) {
      const responseTime = Date.now() - startTime;
      const errorMessage = error instanceof Error ? error.message : '未知错误';

      this.logger.error(`OpenAI connection test failed: ${errorMessage}`);

      return {
        success: false,
        status: 'failed',
        responseTime,
        error: errorMessage,
        model: this.AI_CONFIG.model,
        baseUrl: this.AI_CONFIG.baseURL,
        hasApiKey: !!this.AI_CONFIG.apiKey,
      };
    }
  }
}
