import type { SupabaseClient } from '@supabase/supabase-js';
import { ApiError } from './errors.js';

export type AuthFn = (req: Request) => Promise<{ userId: string }>;

/**
 * Valida o JWT do Supabase localmente (chaves assimétricas via JWKS, em cache), sem ida ao servidor
 * de auth a cada turno da entrevista.
 */
export function supabaseAuth(db: SupabaseClient): AuthFn {
  return async (req) => {
    const header = req.headers.get('authorization') ?? '';
    const jwt = header.startsWith('Bearer ') ? header.slice(7) : '';
    if (!jwt) throw new ApiError(401, 'unauthorized');
    const { data, error } = await db.auth.getClaims(jwt);
    const sub = data?.claims?.sub;
    if (error || !sub || data.claims.role !== 'authenticated') throw new ApiError(401, 'unauthorized');
    return { userId: sub };
  };
}
