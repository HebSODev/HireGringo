import { ApiError } from './errors.js';
import { FREE_LIMIT, UNFINISHED_DAILY_LIMIT } from '../shared/constants.js';

/** Entrevistas em andamento contam na cota grátis: abrir várias abas não passa do limite. */
export function decideStart(input: { freeUsed: number; inProgress: number; unfinishedLast24h: number }):
  { ok: true } | { ok: false; code: 'quota_exhausted' | 'too_many_unfinished' } {
  if (input.freeUsed + input.inProgress >= FREE_LIMIT) return { ok: false, code: 'quota_exhausted' };
  if (input.unfinishedLast24h >= UNFINISHED_DAILY_LIMIT) return { ok: false, code: 'too_many_unfinished' };
  return { ok: true };
}

/** Extração custa LLM: só faz sentido para quem ainda pode começar uma entrevista. */
export async function assertCanExtract(repo: { getFreeUsed(userId: string): Promise<number> }, userId: string): Promise<void> {
  if ((await repo.getFreeUsed(userId)) >= FREE_LIMIT) throw new ApiError(403, 'quota_exhausted');
}
