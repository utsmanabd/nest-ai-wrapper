import { applySlidingWindow } from './sliding-window.strategy';
import { LlmMessage } from '../../common/types/llm.types';

describe('applySlidingWindow', () => {
  const system: LlmMessage = {
    role: 'system',
    content: 'You are a helpful assistant.',
  };

  it('keeps the system prompt even when budget is tight', () => {
    const messages: LlmMessage[] = [
      system,
      { role: 'user', content: 'a'.repeat(100) },
      { role: 'assistant', content: 'b'.repeat(100) },
      { role: 'user', content: 'latest question' },
    ];

    // Budget only enough for system + a little more
    const result = applySlidingWindow(messages, 40);

    expect(result.messages.some((m) => m.role === 'system')).toBe(true);
    expect(result.messages[0]).toEqual(system);
    expect(result.messages[result.messages.length - 1].content).toBe(
      'latest question',
    );
    expect(result.droppedMessageCount).toBeGreaterThan(0);
  });

  it('keeps newest messages and drops oldest non-system ones', () => {
    const messages: LlmMessage[] = [
      system,
      { role: 'user', content: 'old-1'.padEnd(80, 'x') },
      { role: 'assistant', content: 'old-2'.padEnd(80, 'y') },
      { role: 'user', content: 'new-1' },
      { role: 'assistant', content: 'new-2' },
    ];

    // Fits system + short recent messages, but not the padded older ones
    const result = applySlidingWindow(messages, 30);

    const contents = result.messages.map((m) => m.content);
    expect(contents[0]).toBe(system.content);
    expect(contents).toContain('new-1');
    expect(contents).toContain('new-2');
    expect(contents.some((c) => c.startsWith('old-1'))).toBe(false);
    expect(result.droppedMessageCount).toBeGreaterThan(0);
  });

  it('returns all messages when under budget', () => {
    const messages: LlmMessage[] = [
      system,
      { role: 'user', content: 'hi' },
      { role: 'assistant', content: 'hello' },
    ];

    const result = applySlidingWindow(messages, 10_000);

    expect(result.messages).toEqual(messages);
    expect(result.droppedMessageCount).toBe(0);
    expect(result.estimatedTokens).toBeGreaterThan(0);
  });

  it('always keeps the latest message even if it alone exceeds budget', () => {
    const huge = 'x'.repeat(10_000);
    const messages: LlmMessage[] = [
      system,
      { role: 'user', content: 'old' },
      { role: 'user', content: huge },
    ];

    const result = applySlidingWindow(messages, 10);

    expect(result.messages).toContainEqual({ role: 'user', content: huge });
    expect(result.messages.some((m) => m.content === 'old')).toBe(false);
    expect(result.droppedMessageCount).toBe(1);
  });
});
