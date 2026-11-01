import { z } from 'zod';
import { aggregateMetrics } from '../shared/speechMetrics.js';
import type { Evaluation, Interview, Turn } from '../shared/types.js';
import type { ChatMessage, Llm } from './deps.js';
import { ApiError } from './errors.js';
import { renderPrompt } from './prompts.js';

const Score = z.number().int().min(0).max(10);
const Text = z.string().trim().min(1);

export const EvaluationSchema = z.object({
  technical: z.object({ score: Score, justification: Text }),
  english: z.object({ score: Score, justification: Text }),
  tips: z.object({
    technical: z.array(Text).min(1).max(5),
    english: z.array(z.object({ said: Text, better: Text, why: Text })).min(1).max(6),
  }),
});

const normalize = (s: string) => s.toLowerCase().replace(/[^\p{L}\p{N}\s]/gu, '').replace(/\s+/g, ' ').trim();

/** Descarta dicas de inglês que não citam algo que o candidato realmente disse (evita dica genérica ou inventada). */
export function filterGroundedTips(evaluation: Evaluation, candidateSpeech: string): Evaluation {
  const spoken = normalize(candidateSpeech);
  return {
    ...evaluation,
    tips: { ...evaluation.tips, english: evaluation.tips.english.filter((t) => spoken.includes(normalize(t.said))) },
  };
}

export function buildEvaluatorMessages(input: { template: string; interview: Interview; turns: Turn[] }): ChatMessage[] {
  const transcript = input.turns
    .map((t) => `${t.role === 'interviewer' ? 'Interviewer' : 'Candidate'}: ${t.text.trim() || '(silent)'}`)
    .join('\n');
  const metrics = input.turns.flatMap((t) => (t.role === 'candidate' && t.metrics ? [t.metrics] : []));
  return [{
    role: 'system',
    content: renderPrompt(input.template, {
      job: JSON.stringify(input.interview.job),
      resume: JSON.stringify(input.interview.resume),
      transcript,
      speechStats: JSON.stringify(aggregateMetrics(metrics)),
    }),
  }];
}

const ATTEMPTS = 2;

export async function evaluate(llm: Llm, messages: ChatMessage[], candidateSpeech: string): Promise<Evaluation> {
  for (let attempt = 0; attempt < ATTEMPTS; attempt++) {
    try {
      const parsed = EvaluationSchema.safeParse(await llm.json(messages));
      if (parsed.success) return filterGroundedTips(parsed.data, candidateSpeech);
    } catch (e) {
      console.error(e);
    }
  }
  throw new ApiError(502, 'evaluation_failed');
}
