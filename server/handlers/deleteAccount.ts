import type { Deps } from '../deps';
import { withErrors } from '../errors';

export function createDeleteAccountHandler(deps: Deps & { adminDeleteUser(userId: string): Promise<void> }) {
  return withErrors(async (req) => {
    const { userId } = await deps.auth(req);
    await deps.storage.removePrefix('resumes', `${userId}/`);
    await deps.storage.removePrefix('job-files', `${userId}/`);
    // As linhas do banco (profile, entrevistas, turnos, resultados) caem em cascata com o usuário.
    await deps.adminDeleteUser(userId);
    return new Response(null, { status: 204 });
  });
}
