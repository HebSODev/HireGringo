import { expect, it } from 'vitest';
import { createSentenceChunker } from '../../server/sentenceChunker';

it('corta frases completas sem quebrar Node.js e junta frases curtas', () => {
  const c = createSentenceChunker();
  expect(c.push('Hi. I am Alex, the inter')).toEqual([]);
  expect(c.push('viewer. Tell me')).toEqual(['Hi. I am Alex, the interviewer.']);
  expect(c.push(' about Node.js and')).toEqual([]);
  expect(c.push(' your work? Sure')).toEqual(['Tell me about Node.js and your work?']);
  expect(c.flush()).toEqual(['Sure']);
});

it('flush vazio não devolve nada', () => {
  const c = createSentenceChunker();
  c.push('Done here today. ');
  expect(c.flush()).toEqual([]);
});
