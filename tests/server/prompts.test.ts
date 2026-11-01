import { describe, expect, it } from 'vitest';
import { renderPrompt } from '../../server/prompts';

describe('renderPrompt', () => {
  it('substitui variáveis', () => {
    expect(renderPrompt('Hi {{a}}, {{b}}s', { a: 'Ana', b: 300 })).toBe('Hi Ana, 300s');
  });
  it('falha quando falta variável', () => {
    expect(() => renderPrompt('{{missing}}', {})).toThrow(/missing/);
  });
});

describe('loadPrompt', () => {
  it('remove os comentários HTML destinados a quem edita o prompt', async () => {
    const { loadPrompt } = await import('../../server/prompts');
    const text = await loadPrompt('interviewer');
    expect(text).not.toContain('<!--');
    expect(text).toContain('{{remainingSeconds}}');
  });
});
