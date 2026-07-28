import { Injectable } from '@nestjs/common';
import axios from 'axios';
import { Observable } from 'rxjs';
import { MODEL_NAME, OLLAMA_URL } from '../common/constants';
import { estimateTextTokens } from '../common/token.util';
import {
  LlmChatResult,
  LlmMessage,
  LlmStreamChunk,
  LlmUsage,
} from '../common/types/llm.types';

interface OllamaChatResponse {
  message?: { content?: string };
  done?: boolean;
  prompt_eval_count?: number;
  eval_count?: number;
  total_duration?: number;
}

@Injectable()
export class LlmService {
  private readonly url = OLLAMA_URL;
  private readonly model = MODEL_NAME;

  async chat(messages: LlmMessage[]): Promise<LlmChatResult> {
    const startedAt = Date.now();
    const response = await axios.post<OllamaChatResponse>(this.url, {
      model: this.model,
      messages,
      stream: false,
      think: false,
    });

    const latencyMs = Date.now() - startedAt;
    const content = response.data.message?.content ?? '';
    const usage = this.toUsage(response.data, content, messages, latencyMs);

    return { content, usage };
  }

  streamChat(messages: LlmMessage[]): Observable<LlmStreamChunk> {
    return new Observable((subscriber) => {
      const startedAt = Date.now();
      let fullResponse = '';

      (async () => {
        try {
          const response = await axios({
            method: 'post',
            url: this.url,
            data: {
              model: this.model,
              messages,
              stream: true,
              think: false,
            },
            responseType: 'stream',
          });

          response.data.on('data', (chunk: Buffer) => {
            const lines = chunk.toString().split('\n').filter(Boolean);
            for (const line of lines) {
              try {
                const parsed = JSON.parse(line) as OllamaChatResponse;
                const token = parsed.message?.content || '';
                fullResponse += token;

                if (parsed.done) {
                  const latencyMs = Date.now() - startedAt;
                  const usage = this.toUsage(
                    parsed,
                    fullResponse,
                    messages,
                    latencyMs,
                  );
                  subscriber.next({ token, done: true, usage });
                  subscriber.complete();
                } else {
                  subscriber.next({ token, done: false });
                }
              } catch {
                // skip partial/invalid JSON line
              }
            }
          });

          response.data.on('error', (err: Error) => subscriber.error(err));
        } catch (err) {
          subscriber.error(err);
        }
      })();
    });
  }

  private toUsage(
    data: OllamaChatResponse,
    completionContent: string,
    promptMessages: LlmMessage[],
    latencyMs: number,
  ): LlmUsage {
    const hasProviderCounts =
      typeof data.prompt_eval_count === 'number' &&
      typeof data.eval_count === 'number';

    if (hasProviderCounts) {
      return {
        promptTokens: data.prompt_eval_count as number,
        completionTokens: data.eval_count as number,
        latencyMs:
          typeof data.total_duration === 'number'
            ? Math.round(data.total_duration / 1_000_000)
            : latencyMs,
        estimated: false,
      };
    }

    return {
      promptTokens: promptMessages.reduce(
        (sum, message) => sum + estimateTextTokens(message.content),
        0,
      ),
      completionTokens: estimateTextTokens(completionContent),
      latencyMs,
      estimated: true,
    };
  }
}
