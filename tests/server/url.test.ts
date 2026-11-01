import { describe, expect, it } from 'vitest';
import { assertFetchableUrl, createSafeLookup, isPrivateAddress } from '../../server/extract/url';
import { ApiError } from '../../server/errors';

describe('assertFetchableUrl', () => {
  it.each([
    'http://localhost:3000',
    'http://169.254.169.254/',
    'http://10.0.0.5/x',
    'http://192.168.1.1',
    'http://172.20.0.1',
    'http://127.0.0.1:8080',
    'http://[::1]/',
    'http://[::ffff:127.0.0.1]/',
    'http://100.64.0.1/',
    'http://198.18.0.1/',
    'http://0.0.0.0/',
    'file:///etc/passwd',
    'https://www.linkedin.com/jobs/view/1',
    'https://linkedin.com/jobs/view/1',
    'not a url',
  ])('recusa %s', (raw) => {
    expect(() => assertFetchableUrl(raw)).toThrowError(ApiError);
    try { assertFetchableUrl(raw); } catch (e) { expect((e as ApiError).code).toBe('url_unreadable'); }
  });

  it('aceita página pública de vaga', () => {
    expect(assertFetchableUrl('https://boards.greenhouse.io/acme/jobs/1').hostname).toBe('boards.greenhouse.io');
  });
});

describe('isPrivateAddress', () => {
  it.each(['127.0.0.1', '10.1.2.3', '172.16.0.1', '192.168.0.1', '169.254.169.254', '100.64.0.1', '198.19.255.1', '0.0.0.0',
    '::1', '::', 'fd00::1', 'fe80::1', '::ffff:127.0.0.1', '::ffff:7f00:1', '::ffff:a00:1'])('privado: %s', (ip) => {
    expect(isPrivateAddress(ip)).toBe(true);
  });
  it.each(['8.8.8.8', '104.16.0.1', '172.32.0.1', '2606:4700::1111', '::ffff:808:808'])('público: %s', (ip) => {
    expect(isPrivateAddress(ip)).toBe(false);
  });
});

describe('createSafeLookup', () => {
  const run = (addresses: { address: string; family: number }[]) =>
    new Promise<{ err: Error | null; address?: unknown }>((resolve) => {
      const lookup = createSafeLookup(async () => addresses);
      lookup('jobs.example.com', {}, (err, address) => resolve({ err, address }));
    });

  it('recusa nome que resolve para IP interno', async () => {
    expect((await run([{ address: '10.0.0.7', family: 4 }])).err).toBeInstanceOf(Error);
  });
  it('recusa se qualquer um dos IPs for interno', async () => {
    expect((await run([{ address: '8.8.8.8', family: 4 }, { address: '127.0.0.1', family: 4 }])).err).toBeInstanceOf(Error);
  });
  it('aceita nome público', async () => {
    expect(await run([{ address: '104.16.0.1', family: 4 }])).toEqual({ err: null, address: '104.16.0.1' });
  });
});
