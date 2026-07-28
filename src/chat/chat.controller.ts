import { Body, Controller, Post, Query, Sse } from '@nestjs/common';
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

  @Sse('stream')
  async streamChat(
    @Query('message') message: string,
    @Query('conversationId') conversationId?: string,
  ): Promise<Observable<MessageEvent>> {
    const conversation =
      await this.chatService.getOrCreateConversation(conversationId);
    return this.chatService.streamMessage(conversation.id, message);
  }
}
