import type { SupabaseClient } from '@supabase/supabase-js';
import { ApiError } from './errors';

export type AuthFn = (req: Request) => Promise<{ userId: string }>;

export function supabaseAuth(db: SupabaseClient): AuthFn {
  return async (req) => {
    const header = req.headers.get('authorization') ?? '';
    const jwt = header.startsWith('Bearer ') ? header.slice(7) : '';
    if (!jwt) throw new ApiError(401, 'unauthorized');
    const { data, error } = await db.auth.getUser(jwt);
    if (error || !data.user) throw new ApiError(401, 'unauthorized');
    return { userId: data.user.id };
  };
}
