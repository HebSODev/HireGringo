import { describe, expect, it, vi } from 'vitest';
import { createDeepgramTokenHandler } from '../../server/handlers/deepgramToken';
import { makeDeps, NOW, post } from '../helpers/fakes';

describe('POST /api/deepgram-token', () => {
  it('404 sem entrevista do usuário', async () => {
    const res = await createDeepgramTokenHandler(makeDeps())(post({ interviewId: 'nope' }));
    expect(res.status).toBe(404);
  });

  it('409 para entrevista concluída', async () => {
    const deps = makeDeps();
    const iv = deps.repo.seed({ status: 'completed' });
    const res = await createDeepgramTokenHandler(deps)(post({ interviewId: iv.id }));
    expect(res.status).toBe(409);
    expect(await res.json()).toEqual({ error: 'interview_not_active' });
  });

  it('emite token de 30 s', async () => {
    const grant = vi.fn(async () => ({ token: 'tmp', expiresIn: 30 }));
    const deps = makeDeps({ deepgram: { grant } });
    const iv = deps.repo.seed();
    const res = await createDeepgramTokenHandler(deps)(post({ interviewId: iv.id }));
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ token: 'tmp', expiresIn: 30 });
    expect(grant).toHaveBeenCalledWith(30);
  });

  it('não emite token para entrevista que já passou do tempo', async () => {
    const grant = vi.fn(async () => ({ token: 'tmp', expiresIn: 30 }));
    const deps = makeDeps({ deepgram: { grant }, now: () => new Date(NOW.getTime() + 361_000) });
    const iv = deps.repo.seed();
    const res = await createDeepgramTokenHandler(deps)(post({ interviewId: iv.id }));
    expect(res.status).toBe(409);
    expect(await res.json()).toEqual({ error: 'time_over' });
    expect(grant).not.toHaveBeenCalled();
  });
});
