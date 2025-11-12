import { Module } from '@nestjs/common';

import { ChatConfigService } from './chat-config.service';
import { ChatController } from './chat.controller';
import { ChatRepository } from './chat.repository';
import { ChatService } from './chat.service';
import { AIService } from '../ai/ai.service';
import { PrismaModule } from '../prisma/prisma.module';

@Module({
  imports: [PrismaModule],
  controllers: [ChatController],
  providers: [ChatService, ChatRepository, ChatConfigService, AIService],
  exports: [ChatService, ChatConfigService],
})
export class ChatModule {}
