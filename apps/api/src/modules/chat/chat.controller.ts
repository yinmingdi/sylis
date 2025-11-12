import {
  Controller,
  Post,
  Get,
  Patch,
  Delete,
  Body,
  Query,
  Param,
  Req,
  Res,
} from '@nestjs/common';
import { ApiTags, ApiOperation, ApiResponse } from '@nestjs/swagger';
import { Request, Response } from 'express';

import { ChatConfigService } from './chat-config.service';
import { ChatService } from './chat.service';
import {
  CreateConfigReqDto,
  UpdateConfigReqDto,
  GetConfigsResDto,
  ChatConfigDto,
} from './dto/chat-config.dto';
import {
  SendMessageReqDto,
  SendMessageResDto,
  GetMessagesReqDto,
  GetMessagesResDto,
} from './dto/chat-message.dto';
import {
  CreateSessionReqDto,
  CreateSessionResDto,
  UpdateSessionReqDto,
  UpdateSessionResDto,
  GetSessionsReqDto,
  GetSessionsResDto,
} from './dto/chat-session.dto';
import { StreamChatReqDto } from './dto/stream-chat.dto';
@ApiTags('AI聊天')
@Controller('chat')
export class ChatController {
  constructor(
    private readonly chatService: ChatService,
    private readonly chatConfigService: ChatConfigService,
  ) {}

  // ==================== 会话管理 ====================

  @Post('sessions')
  @ApiOperation({ summary: '创建会话' })
  @ApiResponse({ type: CreateSessionResDto })
  async createSession(
    @Body() dto: CreateSessionReqDto,
    @Req() req: Request,
  ): Promise<CreateSessionResDto> {
    const session = await this.chatService.createSession(req.user!.id, dto);
    return {
      ...session,
      title: session.title ?? undefined,
      configId: session.configId ?? undefined,
    };
  }

  @Get('sessions')
  @ApiOperation({ summary: '获取会话列表' })
  @ApiResponse({ type: GetSessionsResDto })
  async getUserSessions(
    @Query() query: GetSessionsReqDto,
    @Req() req: Request,
  ): Promise<GetSessionsResDto> {
    const result = await this.chatService.getUserSessions(req.user!.id, query);
    return {
      sessions: result.sessions.map((s) => ({
        ...s,
        title: s.title ?? undefined,
        configId: s.configId ?? undefined,
      })),
      total: result.total,
    };
  }

  @Get('sessions/:id')
  @ApiOperation({ summary: '获取会话详情' })
  async getSessionDetail(@Param('id') id: string, @Req() req: Request) {
    return await this.chatService.getSessionDetail(req.user!.id, id);
  }

  @Patch('sessions/:id')
  @ApiOperation({ summary: '更新会话' })
  @ApiResponse({ type: UpdateSessionResDto })
  async updateSession(
    @Param('id') id: string,
    @Body() dto: UpdateSessionReqDto,
    @Req() req: Request,
  ): Promise<UpdateSessionResDto> {
    const session = await this.chatService.updateSession(req.user!.id, id, dto);
    return {
      ...session,
      title: session.title ?? undefined,
    };
  }

  @Post('sessions/:id/archive')
  @ApiOperation({ summary: '归档会话' })
  async archiveSession(@Param('id') id: string, @Req() req: Request) {
    return await this.chatService.archiveSession(req.user!.id, id);
  }

  @Delete('sessions/:id')
  @ApiOperation({ summary: '删除会话' })
  async deleteSession(@Param('id') id: string, @Req() req: Request) {
    return await this.chatService.deleteSession(req.user!.id, id);
  }

  // ==================== 消息管理 ====================

  @Get('sessions/:id/messages')
  @ApiOperation({ summary: '获取会话消息' })
  @ApiResponse({ type: GetMessagesResDto })
  async getSessionMessages(
    @Param('id') id: string,
    @Query() query: GetMessagesReqDto,
    @Req() req: Request,
  ): Promise<GetMessagesResDto> {
    const result = await this.chatService.getSessionMessages(
      req.user!.id,
      id,
      query,
    );
    return {
      messages: result.messages.map((m) => ({
        ...m,
        audioUrl: m.audioUrl ?? undefined,
        error: m.error ?? undefined,
        quotedMessageId: m.quotedMessageId ?? undefined,
        meta: m.meta ?? undefined,
      })),
      total: result.total,
    };
  }

  @Post('sessions/:id/messages')
  @ApiOperation({ summary: '发送消息（普通）' })
  @ApiResponse({ type: SendMessageResDto })
  async sendMessage(
    @Param('id') id: string,
    @Body() dto: SendMessageReqDto,
    @Req() req: Request,
  ): Promise<SendMessageResDto> {
    const message = await this.chatService.sendMessage(
      req.user!.id,
      id,
      dto.content,
      dto.role,
      dto.quotedMessageId,
    );
    return {
      ...message,
      audioUrl: message.audioUrl ?? undefined,
      error: message.error ?? undefined,
      quotedMessageId: message.quotedMessageId ?? undefined,
      meta: message.meta ?? undefined,
    };
  }

  // ==================== AI流式聊天 ====================

  @Post('stream')
  @ApiOperation({ summary: '流式聊天（SSE）' })
  async streamChat(
    @Body() dto: StreamChatReqDto,
    @Req() req: Request,
    @Res() res: Response,
  ) {
    // 设置SSE响应头
    res.setHeader('Content-Type', 'text/event-stream');
    res.setHeader('Cache-Control', 'no-cache');
    res.setHeader('Connection', 'keep-alive');
    res.setHeader('X-Accel-Buffering', 'no'); // 禁用nginx缓冲

    return await this.chatService.streamChat(req.user!.id, dto, res);
  }

  // ==================== 配置管理 ====================

  @Get('configs')
  @ApiOperation({ summary: '获取所有配置（预设+自定义）' })
  @ApiResponse({ type: GetConfigsResDto })
  async getAllConfigs(): Promise<GetConfigsResDto> {
    const result = await this.chatConfigService.getAllConfigs();
    return {
      configs: result.configs.map((c) => ({
        ...c,
        systemPrompt: c.systemPrompt ?? undefined,
        roleName: c.roleName ?? undefined,
        aiModel: c.aiModel ?? undefined,
        temperature: c.temperature ?? undefined,
        extraConfig: c.extraConfig ?? undefined,
      })),
      presets: result.presets.map((c) => ({
        ...c,
        systemPrompt: c.systemPrompt ?? undefined,
        roleName: c.roleName ?? undefined,
        aiModel: c.aiModel ?? undefined,
        temperature: c.temperature ?? undefined,
        extraConfig: c.extraConfig ?? undefined,
      })),
    };
  }

  @Get('configs/presets')
  @ApiOperation({ summary: '获取预设配置' })
  @ApiResponse({ type: [ChatConfigDto] })
  async getPresetConfigs() {
    return await this.chatConfigService.getPresetConfigs();
  }

  @Post('configs')
  @ApiOperation({ summary: '创建自定义配置' })
  @ApiResponse({ type: ChatConfigDto })
  async createConfig(@Body() dto: CreateConfigReqDto) {
    return await this.chatConfigService.createCustomConfig(dto);
  }

  @Patch('configs/:id')
  @ApiOperation({ summary: '更新配置' })
  @ApiResponse({ type: ChatConfigDto })
  async updateConfig(@Param('id') id: string, @Body() dto: UpdateConfigReqDto) {
    return await this.chatConfigService.updateConfig(id, dto);
  }

  @Delete('configs/:id')
  @ApiOperation({ summary: '删除配置' })
  async deleteConfig(@Param('id') id: string) {
    return await this.chatConfigService.deleteConfig(id);
  }

  @Get('configs/:id')
  @ApiOperation({ summary: '获取配置详情' })
  @ApiResponse({ type: ChatConfigDto })
  async getConfigById(@Param('id') id: string) {
    return await this.chatConfigService.getConfigById(id);
  }
}
