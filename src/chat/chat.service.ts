import { Injectable, NotFoundException } from '@nestjs/common';
import { Observable } from 'rxjs';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import {
  ContextBuildResult,
  LlmMessage,
  LlmUsage,
} from '../common/types/llm.types';
import { ContextService } from '../context/context.service';
import { LlmService } from '../llm/llm.service';
import { PromptService } from '../prompt/prompt.service';
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

export interface GetOrCreateOptions {
  personaId?: string;
  systemPrompt?: string;
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
    private readonly promptService: PromptService,
  ) {}

  async getOrCreateConversation(
    conversationId?: string,
    options: GetOrCreateOptions = {},
  ): Promise<Conversation> {
    if (conversationId) {
      const existing = await this.conversationRepo.findOne({
        where: { id: conversationId },
      });
      if (!existing) {
        throw new NotFoundException(`Conversation ${conversationId} not found`);
      }
      return existing;
    }

    const resolved = this.promptService.resolvePromptText({
      systemPrompt: options.systemPrompt,
      personaId: options.personaId,
    });
    const defaultPrompt = this.promptService.resolvePromptText({});
    const shouldStoreNull =
      resolved === defaultPrompt &&
      !options.systemPrompt &&
      !options.personaId;

    return this.conversationRepo.save(
      this.conversationRepo.create({
        systemPrompt: shouldStoreNull ? null : resolved,
      }),
    );
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
    const conversation = await this.requireConversation(conversationId);
    const isFirstUserMessage = await this.isFirstUserMessage(conversationId);

    await this.messageRepo.save(
      this.messageRepo.create({
        conversationId,
        role: 'user',
        content: userMessage,
      }),
    );

    const { llmMessages, context } = await this.buildModelMessages(
      conversation,
    );

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

    await this.touchConversation(conversation);

    if (isFirstUserMessage) {
      void this.promptService.maybeSetTitle(conversationId, userMessage);
    }

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
          const conversation = await this.requireConversation(conversationId);
          const isFirstUserMessage =
            await this.isFirstUserMessage(conversationId);

          await this.messageRepo.save(
            this.messageRepo.create({
              conversationId,
              role: 'user',
              content: userMessage,
            }),
          );

          if (isFirstUserMessage) {
            void this.promptService.maybeSetTitle(conversationId, userMessage);
          }

          const { llmMessages, context } = await this.buildModelMessages(
            conversation,
          );

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
                  .then(async () => {
                    await this.touchConversation(conversation);
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

  private async requireConversation(id: string): Promise<Conversation> {
    const conversation = await this.conversationRepo.findOne({
      where: { id },
    });
    if (!conversation) {
      throw new NotFoundException(`Conversation ${id} not found`);
    }
    return conversation;
  }

  private async isFirstUserMessage(conversationId: string): Promise<boolean> {
    const count = await this.messageRepo.count({
      where: { conversationId, role: 'user' },
    });
    return count === 0;
  }

  private async touchConversation(conversation: Conversation): Promise<void> {
    conversation.updatedAt = new Date();
    await this.conversationRepo.save(conversation);
  }

  private async buildModelMessages(conversation: Conversation): Promise<{
    llmMessages: LlmMessage[];
    context: ContextBuildResult;
  }> {
    const historyRows = await this.getHistory(conversation.id);
    const messages: LlmMessage[] = historyRows
      .filter((m) => m.role !== 'system')
      .map((m) => ({
        role: m.role,
        content: m.content,
      }));

    messages.unshift({
      role: 'system',
      content: this.promptService.getConversationPrompt(conversation),
    });

    const context = this.contextService.build(messages);
    return { llmMessages: context.messages, context };
  }
}
