import { Injectable, Logger } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { MoreThan, Repository } from 'typeorm';
import {
  CHARS_PER_TOKEN_ESTIMATE,
  MAX_CONTEXT_TOKENS,
  SUMMARY_KEEP_RECENT_MESSAGES,
  SUMMARY_MESSAGE_THRESHOLD,
} from '../common/constants';
import { LlmService } from '../llm/llm.service';
import { Conversation } from '../chat/entities/conversation.entity';
import { Message } from '../chat/entities/message.entity';

export interface SummarizeResult {
  summary: string;
  summarizedUntil: string;
  messageCount: number;
}

@Injectable()
export class MemoryService {
  private readonly logger = new Logger(MemoryService.name);

  constructor(
    @InjectRepository(Conversation)
    private readonly conversationRepo: Repository<Conversation>,
    @InjectRepository(Message)
    private readonly messageRepo: Repository<Message>,
    private readonly llmService: LlmService,
  ) {}

  /**
   * Estimate total tokens from messages (rough chars/4 estimate).
   */
  private estimateTokens(messages: Message[]): number {
    return Math.ceil(
      messages.reduce((sum, m) => sum + m.content.length, 0)
        / CHARS_PER_TOKEN_ESTIMATE,
    );
  }

  /**
   * Check if a conversation should be summarized.
   * Trigger when:
   * - First summary: message count exceeds threshold
   * - Progressive summary: estimated tokens > 80% of context window budget
   */
  async shouldSummarize(conversation: Conversation): Promise<boolean> {
    const msgCount = conversation.messageCount || 0;

    // First summary: trigger on message count
    if (!conversation.summary || !conversation.summarizedUntil) {
      if (msgCount >= SUMMARY_MESSAGE_THRESHOLD) {
        return true;
      }
      return false;
    }

    // Progressive summary: trigger on token budget
    if (msgCount > 0) {
      const estimatedTokens = await this.estimateTokensFromConversation(conversation);
      const tokenThreshold = MAX_CONTEXT_TOKENS * 0.8; // 80% of budget
      if (estimatedTokens >= tokenThreshold) {
        return true;
      }
    }

    return false;
  }

  /**
   * Estimate total tokens from stored message token data.
   * Uses actual token counts if available, falls back to chars/4.
   */
  private async estimateTokensFromConversation(conversation: Conversation): Promise<number> {
    const msgCount = conversation.messageCount || 0;
    if (msgCount === 0) {
      return 0;
    }

    const messages = await this.messageRepo.find({ where: { conversationId: conversation.id } });

    // Check if all messages have actual token data
    const hasActualTokens = messages.some(
      m => m.promptTokens !== null && m.completionTokens !== null,
    );

    if (hasActualTokens) {
      // Use actual token counts where available
      let total = 0;
      for (const m of messages) {
        if (m.promptTokens !== null && m.completionTokens !== null) {
          total += m.promptTokens + m.completionTokens;
        } else {
          total += Math.ceil(m.content.length / CHARS_PER_TOKEN_ESTIMATE);
        }
      }
      return total;
    }

    // All messages lack token data — use the estimate helper
    return this.estimateTokens(messages);
  }

  /**
   * Summarize messages with progressive summarization support.
   * - First summary: summarize all messages up to (but not including) the last N messages.
   * - Progressive summary: merge existing summary with new messages.
   * Stores summary in Conversation and updates summarizedUntil pointer.
   */
  async summarize(
    conversationId: string,
    keepRecent: number = SUMMARY_KEEP_RECENT_MESSAGES,
  ): Promise<SummarizeResult> {
    const conversation = await this.conversationRepo.findOne({
      where: { id: conversationId },
    });

    if (!conversation) {
      throw new Error(`Conversation ${conversationId} not found`);
    }

    const allMessages = await this.messageRepo.find({
      where: { conversationId },
      order: { createdAt: 'ASC' },
    });

    if (allMessages.length <= keepRecent) {
      throw new Error(
        `Not enough messages to summarize. Have ${allMessages.length}, keeping ${keepRecent}.`,
      );
    }

    // Separate messages: summarize-able (old) vs keep (recent)
    const summarizeable = allMessages.slice(0, -keepRecent);
    const recent = allMessages.slice(-keepRecent);

    if (summarizeable.length === 0) {
      throw new Error('No messages to summarize.');
    }

    // Build summary prompt — different for first vs progressive
    const summaryPrompt = this.buildSummaryPrompt(
      summarizeable,
      conversation.summary,
    );

    // Call LLM to generate summary
    const { content: summary } = await this.llmService.chat([
      { role: 'user', content: summaryPrompt },
    ]);

    if (!summary || summary.trim().length === 0) {
      throw new Error('LLM returned empty summary.');
    }

    // Find the last summarized message ID
    const lastSummarized = summarizeable[summarizeable.length - 1];

    // Update conversation
    await this.conversationRepo.update(conversationId, {
      summary: summary.trim(),
      summarizedUntil: lastSummarized.id,
    });

    const isProgressive = !!conversation.summary;
    this.logger.log(
      `${isProgressive ? 'Progressive' : 'First'} summarized ${summarizeable.length} messages for conversation ${conversationId}`,
    );

    return {
      summary: summary.trim(),
      summarizedUntil: lastSummarized.id,
      messageCount: summarizeable.length,
    };
  }

  /**
   * Fire-and-forget summarization (non-blocking).
   * Used after sendMessage when threshold is reached.
   */
  async maybeSummarize(
    conversationId: string,
  ): Promise<void> {
    try {
      const conversation = await this.conversationRepo.findOne({
        where: { id: conversationId },
      });

      if (!conversation) {
        return;
      }

      if (await this.shouldSummarize(conversation)) {
        await this.summarize(conversationId);
      }
    } catch (err) {
      this.logger.warn(
        `Auto-summarize failed for conversation ${conversationId}: ${
          err instanceof Error ? err.message : String(err)
        }`,
      );
    }
  }

  /**
   * Build the prompt for summarization.
   * - First summary: summarize all messages from scratch.
   * - Progressive summary: merge existing summary with new messages.
   */
  private buildSummaryPrompt(
    messages: Message[],
    existingSummary: string | null,
  ): string {
    const conversationText = messages
      .map((m) => `${m.role}: ${m.content}`)
      .join('\n\n');

    if (!existingSummary) {
      // First summary — summarize from scratch
      return [
        'Summarize the following conversation. Focus on:',
        '1. Important facts discussed',
        '2. Decisions or conclusions reached',
        '3. User preferences or instructions',
        '4. Unresolved topics',
        '',
        'Discard filler, greetings, and trivial exchanges.',
        'Respond in the same language as the conversation.',
        'Maximum 150 words.',
        '',
        '=== CONVERSATION ===',
        conversationText,
      ].join('\n');
    }

    // Progressive summary — merge existing summary with new messages
    return [
      'You have an existing summary of a previous conversation:',
      '',
      '=== EXISTING SUMMARY ===',
      existingSummary,
      '',
      '=== NEW MESSAGES ===',
      conversationText,
      '',
      'Merge the existing summary with the new messages. Update the summary to include:',
      '1. Any new important facts or decisions',
      '2. Changes to user preferences or instructions',
      '3. Progress on unresolved topics',
      '4. Keep the existing summary accurate and concise',
      '',
      'Discard filler, greetings, and trivial exchanges.',
      'Respond in the same language as the conversation.',
      'Maximum 150 words.',
      '',
      '=== MERGED SUMMARY ===',
    ].join('\n');
  }

  /**
   * Get the context messages for building the LLM prompt.
   * Returns: [summary (as system note)] + [recent messages not yet summarized]
   * 
   * Progressive summarization flow:
   * - No summary: return all messages (normal flow)
   * - Has summary: return summary + all messages after summarizedUntil pointer
   * - The sliding window context builder handles any overflow
   */
  async getRecentMessages(
    conversationId: string,
    keepCount: number = SUMMARY_KEEP_RECENT_MESSAGES,
  ): Promise<Message[]> {
    const conversation = await this.conversationRepo.findOne({
      where: { id: conversationId },
    });

    if (!conversation) {
      return [];
    }

    // If no summary yet, return all messages (normal flow)
    if (!conversation.summarizedUntil) {
      return this.messageRepo.find({
        where: { conversationId },
        order: { createdAt: 'ASC' },
      });
    }

    // Find the timestamp of the last summarized message
    const summarizedMessage = await this.messageRepo.findOne({
      where: { id: conversation.summarizedUntil },
    });

    if (!summarizedMessage) {
      // Fallback: return all messages if pointer is invalid
      return this.messageRepo.find({
        where: { conversationId },
        order: { createdAt: 'ASC' },
      });
    }

    // Return ALL messages created after the summary pointer.
    // The summary already handles old messages, so no limit is needed here.
    // The context builder (sliding window) will handle any overflow.
    return this.messageRepo.find({
      where: {
        conversationId,
        createdAt: MoreThan(summarizedMessage.createdAt),
      },
      order: { createdAt: 'ASC' },
    });
  }
}
