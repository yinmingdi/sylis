import {
  Injectable,
  NotFoundException,
  ForbiddenException,
  BadRequestException,
  Logger,
} from '@nestjs/common';
import { MessageRole } from '@prisma/client';
import { Response } from 'express';

import { ChatRepository } from './chat.repository';
import { GetMessagesReqDto } from './dto/chat-message.dto';
import {
  CreateSessionReqDto,
  UpdateSessionReqDto,
  GetSessionsReqDto,
} from './dto/chat-session.dto';
import { StreamChatReqDto } from './dto/stream-chat.dto';
import { AIService } from '../ai/ai.service';

@Injectable()
export class ChatService {
  private readonly logger = new Logger(ChatService.name);

  constructor(
    private readonly chatRepository: ChatRepository,
    private readonly aiService: AIService,
  ) {}

  // ==================== 会话管理 ====================

  /**
   * 创建会话
   */
  async createSession(userId: string, dto: CreateSessionReqDto) {
    const session = await this.chatRepository.createSession(
      userId,
      dto.title,
      dto.configId,
    );
    return session;
  }

  /**
   * 获取用户会话列表
   */
  async getUserSessions(userId: string, query: GetSessionsReqDto) {
    const { includeArchived = false, limit = 50, offset = 0 } = query;

    const { sessions, total } = await this.chatRepository.getUserSessions(
      userId,
      includeArchived,
      limit,
      offset,
    );

    return {
      sessions: sessions.map((session) => ({
        id: session.id,
        userId: session.userId,
        title: session.title,
        configId: session.configId,
        isArchived: session.isArchived,
        messageCount: session._count?.messages || 0,
        createdAt: session.createdAt,
        updatedAt: session.updatedAt,
      })),
      total,
    };
  }

  /**
   * 获取会话详情（含消息）
   */
  async getSessionDetail(userId: string, sessionId: string) {
    const session = await this.chatRepository.getSessionWithMessages(sessionId);

    if (!session) {
      throw new NotFoundException('会话不存在');
    }

    if (session.userId !== userId) {
      throw new ForbiddenException('无权访问此会话');
    }

    return session;
  }

  /**
   * 更新会话
   */
  async updateSession(
    userId: string,
    sessionId: string,
    dto: UpdateSessionReqDto,
  ) {
    const session = await this.chatRepository.getSessionById(sessionId);

    if (!session) {
      throw new NotFoundException('会话不存在');
    }

    if (session.userId !== userId) {
      throw new ForbiddenException('无权修改此会话');
    }

    const updated = await this.chatRepository.updateSession(sessionId, {
      title: dto.title,
      isArchived: dto.isArchived,
    });

    return updated;
  }

  /**
   * 归档会话
   */
  async archiveSession(userId: string, sessionId: string) {
    return await this.updateSession(userId, sessionId, { isArchived: true });
  }

  /**
   * 删除会话
   */
  async deleteSession(userId: string, sessionId: string) {
    const session = await this.chatRepository.getSessionById(sessionId);

    if (!session) {
      throw new NotFoundException('会话不存在');
    }

    if (session.userId !== userId) {
      throw new ForbiddenException('无权删除此会话');
    }

    await this.chatRepository.deleteSession(sessionId);
    return { message: '会话已删除' };
  }

  // ==================== 消息管理 ====================

  /**
   * 发送消息（普通非流式）
   */
  async sendMessage(
    userId: string,
    sessionId: string,
    content: string,
    role: MessageRole = MessageRole.user,
    quotedMessageId?: string,
  ) {
    // 验证会话权限
    const session = await this.chatRepository.getSessionById(sessionId);
    if (!session) {
      throw new NotFoundException('会话不存在');
    }
    if (session.userId !== userId) {
      throw new ForbiddenException('无权访问此会话');
    }

    // 保存消息
    const message = await this.chatRepository.createMessage(
      sessionId,
      role,
      content,
      quotedMessageId,
    );

    return message;
  }

  /**
   * 获取会话消息列表
   */
  async getSessionMessages(
    userId: string,
    sessionId: string,
    query: GetMessagesReqDto,
  ) {
    // 验证会话权限
    const session = await this.chatRepository.getSessionById(sessionId);
    if (!session) {
      throw new NotFoundException('会话不存在');
    }
    if (session.userId !== userId) {
      throw new ForbiddenException('无权访问此会话');
    }

    const { limit = 100, offset = 0 } = query;
    return await this.chatRepository.getMessagesBySession(
      sessionId,
      limit,
      offset,
    );
  }

  // ==================== AI流式聊天 ====================

  /**
   * 流式聊天（SSE）
   */
  async streamChat(userId: string, dto: StreamChatReqDto, res: Response) {
    try {
      // 1. 创建或获取会话
      const { session, sessionId } = await this.getOrCreateSession(
        userId,
        dto,
        res,
      );

      // 2. 获取配置
      const config = await this.getSessionConfig(session, dto.configId);

      // 3. 发送开始事件并保存用户消息
      this.sendSSEEvent(res, 'start', { sessionId });
      const { lastMessage, userMessageId } = await this.saveUserMessage(
        dto.messages,
        sessionId!,
      );

      // 4. 构建AI请求消息
      const needGenerateTitle = !session.title;
      const aiMessages = this.buildAIMessages(
        dto.messages,
        config.systemPrompt,
        needGenerateTitle,
      );

      // 5. 调用AI并处理流式响应
      const { fullContent, extractedTitle } = await this.handleAIStream(
        aiMessages,
        config,
        res,
        needGenerateTitle,
      );

      // 6. 处理标题生成
      await this.titleGeneration(
        needGenerateTitle,
        extractedTitle,
        lastMessage,
        sessionId!,
        res,
      );

      // 7. 保存AI消息并发送完成事件
      const assistantMessageId = await this.saveAssistantMessage(
        sessionId!,
        fullContent,
        userMessageId,
      );

      this.sendSSEEvent(res, 'complete', {
        content: fullContent,
        sessionId,
        userMessageId,
        assistantMessageId,
      });

      res.end();
    } catch (error) {
      // 发送错误事件
      const errorMessage = error instanceof Error ? error.message : '未知错误';
      this.sendSSEEvent(res, 'error', { error: errorMessage });
      res.end();
    }
  }

  /**
   * 创建或获取会话
   */
  private async getOrCreateSession(
    userId: string,
    dto: StreamChatReqDto,
    res: Response,
  ) {
    let sessionId = dto.sessionId;
    let session;

    if (dto.createSession) {
      session = await this.createSession(userId, {
        configId: dto.configId,
      });
      sessionId = session.id;

      this.sendSSEEvent(res, 'session', {
        sessionId: session.id,
        title: session.title,
      });
    } else if (sessionId) {
      session = await this.chatRepository.getSessionById(sessionId);
      if (!session) {
        throw new NotFoundException('会话不存在');
      }
      if (session.userId !== userId) {
        throw new ForbiddenException('无权访问此会话');
      }
    } else {
      throw new BadRequestException('必须提供sessionId或createSession');
    }

    return { session, sessionId };
  }

  /**
   * 获取会话配置
   */
  private async getSessionConfig(session: any, configId?: string) {
    let systemPrompt: string | undefined;
    let aiModel: string | undefined;
    let temperature: number | undefined;

    if (session.configId || configId) {
      const config = await this.chatRepository.getConfigById(
        session.configId || configId!,
      );
      if (config) {
        systemPrompt = config.systemPrompt || undefined;
        aiModel = config.aiModel || undefined;
        temperature = config.temperature || undefined;
      }
    }

    return { systemPrompt, aiModel, temperature };
  }

  /**
   * 保存用户消息
   */
  private async saveUserMessage(messages: any[], sessionId: string) {
    const lastMessage = messages[messages.length - 1];
    let userMessageId: string | undefined;

    if (lastMessage && lastMessage.role === MessageRole.user && sessionId) {
      const userMessage = await this.chatRepository.createMessage(
        sessionId,
        MessageRole.user,
        lastMessage.content,
      );
      userMessageId = userMessage.id;
    }

    return { lastMessage, userMessageId };
  }

  /**
   * 构建AI请求消息
   */
  private buildAIMessages(
    messages: any[],
    systemPrompt?: string,
    needGenerateTitle = false,
  ) {
    const aiMessages: any[] = [];

    // 添加系统提示词
    let finalSystemPrompt = systemPrompt || '';

    // 如果需要生成标题，在系统提示中添加指令
    if (needGenerateTitle) {
      finalSystemPrompt += `\n\n【重要】这是新对话的第一条消息，请在回复的最开始用以下格式提供一个简洁的对话标题：
[TITLE]标题内容（10-20个字符）[/TITLE]

然后再正常回复用户的问题。例如：
[TITLE]学习英语语法[/TITLE]
当然，我很乐意帮助你学习英语语法...`;
    }

    if (finalSystemPrompt) {
      aiMessages.push({
        role: 'system',
        content: finalSystemPrompt,
      });
    }

    // 添加对话历史
    for (const msg of messages) {
      aiMessages.push({
        role: msg.role === MessageRole.teacher ? 'assistant' : msg.role,
        content: msg.content,
      });
    }

    return aiMessages;
  }

  /**
   * 处理AI流式响应
   */
  private async handleAIStream(
    aiMessages: any[],
    config: { aiModel?: string; temperature?: number },
    res: Response,
    needGenerateTitle: boolean,
  ) {
    const client = this.aiService.getClient();
    const model = config.aiModel || this.aiService.getModel();

    const stream = await client.chat.completions.create({
      model,
      messages: aiMessages,
      stream: true,
      temperature: config.temperature || 0.7,
      max_tokens: 2000,
    });

    let fullContent = '';
    let contentBuffer = '';
    let extractedTitle: string | undefined;
    let titleExtracted = false;

    for await (const chunk of stream) {
      const delta = chunk.choices[0]?.delta;

      // 处理普通内容
      if (delta?.content) {
        fullContent += delta.content;
        contentBuffer += delta.content;

        // 如果需要生成标题且还没提取过标题
        if (needGenerateTitle && !titleExtracted) {
          // 尝试提取标题
          const titleMatch = contentBuffer.match(/\[TITLE\](.*?)\[\/TITLE\]/s);
          if (titleMatch) {
            extractedTitle = titleMatch[1].trim();
            // 移除标题标记，只保留实际内容
            contentBuffer = contentBuffer.replace(
              /\[TITLE\].*?\[\/TITLE\]\s*/s,
              '',
            );
            titleExtracted = true;

            // 发送去除标题标记后的内容
            if (contentBuffer) {
              this.sendSSEEvent(res, 'chunk', { content: contentBuffer });
            }
            contentBuffer = '';
          } else if (contentBuffer.length > 200) {
            // 如果超过200字符还没有标题标记，说明AI没有按格式返回，直接发送内容
            titleExtracted = true;
            this.sendSSEEvent(res, 'chunk', { content: contentBuffer });
            contentBuffer = '';
          }
        } else {
          // 不需要提取标题或已提取，直接发送
          if (!needGenerateTitle || titleExtracted) {
            this.sendSSEEvent(res, 'chunk', { content: delta.content });
          }
        }
      }
    }

    // 发送剩余内容
    if (contentBuffer && titleExtracted) {
      this.sendSSEEvent(res, 'chunk', { content: contentBuffer });
    }

    // 清理 fullContent 中的标题标记
    let cleanContent = fullContent;
    if (needGenerateTitle && extractedTitle) {
      cleanContent = fullContent
        .replace(/\[TITLE\].*?\[\/TITLE\]\s*/s, '')
        .trim();
    }

    return { fullContent: cleanContent, extractedTitle };
  }

  /**
   * 处理标题生成
   */
  private async titleGeneration(
    needGenerateTitle: boolean,
    extractedTitle: string | undefined,
    lastMessage: any,
    sessionId: string,
    res: Response,
  ) {
    if (!needGenerateTitle) {
      if (extractedTitle) {
        this.logger.debug(
          `AI返回了标题 "${extractedTitle}"，但会话已有标题，跳过更新`,
        );
      }
      return;
    }

    let finalTitle = extractedTitle;

    // 如果AI没有返回标题，使用降级方案
    if (!finalTitle) {
      finalTitle = this.generateTitleFromMessage(lastMessage.content);
      this.logger.warn(
        `AI未返回标题，使用降级方案: "${finalTitle}" for session ${sessionId}`,
      );
    } else {
      this.logger.log(`AI生成标题: "${finalTitle}" for session ${sessionId}`);
    }

    // 更新数据库
    await this.chatRepository.updateSession(sessionId, {
      title: finalTitle,
    });

    // 发送标题事件
    this.sendSSEEvent(res, 'title', {
      sessionId,
      title: finalTitle,
    });
  }

  /**
   * 保存AI消息
   */
  private async saveAssistantMessage(
    sessionId: string,
    content: string,
    userMessageId?: string,
  ) {
    if (!sessionId || !content) {
      return undefined;
    }

    const assistantMessage = await this.chatRepository.createMessage(
      sessionId,
      MessageRole.assistant,
      content,
      userMessageId,
    );

    return assistantMessage.id;
  }

  /**
   * 发送SSE事件
   */
  private sendSSEEvent(
    res: Response,
    type: 'start' | 'chunk' | 'complete' | 'error' | 'session' | 'title',
    data: any,
  ) {
    const event = {
      type,
      data,
    };
    res.write(`data: ${JSON.stringify(event)}\n\n`);
  }

  /**
   * 从用户消息生成标题（不需要额外AI调用）
   * 策略：
   * 1. 移除多余空白字符
   * 2. 截取前20个字符
   * 3. 如果以标点符号结尾则去掉
   */
  private generateTitleFromMessage(message: string): string {
    // 移除前后空白
    let title = message.trim();

    // 移除换行符和多余空格
    title = title.replace(/\s+/g, ' ');

    // 截取前20个字符
    if (title.length > 20) {
      title = title.slice(0, 20);
      // 如果截断位置是单词中间，尝试在最后一个空格处截断
      const lastSpace = title.lastIndexOf(' ');
      if (lastSpace > 10) {
        title = title.slice(0, lastSpace);
      }
    }

    // 移除末尾的标点符号
    title = title.replace(/[。，、；：？！…—,.;:?!\-\s]+$/, '');

    // 如果标题为空，返回默认值
    return title;
  }
}
