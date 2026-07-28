import { Injectable } from '@nestjs/common';
import { Observable } from 'rxjs';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { DEFAULT_SYSTEM_PROMPT } from '../common/constants';
import {
  ContextBuildResult,
  LlmMessage,
  LlmUsage,
} from '../common/types/llm.types';
import { ContextService } from '../context/context.service';
import { LlmService } from '../llm/llm.service';
import { Conversation } from './entities/conversation.entity';
import { Message } from './entities/message.entity';

export interface ChatSendResult {
  reply: string;
  usage: LlmUsage;
  context: {
    droppedMessageCount: number;
    estimatedTokens: number;
    messageCount: number;
  };
}

@Injectable()
export class ChatService {
  constructor(
    @InjectRepository(Conversation)
    private conversationRepo: Repository<Conversation>,
    @InjectRepository(Message)
    private messageRepo: Repository<Message>,
    private readonly llmService: LlmService,
    private readonly contextService: ContextService,
  ) {}

  async getOrCreateConversation(
    conversationId?: string,
  ): Promise<Conversation> {
    if (conversationId) {
      const existing = await this.conversationRepo.findOne({
        where: { id: conversationId },
      });
      if (existing) return existing;
    }
    return this.conversationRepo.save(this.conversationRepo.create());
  }

  async getHistory(conversationId: string): Promise<Message[]> {
    return this.messageRepo.find({
      where: { conversationId },
      order: { createdAt: 'ASC' },
    });
  }

  async sendMessage(
    conversationId: string,
    userMessage: string,
  ): Promise<ChatSendResult> {
    await this.messageRepo.save(
      this.messageRepo.create({
        conversationId,
        role: 'user',
        content: userMessage,
      }),
    );

    const { llmMessages, context } =
      await this.buildModelMessages(conversationId);

    const { content, usage } = await this.llmService.chat(llmMessages);

    await this.messageRepo.save(
      this.messageRepo.create({
        conversationId,
        role: 'assistant',
        content,
        promptTokens: usage.promptTokens,
        completionTokens: usage.completionTokens,
        latencyMs: usage.latencyMs,
        tokensEstimated: usage.estimated,
      }),
    );

    return {
      reply: content,
      usage,
      context: {
        droppedMessageCount: context.droppedMessageCount,
        estimatedTokens: context.estimatedTokens,
        messageCount: context.messages.length,
      },
    };
  }

  streamMessage(
    conversationId: string,
    userMessage: string,
  ): Observable<MessageEvent> {
    return new Observable((subscriber) => {
      (async () => {
        try {
          await this.messageRepo.save(
            this.messageRepo.create({
              conversationId,
              role: 'user',
              content: userMessage,
            }),
          );

          const { llmMessages, context } =
            await this.buildModelMessages(conversationId);

          let fullResponse = '';

          this.llmService.streamChat(llmMessages).subscribe({
            next: (chunk) => {
              fullResponse += chunk.token;

              if (chunk.done) {
                const usage = chunk.usage;
                this.messageRepo
                  .save(
                    this.messageRepo.create({
                      conversationId,
                      role: 'assistant',
                      content: fullResponse,
                      promptTokens: usage?.promptTokens ?? null,
                      completionTokens: usage?.completionTokens ?? null,
                      latencyMs: usage?.latencyMs ?? null,
                      tokensEstimated: usage?.estimated ?? null,
                    }),
                  )
                  .then(() => {
                    subscriber.next({
                      data: {
                        token: chunk.token,
                        done: true,
                        usage: usage ?? null,
                        context: {
                          droppedMessageCount: context.droppedMessageCount,
                          estimatedTokens: context.estimatedTokens,
                          messageCount: context.messages.length,
                        },
                      },
                    } as MessageEvent);
                    subscriber.complete();
                  })
                  .catch((err: Error) => subscriber.error(err));
              } else {
                subscriber.next({
                  data: { token: chunk.token, done: false },
                } as MessageEvent);
              }
            },
            error: (err: Error) => subscriber.error(err),
          });
        } catch (err) {
          subscriber.error(err);
        }
      })();
    });
  }

  private async buildModelMessages(conversationId: string): Promise<{
    llmMessages: LlmMessage[];
    context: ContextBuildResult;
  }> {
    const historyRows = await this.getHistory(conversationId);
    const messages: LlmMessage[] = historyRows.map((m) => ({
      role: m.role,
      content: m.content,
    }));

    if (!messages.some((m) => m.role === 'system')) {
      messages.unshift({
        role: 'system',
        content: DEFAULT_SYSTEM_PROMPT,
      });
    }

    const context = this.contextService.build(messages);
    return { llmMessages: context.messages, context };
  }
}
