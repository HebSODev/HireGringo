import { createClient } from '@supabase/supabase-js';
import { createApi } from './api';

export const supabase = createClient(import.meta.env.VITE_SUPABASE_URL, import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY);

export const api = createApi(async () => (await supabase.auth.getSession()).data.session?.access_token ?? null);
