export const OLLAMA_URL =
  process.env.OLLAMA_URL ?? 'http://localhost:11434/api/chat';

export const MODEL_NAME = process.env.MODEL_NAME ?? 'qwen3.5:9b';

/** Soft budget for messages sent to the model (estimated tokens). */
export const MAX_CONTEXT_TOKENS = Number(
  process.env.MAX_CONTEXT_TOKENS ?? 32768,
);

export const DEFAULT_SYSTEM_PROMPT =
  'Selalu jawab dalam Bahasa Indonesia kecuali user meminta bahasa lain.';

/** Rough chars-per-token estimate when Ollama does not return counts. */
export const CHARS_PER_TOKEN_ESTIMATE = 4;
