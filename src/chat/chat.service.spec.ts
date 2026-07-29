import { Test, TestingModule } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import { ContextService } from '../context/context.service';
import { LlmService } from '../llm/llm.service';
import { PromptService } from '../prompt/prompt.service';
import { ChatService } from './chat.service';
import { Conversation } from './entities/conversation.entity';
import { Message } from './entities/message.entity';

describe('ChatService', () => {
  let service: ChatService;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        ChatService,
        {
          provide: getRepositoryToken(Conversation),
          useValue: {},
        },
        {
          provide: getRepositoryToken(Message),
          useValue: {},
        },
        {
          provide: LlmService,
          useValue: {},
        },
        {
          provide: ContextService,
          useValue: {},
        },
        {
          provide: PromptService,
          useValue: {
            resolvePromptText: jest.fn(),
            getConversationPrompt: jest.fn(),
            maybeSetTitle: jest.fn(),
          },
        },
      ],
    }).compile();

    service = module.get<ChatService>(ChatService);
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });
});
