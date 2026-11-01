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

it('espera o começo da próxima frase para cortar, e o flush entrega o resto', () => {
  const c = createSentenceChunker();
  expect(c.push('Done here today. ')).toEqual([]);
  expect(c.push('Next')).toEqual(['Done here today.']);
  expect(c.flush()).toEqual(['Next']);
  expect(c.flush()).toEqual([]);
});

it('separa frases coladas sem espaço (o modelo às vezes escreve assim)', () => {
  const c = createSentenceChunker();
  expect(c.push('What replication setup did you choose?During that migration, what')).toEqual(['What replication setup did you choose?']);
  expect(c.push(' was your role? ')).toEqual([]);
  expect(c.flush()).toEqual(['During that migration, what was your role?']);
});

it('não corta nomes como Node.js nem minúsculas depois do ponto', () => {
  const c = createSentenceChunker();
  expect(c.push('We use Node.js and e.g. vitest daily here. ')).toEqual([]);
  expect(c.flush()).toEqual(['We use Node.js and e.g. vitest daily here.']);
});
