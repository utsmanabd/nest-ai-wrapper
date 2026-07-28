export type LlmRole = 'system' | 'user' | 'assistant' | 'tool';

export interface LlmMessage {
  role: LlmRole;
  content: string;
}

export interface LlmUsage {
  promptTokens: number;
  completionTokens: number;
  latencyMs: number;
  /** True when token counts were estimated (chars/4), not from the provider. */
  estimated: boolean;
}

export interface LlmChatResult {
  content: string;
  usage: LlmUsage;
}

export interface LlmStreamChunk {
  token: string;
  done: boolean;
  usage?: LlmUsage;
}

export interface ContextBuildResult {
  messages: LlmMessage[];
  droppedMessageCount: number;
  estimatedTokens: number;
}
