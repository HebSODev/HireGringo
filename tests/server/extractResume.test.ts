import { describe, expect, it, vi } from 'vitest';
import { createExtractResumeHandler } from '../../server/handlers/extractResume';
import { makeDeps, post, resume, USER, FILE } from '../helpers/fakes';

const longText = 'Experienced backend developer. '.repeat(10);

function deps(text: string, llmJson: () => Promise<unknown>) {
  const d = makeDeps({
    storage: { download: vi.fn(async () => new Uint8Array([1])), removePrefix: vi.fn() },
    pdfToText: vi.fn(async () => text),
  });
  d.llm.json = vi.fn(llmJson);
  return d;
}

describe('POST /api/extract/resume', () => {
  it('recusa caminho de outro usuário', async () => {
    const res = await createExtractResumeHandler(makeDeps())(post({ path: `other/${FILE}.pdf` }));
    expect(res.status).toBe(403);
    expect(await res.json()).toEqual({ error: 'forbidden' });
  });

  it('recusa PDF escaneado sem chamar o LLM', async () => {
    const d = deps('abc', async () => resume);
    const res = await createExtractResumeHandler(d)(post({ path: `${USER}/${FILE}.pdf` }));
    expect(res.status).toBe(422);
    expect(await res.json()).toEqual({ error: 'resume_unreadable' });
    expect(d.llm.json).not.toHaveBeenCalled();
  });

  it('devolve o resumo estruturado', async () => {
    const d = deps(longText, async () => resume);
    const res = await createExtractResumeHandler(d)(post({ path: `${USER}/${FILE}.pdf` }));
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual(resume);
    expect(d.storage.download).toHaveBeenCalledWith('resumes', `${USER}/${FILE}.pdf`);
  });

  it('JSON inválido do LLM vira 502', async () => {
    const d = deps(longText, async () => ({ nope: true }));
    const res = await createExtractResumeHandler(d)(post({ path: `${USER}/${FILE}.pdf` }));
    expect(res.status).toBe(502);
    expect(await res.json()).toEqual({ error: 'upstream_failed' });
  });

  it('quem esgotou a cota não gasta extração', async () => {
    const d = deps(longText, async () => resume);
    d.repo.freeUsed.set(USER, 3);
    const res = await createExtractResumeHandler(d)(post({ path: `${USER}/${FILE}.pdf` }));
    expect(res.status).toBe(403);
    expect(d.storage.download).not.toHaveBeenCalled();
  });
});
