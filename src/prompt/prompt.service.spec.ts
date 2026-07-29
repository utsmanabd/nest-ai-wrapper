import { BadRequestException } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import { DEFAULT_SYSTEM_PROMPT } from '../common/constants';
import { Conversation } from '../chat/entities/conversation.entity';
import { LlmService } from '../llm/llm.service';
import { PromptService } from './prompt.service';

describe('PromptService', () => {
  let service: PromptService;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        PromptService,
        {
          provide: getRepositoryToken(Conversation),
          useValue: {
            findOne: jest.fn(),
            save: jest.fn(),
          },
        },
        {
          provide: LlmService,
          useValue: {
            chat: jest.fn(),
          },
        },
      ],
    }).compile();

    service = module.get(PromptService);
  });

  it('returns default when no input', () => {
    expect(service.resolvePromptText({})).toBe(DEFAULT_SYSTEM_PROMPT);
  });

  it('prefers explicit systemPrompt over persona', () => {
    const custom = 'Custom persona prompt';
    expect(
      service.resolvePromptText({
        systemPrompt: custom,
        personaId: 'code-tutor',
      }),
    ).toBe(custom);
  });

  it('resolves known persona', () => {
    const prompt = service.resolvePromptText({ personaId: 'code-tutor' });
    expect(prompt).toContain('tutor coding');
  });

  it('rejects unknown persona', () => {
    expect(() =>
      service.resolvePromptText({ personaId: 'alien' }),
    ).toThrow(BadRequestException);
  });

  it('getConversationPrompt falls back to default when null', () => {
    expect(
      service.getConversationPrompt({
        systemPrompt: null,
      } as Conversation),
    ).toBe(DEFAULT_SYSTEM_PROMPT);
  });
});
