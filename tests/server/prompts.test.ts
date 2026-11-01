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
