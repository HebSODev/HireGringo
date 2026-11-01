import { FREE_LIMIT, UNFINISHED_DAILY_LIMIT } from '../shared/constants';

export function decideStart(input: { freeUsed: number; unfinishedLast24h: number }):
  { ok: true } | { ok: false; code: 'quota_exhausted' | 'too_many_unfinished' } {
  if (input.freeUsed >= FREE_LIMIT) return { ok: false, code: 'quota_exhausted' };
  if (input.unfinishedLast24h >= UNFINISHED_DAILY_LIMIT) return { ok: false, code: 'too_many_unfinished' };
  return { ok: true };
}
