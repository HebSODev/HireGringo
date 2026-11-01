import { INTERVIEW_SECONDS } from '../shared/constants.js';
import type { Interview, Turn } from '../shared/types.js';
import type { ChatMessage } from './deps.js';
import { phaseFor } from './interviewPhase.js';
import { renderPrompt } from './prompts.js';

export const END_MARKER = '[END]';
const OPENING = '(The call has just connected. Start the interview.)';
const SILENCE = '(candidate stayed silent)';

export function buildInterviewerMessages(input: { template: string; interview: Interview; turns: Turn[]; elapsedSec: number }): ChatMessage[] {
  const system = renderPrompt(input.template, {
    job: JSON.stringify(input.interview.job),
    resume: JSON.stringify(input.interview.resume),
    remainingSeconds: Math.max(0, Math.round(INTERVIEW_SECONDS - input.elapsedSec)),
    phase: phaseFor(input.elapsedSec),
  });
  const history: ChatMessage[] = input.turns.map((t) =>
    t.role === 'interviewer'
      ? { role: 'assistant', content: t.text }
      : { role: 'user', content: t.text.trim() ? t.text : SILENCE },
  );
  return [{ role: 'system', content: system }, ...(history.length ? history : [{ role: 'user' as const, content: OPENING }])];
}
