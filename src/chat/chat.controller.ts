import {
  Body,
  Controller,
  Post,
  Query,
  RequestMethod,
  Sse,
} from '@nestjs/common';
import { Observable } from 'rxjs';
import { ChatService } from './chat.service';
import { ChatRequestDto } from './dto/chat-request.dto';

@Controller('chat')
export class ChatController {
  constructor(private readonly chatService: ChatService) {}

  @Post()
  async chat(@Body() dto: ChatRequestDto) {
    const conversation = await this.chatService.getOrCreateConversation(
      dto.conversationId,
      {
        personaId: dto.personaId,
        systemPrompt: dto.systemPrompt,
      },
    );
    const result = await this.chatService.sendMessage(
      conversation.id,
      dto.message,
    );

    return {
      conversationId: conversation.id,
      reply: result.reply,
      usage: result.usage,
      context: result.context,
    };
  }

  /** Legacy/simple clients: SSE via query params (GET). */
  @Sse('stream')
  async streamChat(
    @Query('message') message: string,
    @Query('conversationId') conversationId?: string,
    @Query('personaId') personaId?: string,
    @Query('systemPrompt') systemPrompt?: string,
  ): Promise<Observable<MessageEvent>> {
    return this.openStream({
      message,
      conversationId,
      personaId,
      systemPrompt,
    });
  }

  /** Preferred: SSE via JSON body (POST). */
  @Sse('stream', { method: RequestMethod.POST })
  async streamChatPost(
    @Body() dto: ChatRequestDto,
  ): Promise<Observable<MessageEvent>> {
    return this.openStream(dto);
  }

  private async openStream(dto: {
    message: string;
    conversationId?: string;
    personaId?: string;
    systemPrompt?: string;
  }): Promise<Observable<MessageEvent>> {
    const conversation = await this.chatService.getOrCreateConversation(
      dto.conversationId,
      {
        personaId: dto.personaId,
        systemPrompt: dto.systemPrompt,
      },
    );
    return this.chatService.streamMessage(conversation.id, dto.message);
  }
}
