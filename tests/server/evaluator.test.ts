import { describe, expect, it } from 'vitest';
import { buildEvaluatorMessages, EvaluationSchema, filterGroundedTips } from '../../server/evaluator';
import type { Evaluation } from '../../shared/types';
import { makeDeps } from '../helpers/fakes';

export const validEvaluation: Evaluation = {
  technical: { score: 6, justification: 'Explained APIs well but was vague on testing, which the role requires.' },
  english: { score: 7, justification: 'Fluent with some unnatural phrasing.' },
  tips: {
    technical: ['Prepare a concrete example of your testing strategy.'],
    english: [
      { said: 'I have 5 years of experience in React', better: "I've been working with React for 5 years", why: 'More natural for duration.' },
      { said: 'I am very passionate', better: "I'm passionate", why: 'Invented quote.' },
    ],
  },
};

describe('EvaluationSchema', () => {
  it('recusa nota fora de 0 a 10 ou não inteira', () => {
    expect(EvaluationSchema.safeParse({ ...validEvaluation, technical: { score: 11, justification: 'x' } }).success).toBe(false);
    expect(EvaluationSchema.safeParse({ ...validEvaluation, english: { score: 6.5, justification: 'x' } }).success).toBe(false);
    expect(EvaluationSchema.safeParse(validEvaluation).success).toBe(true);
  });
});

describe('filterGroundedTips', () => {
  it('mantém só dicas de inglês que citam o que o candidato falou', () => {
    const out = filterGroundedTips(validEvaluation, 'Well, I have 5 years of experience in React. Mostly frontend.');
    expect(out.tips.english.map((t) => t.said)).toEqual(['I have 5 years of experience in React']);
  });
});

describe('buildEvaluatorMessages', () => {
  it('monta transcrição e estatísticas de fala', () => {
    const interview = makeDeps().repo.seed();
    const m = { wordCount: 60, durationSec: 30, wpm: 120, fillerCount: 2, lowConfidenceWords: ['schema'], longPauseCount: 1, responseLatencySec: 1.5, silent: false };
    const [system] = buildEvaluatorMessages({
      template: 'T={{transcript}} S={{speechStats}} J={{job}} R={{resume}}',
      interview,
      turns: [
        { seq: 0, role: 'interviewer', text: 'Tell me about yourself.', metrics: null },
        { seq: 1, role: 'candidate', text: 'I build APIs.', metrics: m },
        { seq: 2, role: 'candidate', text: '', metrics: null },
      ],
    });
    expect(system.content).toContain('Interviewer: Tell me about yourself.\nCandidate: I build APIs.\nCandidate: (silent)');
    expect(system.content).toContain('"avgWpm":120');
    expect(system.content).toContain('"lowConfidenceWords":["schema"]');
  });
});
