import { describe, expect, it, vi } from 'vitest';
import { supabaseAuth } from '../../server/auth';

const req = (h?: string) => new Request('http://x', { headers: h ? { authorization: h } : {} });

function fakeDb(result: { data: unknown; error: unknown }) {
  const getClaims = vi.fn(async () => result);
  return { db: { auth: { getClaims } } as never, getClaims };
}

describe('supabaseAuth', () => {
  it('valida o JWT localmente e devolve o sub', async () => {
    const { db, getClaims } = fakeDb({ data: { claims: { sub: 'u-1', role: 'authenticated' } }, error: null });
    await expect(supabaseAuth(db)(req('Bearer abc'))).resolves.toEqual({ userId: 'u-1' });
    expect(getClaims).toHaveBeenCalledWith('abc');
  });

  it('sem header é 401', async () => {
    const { db } = fakeDb({ data: null, error: null });
    await expect(supabaseAuth(db)(req())).rejects.toMatchObject({ code: 'unauthorized' });
  });

  it('token inválido ou expirado é 401', async () => {
    const { db } = fakeDb({ data: null, error: new Error('JWT expired') });
    await expect(supabaseAuth(db)(req('Bearer x'))).rejects.toMatchObject({ code: 'unauthorized' });
  });

  it('token anônimo (sem usuário) é 401', async () => {
    const { db } = fakeDb({ data: { claims: { role: 'anon' } }, error: null });
    await expect(supabaseAuth(db)(req('Bearer x'))).rejects.toMatchObject({ code: 'unauthorized' });
  });
});
