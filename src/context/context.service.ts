import { Injectable } from '@nestjs/common';
import { MAX_CONTEXT_TOKENS } from '../common/constants';
import {
  ContextBuildResult,
  LlmMessage,
} from '../common/types/llm.types';
import { applySlidingWindow } from './strategies/sliding-window.strategy';

@Injectable()
export class ContextService {
  build(
    messages: LlmMessage[],
    maxTokens: number = MAX_CONTEXT_TOKENS,
  ): ContextBuildResult {
    return applySlidingWindow(messages, maxTokens);
  }
}
