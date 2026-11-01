import { lazy, supabaseAdmin } from '../../server/deps.js';
import { createDeleteAccountHandler } from '../../server/handlers/deleteAccount.js';

export const POST = lazy((deps) =>
  createDeleteAccountHandler({
    ...deps,
    adminDeleteUser: async (userId) => {
      const { error } = await supabaseAdmin().auth.admin.deleteUser(userId);
      if (error) throw error;
    },
  }),
);
