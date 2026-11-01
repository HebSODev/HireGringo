import { describe, expect, it, vi } from 'vitest';
import { createDeleteAccountHandler } from '../../server/handlers/deleteAccount';
import { makeDeps, post, USER } from '../helpers/fakes';

describe('POST /api/account/delete', () => {
  it('apaga arquivos das duas pastas antes do usuário', async () => {
    const calls: string[] = [];
    const deps = makeDeps({
      storage: { download: vi.fn(), removePrefix: vi.fn(async (bucket: string, prefix: string) => { calls.push(`${bucket}:${prefix}`); }) },
    });
    const adminDeleteUser = vi.fn(async (id: string) => { calls.push(`user:${id}`); });
    const res = await createDeleteAccountHandler({ ...deps, adminDeleteUser })(post({}));
    expect(res.status).toBe(204);
    expect(calls).toEqual([`resumes:${USER}/`, `job-files:${USER}/`, `user:${USER}`]);
  });

  it('exige login', async () => {
    const adminDeleteUser = vi.fn();
    const res = await createDeleteAccountHandler({ ...makeDeps(), adminDeleteUser })(post({}, false));
    expect(res.status).toBe(401);
    expect(adminDeleteUser).not.toHaveBeenCalled();
  });
});
