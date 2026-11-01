import { ApiError } from '../errors';

const MAX_BYTES = 2 * 1024 * 1024;
const MAX_REDIRECTS = 3;

function isPrivateHost(host: string): boolean {
  const h = host.replace(/^\[|\]$/g, '').toLowerCase();
  if (h === 'localhost' || h.endsWith('.localhost') || h.endsWith('.local') || h.endsWith('.internal')) return true;
  if (h === '::1' || h === '::' || h.startsWith('fc') || h.startsWith('fd') || h.startsWith('fe80')) return h.includes(':');
  const m = h.match(/^(\d+)\.(\d+)\.(\d+)\.(\d+)$/);
  if (!m) return false;
  const [a, b] = [Number(m[1]), Number(m[2])];
  return a === 0 || a === 10 || a === 127 || (a === 169 && b === 254) || (a === 172 && b >= 16 && b <= 31) || (a === 192 && b === 168);
}

/** Bloqueia o que não é página pública de vaga (SSRF) e o LinkedIn, que exige login. */
export function assertFetchableUrl(raw: string): URL {
  let url: URL;
  try {
    url = new URL(raw);
  } catch {
    throw new ApiError(422, 'url_unreadable');
  }
  const host = url.hostname.toLowerCase();
  if (!['http:', 'https:'].includes(url.protocol)) throw new ApiError(422, 'url_unreadable');
  if (isPrivateHost(host)) throw new ApiError(422, 'url_unreadable');
  if (host === 'linkedin.com' || host.endsWith('.linkedin.com')) throw new ApiError(422, 'url_unreadable');
  return url;
}

export async function fetchPage(raw: string): Promise<string> {
  let url = assertFetchableUrl(raw);
  for (let hop = 0; hop <= MAX_REDIRECTS; hop++) {
    const res = await fetch(url, {
      redirect: 'manual',
      signal: AbortSignal.timeout(8000),
      headers: { 'user-agent': 'Mozilla/5.0 (HireGringo job reader)', accept: 'text/html,text/plain' },
    });
    if (res.status >= 300 && res.status < 400 && res.headers.get('location')) {
      url = assertFetchableUrl(new URL(res.headers.get('location')!, url).toString());
      continue;
    }
    if (!res.ok || !res.body) throw new ApiError(422, 'url_unreadable');
    const reader = res.body.getReader();
    const chunks: Uint8Array[] = [];
    let size = 0;
    for (;;) {
      const { done, value } = await reader.read();
      if (done) break;
      size += value.byteLength;
      if (size > MAX_BYTES) { await reader.cancel(); break; }
      chunks.push(value);
    }
    return new TextDecoder().decode(Buffer.concat(chunks));
  }
  throw new ApiError(422, 'url_unreadable');
}
