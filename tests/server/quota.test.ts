import { describe, expect, it } from 'vitest';
import { decideStart } from '../../server/quota';

describe('decideStart', () => {
  it('bloqueia quando a cota grátis acabou', () => {
    expect(decideStart({ freeUsed: 3, inProgress: 0, unfinishedLast24h: 0 })).toEqual({ ok: false, code: 'quota_exhausted' });
  });
  it('bloqueia inacabadas demais', () => {
    expect(decideStart({ freeUsed: 0, inProgress: 0, unfinishedLast24h: 3 })).toEqual({ ok: false, code: 'too_many_unfinished' });
  });
  it('libera abaixo dos limites', () => {
    expect(decideStart({ freeUsed: 2, inProgress: 0, unfinishedLast24h: 2 })).toEqual({ ok: true });
  });
  it('entrevistas em andamento contam na cota grátis', () => {
    expect(decideStart({ freeUsed: 2, inProgress: 1, unfinishedLast24h: 1 })).toEqual({ ok: false, code: 'quota_exhausted' });
  });
});
