import { describe, expect, it, vi } from 'vitest';
import { createFinishHandler } from '../../server/handlers/finish';
import { makeDeps, NOW, post, USER } from '../helpers/fakes';
import { validEvaluation } from './evaluator.test';

function setup(elapsedSec: number, ...answers: unknown[]) {
  const deps = makeDeps({ now: () => new Date(NOW.getTime() + elapsedSec * 1000) });
  const interview = deps.repo.seed();
  deps.repo.turns.set(interview.id, [
    { seq: 0, role: 'interviewer', text: 'Tell me about yourself.', metrics: null },
    { seq: 1, role: 'candidate', text: 'Well, I have 5 years of experience in React.', metrics: null },
  ]);
  const json = vi.fn();
  for (const a of answers) json.mockResolvedValueOnce(a);
  deps.llm.json = json;
  return { deps, interview, json, handler: createFinishHandler(deps) };
}

describe('POST /api/interviews/finish', () => {
  it('menos de 120 s: abandona sem avaliar nem consumir cota', async () => {
    const { deps, interview, json, handler } = setup(90);
    const res = await handler(post({ interviewId: interview.id }));
    expect(await res.json()).toEqual({ status: 'abandoned', reason: 'too_short' });
    expect(json).not.toHaveBeenCalled();
    expect(deps.repo.interviews.get(interview.id)!.status).toBe('abandoned');
    expect(deps.repo.freeUsed.get(USER) ?? 0).toBe(0);
  });

  it('avalia, filtra dicas inventadas e conclui', async () => {
    const { deps, interview, handler } = setup(200, validEvaluation);
    const res = await handler(post({ interviewId: interview.id }));
    expect(await res.json()).toEqual({ status: 'completed' });
    const saved = deps.repo.evaluations.get(interview.id)!;
    expect(saved.technical.score).toBe(6);
    expect(saved.tips.english.map((t) => t.said)).toEqual(['I have 5 years of experience in React']);
    expect(deps.repo.freeUsed.get(USER)).toBe(1);
  });

  it('tenta de novo uma vez quando a avaliação vem inválida', async () => {
    const { json, interview, handler } = setup(200, { ...validEvaluation, technical: { score: 11, justification: 'x' } }, validEvaluation);
    const res = await handler(post({ interviewId: interview.id }));
    expect(await res.json()).toEqual({ status: 'completed' });
    expect(json).toHaveBeenCalledTimes(2);
  });

  it('falha duas vezes: 502 sem concluir nem consumir cota', async () => {
    const { deps, json, interview, handler } = setup(200, { bad: 1 }, { bad: 2 });
    const res = await handler(post({ interviewId: interview.id }));
    expect(res.status).toBe(502);
    expect(await res.json()).toEqual({ error: 'evaluation_failed' });
    expect(json).toHaveBeenCalledTimes(2);
    expect(deps.repo.interviews.get(interview.id)!.status).toBe('in_progress');
    expect(deps.repo.freeUsed.get(USER) ?? 0).toBe(0);
  });

  it('exceção do LLM conta como tentativa', async () => {
    const { deps, interview, handler } = setup(200);
    deps.llm.json = vi.fn().mockRejectedValueOnce(new Error('timeout')).mockResolvedValueOnce(validEvaluation);
    const res = await handler(post({ interviewId: interview.id }));
    expect(await res.json()).toEqual({ status: 'completed' });
  });

  it('idempotente quando já concluída', async () => {
    const { deps, json, handler } = setup(200);
    const done = deps.repo.seed({ status: 'completed' });
    const res = await handler(post({ interviewId: done.id }));
    expect(await res.json()).toEqual({ status: 'completed' });
    expect(json).not.toHaveBeenCalled();
  });

  it('entrevista já abandonada devolve abandoned', async () => {
    const { deps, handler } = setup(200);
    const old = deps.repo.seed({ status: 'abandoned' });
    expect(await (await handler(post({ interviewId: old.id }))).json()).toEqual({ status: 'abandoned' });
  });

  it('o tempo conta no máximo 360 s (avalia mesmo bem depois)', async () => {
    const { interview, handler } = setup(5000, validEvaluation);
    expect(await (await handler(post({ interviewId: interview.id }))).json()).toEqual({ status: 'completed' });
  });

  it('404 para entrevista de outro usuário', async () => {
    const { deps, handler } = setup(200);
    const other = deps.repo.seed({ userId: 'x' });
    expect((await handler(post({ interviewId: other.id }))).status).toBe(404);
  });
});
