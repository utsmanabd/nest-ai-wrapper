import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { ContextModule } from '../context/context.module';
import { LlmModule } from '../llm/llm.module';
import { PromptModule } from '../prompt/prompt.module';
import { ChatController } from './chat.controller';
import { ChatService } from './chat.service';
import { ConversationService } from './conversation.service';
import { ConversationsController } from './conversations.controller';
import { Conversation } from './entities/conversation.entity';
import { Message } from './entities/message.entity';

@Module({
  imports: [
    TypeOrmModule.forFeature([Conversation, Message]),
    LlmModule,
    ContextModule,
    PromptModule,
  ],
  providers: [ChatService, ConversationService],
  controllers: [ChatController, ConversationsController],
})
export class ChatModule {}
