import { describe, expect, it } from 'vitest';
import { assertFetchableUrl } from '../../server/extract/url';
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
