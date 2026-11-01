import type { SupabaseClient } from '@supabase/supabase-js';
import type { Storage } from './deps';

export function supabaseStorage(db: SupabaseClient): Storage {
  return {
    async download(bucket, path) {
      const { data, error } = await db.storage.from(bucket).download(path);
      if (error) throw error;
      return new Uint8Array(await data.arrayBuffer());
    },
    async removePrefix(bucket, prefix) {
      const folder = prefix.replace(/\/$/, '');
      for (;;) {
        const { data, error } = await db.storage.from(bucket).list(folder, { limit: 100 });
        if (error) throw error;
        if (!data.length) return;
        const { error: e2 } = await db.storage.from(bucket).remove(data.map((f) => `${folder}/${f.name}`));
        if (e2) throw e2;
      }
    },
  };
}
