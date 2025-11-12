import { Injectable } from '@nestjs/common';
import { MessageRole } from '@prisma/client';

import { PrismaService } from '../prisma/prisma.service';

@Injectable()
export class ChatRepository {
  constructor(private readonly prisma: PrismaService) {}

  // ==================== 会话操作 ====================

  async createSession(userId: string, title?: string, configId?: string) {
    return await this.prisma.chatSession.create({
      data: {
        userId,
        title, // 如果为 undefined，数据库会存储为 null
        configId,
        isArchived: false,
      },
    });
  }

  async getSessionById(sessionId: string) {
    return await this.prisma.chatSession.findUnique({
      where: { id: sessionId },
      include: {
        config: true,
      },
    });
  }

  async getUserSessions(
    userId: string,
    includeArchived = false,
    limit = 50,
    offset = 0,
  ) {
    const where = includeArchived ? { userId } : { userId, isArchived: false };

    const [sessions, total] = await Promise.all([
      this.prisma.chatSession.findMany({
        where,
        include: {
          config: true,
          _count: {
            select: { messages: true },
          },
        },
        orderBy: { updatedAt: 'desc' },
        take: limit,
        skip: offset,
      }),
      this.prisma.chatSession.count({ where }),
    ]);

    return { sessions, total };
  }

  async updateSession(
    sessionId: string,
    data: { title?: string; isArchived?: boolean },
  ) {
    return await this.prisma.chatSession.update({
      where: { id: sessionId },
      data,
    });
  }

  async deleteSession(sessionId: string) {
    // 级联删除会话及其所有消息
    return await this.prisma.chatSession.delete({
      where: { id: sessionId },
    });
  }

  async getSessionWithMessages(sessionId: string, limit = 100, offset = 0) {
    return await this.prisma.chatSession.findUnique({
      where: { id: sessionId },
      include: {
        config: true,
        messages: {
          orderBy: { createdAt: 'asc' },
          take: limit,
          skip: offset,
        },
      },
    });
  }

  // ==================== 消息操作 ====================

  async createMessage(
    sessionId: string,
    role: MessageRole,
    content: string,
    quotedMessageId?: string,
    audioUrl?: string,
    error?: string,
    meta?: any,
  ) {
    return await this.prisma.chatMessage.create({
      data: {
        sessionId,
        role,
        content,
        quotedMessageId,
        audioUrl,
        error,
        meta,
      },
    });
  }

  async getMessagesBySession(sessionId: string, limit = 100, offset = 0) {
    const [messages, total] = await Promise.all([
      this.prisma.chatMessage.findMany({
        where: { sessionId },
        orderBy: { createdAt: 'asc' },
        take: limit,
        skip: offset,
      }),
      this.prisma.chatMessage.count({ where: { sessionId } }),
    ]);

    return { messages, total };
  }

  async deleteMessage(messageId: string) {
    return await this.prisma.chatMessage.delete({
      where: { id: messageId },
    });
  }

  async bulkCreateMessages(
    sessionId: string,
    messages: Array<{
      role: MessageRole;
      content: string;
      quotedMessageId?: string;
    }>,
  ) {
    return await this.prisma.chatMessage.createMany({
      data: messages.map((msg) => ({
        sessionId,
        ...msg,
      })),
    });
  }

  // ==================== 配置操作 ====================

  async createConfig(data: {
    systemPrompt?: string;
    roleName?: string;
    aiModel?: string;
    temperature?: number;
    tags?: string[];
    extraConfig?: any;
  }) {
    return await this.prisma.chatConfig.create({
      data: {
        ...data,
        tags: data.tags || [],
      },
    });
  }

  async getConfigById(configId: string) {
    return await this.prisma.chatConfig.findUnique({
      where: { id: configId },
    });
  }

  async getAllConfigs() {
    return await this.prisma.chatConfig.findMany({
      orderBy: { roleName: 'asc' },
    });
  }

  async updateConfig(
    configId: string,
    data: {
      systemPrompt?: string;
      roleName?: string;
      aiModel?: string;
      temperature?: number;
      tags?: string[];
      extraConfig?: any;
    },
  ) {
    return await this.prisma.chatConfig.update({
      where: { id: configId },
      data,
    });
  }

  async deleteConfig(configId: string) {
    return await this.prisma.chatConfig.delete({
      where: { id: configId },
    });
  }

  // ==================== 工具方法 ====================

  async archiveOldSessions(userId: string, beforeDate: Date) {
    return await this.prisma.chatSession.updateMany({
      where: {
        userId,
        updatedAt: { lt: beforeDate },
        isArchived: false,
      },
      data: { isArchived: true },
    });
  }
}
