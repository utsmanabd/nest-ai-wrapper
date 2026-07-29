import { BadRequestException, Injectable, Logger } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { DEFAULT_SYSTEM_PROMPT } from '../common/constants';
import { LlmService } from '../llm/llm.service';
import { Conversation } from '../chat/entities/conversation.entity';
import { getPersona, listPersonas, Persona } from './personas';

export interface ResolvePromptInput {
  systemPrompt?: string | null;
  personaId?: string | null;
}

@Injectable()
export class PromptService {
  private readonly logger = new Logger(PromptService.name);

  constructor(
    @InjectRepository(Conversation)
    private readonly conversationRepo: Repository<Conversation>,
    private readonly llmService: LlmService,
  ) {}

  listPersonas(): Persona[] {
    return listPersonas();
  }

  /**
   * Resolve the effective system prompt text to store or use.
   * Priority: explicit systemPrompt > personaId > default.
   */
  resolvePromptText(input: ResolvePromptInput = {}): string {
    const trimmed = input.systemPrompt?.trim();
    if (trimmed) {
      return trimmed;
    }

    if (input.personaId) {
      const persona = getPersona(input.personaId);
      if (!persona) {
        throw new BadRequestException(
          `Unknown personaId: ${input.personaId}. Valid: ${listPersonas()
            .map((p) => p.id)
            .join(', ')}`,
        );
      }
      return persona.systemPrompt;
    }

    return DEFAULT_SYSTEM_PROMPT;
  }

  /** Effective prompt for an existing conversation (null column → default). */
  getConversationPrompt(conversation: Conversation): string {
    const trimmed = conversation.systemPrompt?.trim();
    return trimmed || DEFAULT_SYSTEM_PROMPT;
  }

  /**
   * Fire-and-forget safe: generate a short title from the first user message
   * only when the conversation still has no title.
   */
  async maybeSetTitle(
    conversationId: string,
    firstUserMessage: string,
  ): Promise<void> {
    try {
      const conversation = await this.conversationRepo.findOne({
        where: { id: conversationId },
      });
      if (!conversation || conversation.title) {
        return;
      }

      const title = await this.generateTitle(firstUserMessage);
      if (!title) {
        return;
      }

      // Re-check to avoid overwriting if another request already set a title
      const latest = await this.conversationRepo.findOne({
        where: { id: conversationId },
      });
      if (!latest || latest.title) {
        return;
      }

      latest.title = title;
      await this.conversationRepo.save(latest);
    } catch (err) {
      this.logger.warn(
        `Auto-title failed for conversation ${conversationId}: ${
          err instanceof Error ? err.message : String(err)
        }`,
      );
    }
  }

  private async generateTitle(userMessage: string): Promise<string | null> {
    const { content } = await this.llmService.chat([
      {
        role: 'system',
        content:
          'Buat judul singkat maksimal 6 kata untuk percakapan berdasarkan pesan user. Jawab HANYA dengan judulnya, tanpa tanda kutip, tanpa penjelasan.',
      },
      {
        role: 'user',
        content: userMessage.slice(0, 500),
      },
    ]);

    const cleaned = content
      .replace(/^["'\s]+|["'\s]+$/g, '')
      .replace(/\s+/g, ' ')
      .trim();

    if (!cleaned) {
      return null;
    }

    // Soft cap length for DB/UI friendliness
    return cleaned.length > 80 ? `${cleaned.slice(0, 77)}...` : cleaned;
  }
}
