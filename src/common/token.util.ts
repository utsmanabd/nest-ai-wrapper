import { CHARS_PER_TOKEN_ESTIMATE } from './constants';
import { LlmMessage } from './types/llm.types';

export function estimateTextTokens(text: string): number {
  if (!text) return 0;
  return Math.ceil(text.length / CHARS_PER_TOKEN_ESTIMATE);
}

export function estimateMessagesTokens(messages: LlmMessage[]): number {
  return messages.reduce(
    (sum, message) => sum + estimateTextTokens(message.content),
    0,
  );
}
