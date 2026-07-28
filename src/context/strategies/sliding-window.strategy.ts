import { estimateMessagesTokens, estimateTextTokens } from '../../common/token.util';
import {
  ContextBuildResult,
  LlmMessage,
} from '../../common/types/llm.types';

/**
 * Keep all system messages, then fill the remaining budget with the
 * most recent non-system messages (newest first, restored to chronological order).
 * System messages are never dropped. The latest non-system message is always kept
 * even if it alone exceeds the budget (so the request stays useful).
 */
export function applySlidingWindow(
  messages: LlmMessage[],
  maxTokens: number,
): ContextBuildResult {
  const systemMessages = messages.filter((m) => m.role === 'system');
  const otherMessages = messages.filter((m) => m.role !== 'system');

  const systemTokens = estimateMessagesTokens(systemMessages);
  const selected: LlmMessage[] = [];
  let usedTokens = systemTokens;

  for (let i = otherMessages.length - 1; i >= 0; i -= 1) {
    const candidate = otherMessages[i];
    const candidateTokens = estimateTextTokens(candidate.content);
    const wouldExceed = usedTokens + candidateTokens > maxTokens;

    if (wouldExceed && selected.length > 0) {
      break;
    }

    selected.unshift(candidate);
    usedTokens += candidateTokens;
  }

  const resultMessages = [...systemMessages, ...selected];

  return {
    messages: resultMessages,
    droppedMessageCount: otherMessages.length - selected.length,
    estimatedTokens: usedTokens,
  };
}
