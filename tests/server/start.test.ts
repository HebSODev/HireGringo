import { describe, expect, it } from 'vitest';
import { createStartHandler } from '../../server/handlers/start';
import { job, makeDeps, NOW, post, resume, USER, FILE } from '../helpers/fakes';

const body = { job, resume, resumePath: `${USER}/${FILE}.pdf` };

describe('POST /api/interviews/start', () => {
  it('exige login', async () => {
    const res = await createStartHandler(makeDeps())(post(body, false));
    expect(res.status).toBe(401);
  });

  it('marca entrevistas paradas como abandonadas antes de contar', async () => {
    const deps = makeDeps();
    const stale = deps.repo.seed({ startedAt: new Date(NOW.getTime() - 11 * 60_000) });
    deps.repo.freeUsed.set(USER, 2);
    const res = await createStartHandler(deps)(post(body));
    expect(res.status).toBe(200);
    expect(deps.repo.interviews.get(stale.id)!.status).toBe('abandoned');
  });

  it('entrevista em andamento recente conta na cota (abrir várias abas não burla o limite)', async () => {
    const deps = makeDeps();
    deps.repo.freeUsed.set(USER, 2);
    deps.repo.seed({ startedAt: new Date(NOW.getTime() - 60_000) });
    const res = await createStartHandler(deps)(post(body));
    expect(res.status).toBe(403);
    expect(await res.json()).toEqual({ error: 'quota_exhausted' });
  });

  it('recusa quando a cota grátis acabou', async () => {
    const deps = makeDeps();
    deps.repo.freeUsed.set(USER, 3);
    const res = await createStartHandler(deps)(post(body));
    expect(res.status).toBe(403);
    expect(await res.json()).toEqual({ error: 'quota_exhausted' });
    expect(deps.repo.interviews.size).toBe(0);
  });

  it('recusa inacabadas demais', async () => {
    const deps = makeDeps();
    deps.repo.unfinishedLast24h = 3;
    const res = await createStartHandler(deps)(post(body));
    expect(res.status).toBe(429);
    expect(await res.json()).toEqual({ error: 'too_many_unfinished' });
  });

  it('recusa currículo de outro usuário', async () => {
    const res = await createStartHandler(makeDeps())(post({ ...body, resumePath: `other-user/${FILE}.pdf` }));
    expect(res.status).toBe(403);
    expect(await res.json()).toEqual({ error: 'forbidden' });
  });

  it('recusa corpo inválido', async () => {
    const { title: _t, ...noTitle } = job;
    const res = await createStartHandler(makeDeps())(post({ ...body, job: noTitle }));
    expect(res.status).toBe(400);
    expect(await res.json()).toEqual({ error: 'bad_request' });
  });

  it('cria a entrevista', async () => {
    const deps = makeDeps();
    const res = await createStartHandler(deps)(post(body));
    expect(res.status).toBe(200);
    const out = await res.json();
    expect(out).toEqual({ interviewId: expect.any(String), startedAt: NOW.toISOString() });
    expect(deps.repo.interviews.get(out.interviewId)).toMatchObject({ userId: USER, status: 'in_progress', job });
  });
});
