import { describe, expect, it, vi } from 'vitest';
import { createExtractJobHandler } from '../../server/handlers/extractJob';
import { job, makeDeps, post, USER } from '../helpers/fakes';

const longText = 'We are hiring a Senior Backend Engineer with Node.js. '.repeat(6);

function deps(extra: { tech?: boolean; page?: string; pdfText?: string } = {}) {
  const d = makeDeps({
    storage: { download: vi.fn(async () => new Uint8Array([137, 80, 78, 71])), removePrefix: vi.fn() },
    pdfToText: vi.fn(async () => extra.pdfText ?? longText),
    fetchPage: vi.fn(async () => extra.page ?? `<html><body><p>${longText}</p></body></html>`),
  });
  const out = { ...job, isTechRole: extra.tech ?? true };
  d.llm.json = vi.fn(async () => out);
  d.llm.vision = vi.fn(async () => out);
  return d;
}

describe('POST /api/extract/job', () => {
  it('texto colado devolve o resumo sem isTechRole', async () => {
    const d = deps();
    const res = await createExtractJobHandler(d)(post({ kind: 'text', text: longText }));
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual(job);
  });

  it('vaga fora de tecnologia é recusada', async () => {
    const res = await createExtractJobHandler(deps({ tech: false }))(post({ kind: 'text', text: 'Registered Nurse. '.repeat(20) }));
    expect(res.status).toBe(422);
    expect(await res.json()).toEqual({ error: 'not_tech_role' });
  });

  it('link do LinkedIn falha sem buscar a página', async () => {
    const d = deps();
    const res = await createExtractJobHandler(d)(post({ kind: 'url', url: 'https://www.linkedin.com/jobs/view/1' }));
    expect(res.status).toBe(422);
    expect(await res.json()).toEqual({ error: 'url_unreadable' });
    expect(d.fetchPage).not.toHaveBeenCalled();
  });

  it('página com pouco texto é recusada', async () => {
    const res = await createExtractJobHandler(deps({ page: '<p>Sign in</p>' }))(post({ kind: 'url', url: 'https://jobs.example.com/1' }));
    expect(res.status).toBe(422);
    expect(await res.json()).toEqual({ error: 'url_unreadable' });
  });

  it('falha de rede no link vira url_unreadable', async () => {
    const d = deps();
    d.fetchPage = vi.fn(async () => { throw new Error('ECONNRESET'); });
    const res = await createExtractJobHandler(d)(post({ kind: 'url', url: 'https://jobs.example.com/1' }));
    expect(res.status).toBe(422);
    expect(await res.json()).toEqual({ error: 'url_unreadable' });
  });

  it('link válido passa o texto limpo ao LLM', async () => {
    const d = deps();
    const res = await createExtractJobHandler(d)(post({ kind: 'url', url: 'https://jobs.example.com/1' }));
    expect(res.status).toBe(200);
    const prompt = JSON.stringify(vi.mocked(d.llm.json).mock.calls[0][0]);
    expect(prompt).toContain('Senior Backend Engineer');
    expect(prompt).not.toContain('<p>');
  });

  it('print usa o modelo de visão', async () => {
    const d = deps();
    const res = await createExtractJobHandler(d)(post({ kind: 'file', path: `${USER}/vaga.png`, mime: 'image/png' }));
    expect(res.status).toBe(200);
    expect(d.llm.vision).toHaveBeenCalledWith({ base64: 'iVBORw==', mime: 'image/png' }, expect.any(String));
    expect(d.storage.download).toHaveBeenCalledWith('job-files', `${USER}/vaga.png`);
  });

  it('PDF usa extração de texto', async () => {
    const d = deps();
    const res = await createExtractJobHandler(d)(post({ kind: 'file', path: `${USER}/vaga.pdf`, mime: 'application/pdf' }));
    expect(res.status).toBe(200);
    expect(d.pdfToText).toHaveBeenCalled();
    expect(d.llm.vision).not.toHaveBeenCalled();
  });

  it('PDF de vaga sem texto é recusado', async () => {
    const res = await createExtractJobHandler(deps({ pdfText: '' }))(post({ kind: 'file', path: `${USER}/vaga.pdf`, mime: 'application/pdf' }));
    expect(res.status).toBe(422);
    expect(await res.json()).toEqual({ error: 'job_unreadable' });
  });

  it('formato não suportado é 400', async () => {
    const res = await createExtractJobHandler(deps())(post({ kind: 'file', path: `${USER}/vaga.gif`, mime: 'image/gif' }));
    expect(res.status).toBe(400);
  });

  it('arquivo de outro usuário é 403', async () => {
    const res = await createExtractJobHandler(deps())(post({ kind: 'file', path: 'other/vaga.png', mime: 'image/png' }));
    expect(res.status).toBe(403);
  });
});
