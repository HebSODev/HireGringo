import { describe, expect, it, vi } from 'vitest';
import { ApiClientError, createApi, errorMessage } from '../../src/lib/api';
import { API_ERROR_CODES } from '../../shared/types';

const respond = (status: number, body?: unknown, contentType = 'application/json') =>
  vi.fn(async () => new Response(body === undefined ? null : typeof body === 'string' ? body : JSON.stringify(body), { status, headers: { 'content-type': contentType } }));

describe('createApi().post', () => {
  it('envia o token e o corpo em JSON', async () => {
    const fetchFn = respond(200, { ok: 1 });
    const api = createApi(async () => 'jwt-123', fetchFn);
    expect(await api.post('/api/x', { a: 1 })).toEqual({ ok: 1 });
    const [url, init] = fetchFn.mock.calls[0] as unknown as [string, RequestInit];
    expect(url).toBe('/api/x');
    expect(new Headers(init.headers).get('authorization')).toBe('Bearer jwt-123');
    expect(init.body).toBe('{"a":1}');
  });

  it('erro da API vira ApiClientError com o código', async () => {
    const api = createApi(async () => 'jwt', respond(403, { error: 'quota_exhausted' }));
    await expect(api.post('/api/x', {})).rejects.toMatchObject({ status: 403, code: 'quota_exhausted' });
    await expect(api.post('/api/x', {})).rejects.toBeInstanceOf(ApiClientError);
  });

  it('erro sem JSON vira upstream_failed', async () => {
    const api = createApi(async () => 'jwt', respond(504, '<html>timeout</html>', 'text/html'));
    await expect(api.post('/api/x', {})).rejects.toMatchObject({ status: 504, code: 'upstream_failed' });
  });

  it('204 devolve undefined', async () => {
    const api = createApi(async () => 'jwt', respond(204));
    expect(await api.post('/api/x', {})).toBeUndefined();
  });

  it('sem sessão lança unauthorized sem chamar a API', async () => {
    const fetchFn = respond(200, {});
    const api = createApi(async () => null, fetchFn);
    await expect(api.post('/api/x', {})).rejects.toMatchObject({ code: 'unauthorized' });
    expect(fetchFn).not.toHaveBeenCalled();
  });
});

describe('errorMessage', () => {
  it('tem mensagem em português para todo código', () => {
    for (const code of [...API_ERROR_CODES, 'mic_denied' as const]) expect(errorMessage(code).length).toBeGreaterThan(10);
    expect(errorMessage('quota_exhausted')).toBe('Você já usou suas 3 entrevistas grátis.');
  });
});
