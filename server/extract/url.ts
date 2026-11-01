import { lookup as dnsLookup } from 'node:dns/promises';
import { isIP, isIPv4 } from 'node:net';
import { Agent, fetch as undiciFetch } from 'undici';
import { ApiError } from '../errors.js';

const MAX_BYTES = 2 * 1024 * 1024;
const MAX_REDIRECTS = 3;

function isPrivateV4(ip: string): boolean {
  const [a, b] = ip.split('.').map(Number);
  return a === 0 || a === 10 || a === 127 || a >= 224
    || (a === 100 && b >= 64 && b <= 127)
    || (a === 169 && b === 254)
    || (a === 172 && b >= 16 && b <= 31)
    || (a === 192 && b === 168)
    || (a === 198 && (b === 18 || b === 19));
}

/** IPs que não são internet pública: loopback, redes privadas, link-local, CGNAT, IPv4 mapeado em IPv6 etc. */
export function isPrivateAddress(raw: string): boolean {
  const ip = raw.replace(/^\[|\]$/g, '').toLowerCase();
  if (isIPv4(ip)) return isPrivateV4(ip);
  if (ip === '::' || ip === '::1') return true;
  const dotted = ip.match(/^(?:0{0,4}:){0,5}:?ffff:(\d+\.\d+\.\d+\.\d+)$/);
  if (dotted) return isPrivateV4(dotted[1]);
  const hex = ip.match(/^(?:0{0,4}:){0,5}:?ffff:([0-9a-f]{1,4}):([0-9a-f]{1,4})$/);
  if (hex) {
    const hi = parseInt(hex[1], 16);
    const lo = parseInt(hex[2], 16);
    return isPrivateV4(`${hi >> 8}.${hi & 255}.${lo >> 8}.${lo & 255}`);
  }
  const first = parseInt(ip.split(':')[0] || '0', 16);
  return (first & 0xfe00) === 0xfc00 || (first & 0xffc0) === 0xfe80 || (first & 0xff00) === 0xff00;
}

/** Bloqueia o que não é página pública de vaga (SSRF) e o LinkedIn, que exige login. */
export function assertFetchableUrl(raw: string): URL {
  let url: URL;
  try {
    url = new URL(raw);
  } catch {
    throw new ApiError(422, 'url_unreadable');
  }
  const host = url.hostname.toLowerCase().replace(/^\[|\]$/g, '');
  const blocked =
    !['http:', 'https:'].includes(url.protocol)
    || (isIP(host) !== 0 && isPrivateAddress(host))
    || host === 'localhost' || host.endsWith('.localhost') || host.endsWith('.local') || host.endsWith('.internal')
    || host === 'linkedin.com' || host.endsWith('.linkedin.com');
  if (blocked) throw new ApiError(422, 'url_unreadable');
  return url;
}

type Resolved = { address: string; family: number };
type LookupCallback = (err: Error | null, address?: string | Resolved[], family?: number) => void;

/**
 * `lookup` para a conexão: resolve o nome e recusa se QUALQUER IP for interno. Como roda na hora de
 * conectar, um DNS que muda de resposta (rebinding) também é barrado.
 */
export function createSafeLookup(resolve: (host: string) => Promise<Resolved[]>) {
  return (hostname: string, options: { all?: boolean }, cb: LookupCallback) => {
    resolve(hostname).then(
      (list) => {
        if (!list.length || list.some((r) => isPrivateAddress(r.address))) return cb(new Error(`blocked host ${hostname}`));
        if (options?.all) return cb(null, list);
        cb(null, list[0].address, list[0].family);
      },
      (err: Error) => cb(err),
    );
  };
}

const agent = new Agent({
  connect: { lookup: createSafeLookup((host) => dnsLookup(host, { all: true, verbatim: true })) as never },
});

export async function fetchPage(raw: string): Promise<string> {
  let url = assertFetchableUrl(raw);
  for (let hop = 0; hop <= MAX_REDIRECTS; hop++) {
    const res = await undiciFetch(url, {
      dispatcher: agent,
      redirect: 'manual',
      signal: AbortSignal.timeout(8000),
      headers: { 'user-agent': 'Mozilla/5.0 (HireGringo job reader)', accept: 'text/html,text/plain' },
    });
    const location = res.headers.get('location');
    if (res.status >= 300 && res.status < 400 && location) {
      url = assertFetchableUrl(new URL(location, url).toString());
      continue;
    }
    if (!res.ok || !res.body) throw new ApiError(422, 'url_unreadable');
    const chunks: Uint8Array[] = [];
    let size = 0;
    for await (const chunk of res.body) {
      size += chunk.byteLength;
      if (size > MAX_BYTES) break;
      chunks.push(chunk);
    }
    return new TextDecoder().decode(Buffer.concat(chunks));
  }
  throw new ApiError(422, 'url_unreadable');
}
