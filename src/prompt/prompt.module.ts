import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { Conversation } from '../chat/entities/conversation.entity';
import { LlmModule } from '../llm/llm.module';
import { PromptService } from './prompt.service';

@Module({
  imports: [TypeOrmModule.forFeature([Conversation]), LlmModule],
  providers: [PromptService],
  exports: [PromptService],
})
export class PromptModule {}
