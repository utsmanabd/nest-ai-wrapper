import {
  Injectable,
  NotFoundException,
  BadRequestException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { PromptService } from '../prompt/prompt.service';
import { Conversation } from './entities/conversation.entity';
import { Message } from './entities/message.entity';
import { CreateConversationDto } from './dto/create-conversation.dto';
import { UpdatePromptDto } from './dto/update-prompt.dto';

@Injectable()
export class ConversationService {
  constructor(
    @InjectRepository(Conversation)
    private readonly conversationRepo: Repository<Conversation>,
    @InjectRepository(Message)
    private readonly messageRepo: Repository<Message>,
    private readonly promptService: PromptService,
  ) {}

  async create(dto: CreateConversationDto = {}): Promise<Conversation> {
    const systemPrompt = this.promptService.resolvePromptText({
      systemPrompt: dto.systemPrompt,
      personaId: dto.personaId,
    });

    // Store null when using the global default so defaults can evolve later
    const isDefault =
      systemPrompt === this.promptService.resolvePromptText({});

    return this.conversationRepo.save(
      this.conversationRepo.create({
        title: dto.title?.trim() || null,
        systemPrompt: isDefault && !dto.systemPrompt && !dto.personaId
          ? null
          : systemPrompt,
      }),
    );
  }

  async findAll(): Promise<
    Pick<Conversation, 'id' | 'title' | 'updatedAt' | 'createdAt'>[]
  > {
    return this.conversationRepo.find({
      select: {
        id: true,
        title: true,
        updatedAt: true,
        createdAt: true,
      },
      order: { updatedAt: 'DESC' },
    });
  }

  async findOne(id: string): Promise<Conversation> {
    const conversation = await this.conversationRepo.findOne({
      where: { id },
    });
    if (!conversation) {
      throw new NotFoundException(`Conversation ${id} not found`);
    }
    return conversation;
  }

  async getMessages(id: string): Promise<Message[]> {
    await this.findOne(id);
    return this.messageRepo.find({
      where: { conversationId: id },
      order: { createdAt: 'ASC' },
    });
  }

  async updatePrompt(
    id: string,
    dto: UpdatePromptDto,
  ): Promise<Conversation> {
    if (!dto.personaId && dto.systemPrompt === undefined) {
      throw new BadRequestException(
        'Provide personaId and/or systemPrompt',
      );
    }

    const conversation = await this.findOne(id);
    conversation.systemPrompt = this.promptService.resolvePromptText({
      systemPrompt: dto.systemPrompt,
      personaId: dto.personaId,
    });
    return this.conversationRepo.save(conversation);
  }
}
