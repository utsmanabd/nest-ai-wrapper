import {
  Body,
  Controller,
  Get,
  Param,
  ParseUUIDPipe,
  Patch,
  Post,
} from '@nestjs/common';
import { PromptService } from '../prompt/prompt.service';
import { ConversationService } from './conversation.service';
import { CreateConversationDto } from './dto/create-conversation.dto';
import { UpdatePromptDto } from './dto/update-prompt.dto';

@Controller('conversations')
export class ConversationsController {
  constructor(
    private readonly conversationService: ConversationService,
    private readonly promptService: PromptService,
  ) {}

  @Get('personas')
  listPersonas() {
    return this.promptService.listPersonas();
  }

  @Post()
  async create(@Body() dto: CreateConversationDto) {
    const conversation = await this.conversationService.create(dto);
    return {
      id: conversation.id,
      title: conversation.title,
      systemPrompt: this.promptService.getConversationPrompt(conversation),
      createdAt: conversation.createdAt,
      updatedAt: conversation.updatedAt,
    };
  }

  @Get()
  async list() {
    return this.conversationService.findAll();
  }

  @Get(':id/messages')
  async messages(@Param('id', ParseUUIDPipe) id: string) {
    const messages = await this.conversationService.getMessages(id);
    return messages.map((m) => ({
      id: m.id,
      role: m.role,
      content: m.content,
      promptTokens: m.promptTokens,
      completionTokens: m.completionTokens,
      latencyMs: m.latencyMs,
      tokensEstimated: m.tokensEstimated,
      createdAt: m.createdAt,
    }));
  }

  @Get(':id')
  async getOne(@Param('id', ParseUUIDPipe) id: string) {
    const conversation = await this.conversationService.findOne(id);
    return {
      id: conversation.id,
      title: conversation.title,
      systemPrompt: this.promptService.getConversationPrompt(conversation),
      createdAt: conversation.createdAt,
      updatedAt: conversation.updatedAt,
    };
  }

  @Patch(':id/prompt')
  async updatePrompt(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: UpdatePromptDto,
  ) {
    const conversation = await this.conversationService.updatePrompt(id, dto);
    return {
      id: conversation.id,
      systemPrompt: this.promptService.getConversationPrompt(conversation),
      updatedAt: conversation.updatedAt,
    };
  }
}
