import { describe, expect, it } from 'vitest';
import { ApiError } from '../../server/errors';
import { assertOwnedPath } from '../../server/paths';

const U = 'b7c1e1d2-0000-4000-8000-000000000001';
const F = '3f2a9c4e-1111-4222-8333-444455556666';

describe('assertOwnedPath', () => {
  it('aceita arquivo do próprio usuário com nome gerado pelo app', () => {
    expect(() => assertOwnedPath(U, `${U}/${F}.pdf`, 'resumes')).not.toThrow();
    expect(() => assertOwnedPath(U, `${U}/${F}.png`, 'job-files')).not.toThrow();
  });

  it.each([
    `${U}/../other/${F}.pdf`,
    `other/${F}.pdf`,
    `${U}/${F}.png`,
    `${U}/sub/${F}.pdf`,
    `${U}/cv.pdf`,
  ])('recusa %s em resumes', (path) => {
    try {
      assertOwnedPath(U, path, 'resumes');
      throw new Error('deveria recusar');
    } catch (e) {
      expect(e).toBeInstanceOf(ApiError);
      expect((e as ApiError).code).toBe('forbidden');
    }
  });
});
