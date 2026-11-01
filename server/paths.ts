import type { Bucket } from './deps';
import { ApiError } from './errors';

const EXT: Record<Bucket, string> = { resumes: 'pdf', 'job-files': 'pdf|png|jpg|webp' };
const escape = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

/**
 * Só aceita `<userId>/<uuid>.<ext>`, o formato que o frontend gera. Bloqueia `..` e pastas de
 * outros usuários: o download usa a secret key, que ignora as políticas do storage.
 */
export function assertOwnedPath(userId: string, path: string, bucket: Bucket): void {
  const re = new RegExp(`^${escape(userId)}/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}\\.(${EXT[bucket]})$`);
  if (!re.test(path)) throw new ApiError(403, 'forbidden');
}
