import { lazy, supabaseAdmin } from '../../server/deps';
import { createDeleteAccountHandler } from '../../server/handlers/deleteAccount';

export const POST = lazy((deps) =>
  createDeleteAccountHandler({
    ...deps,
    adminDeleteUser: async (userId) => {
      const { error } = await supabaseAdmin().auth.admin.deleteUser(userId);
      if (error) throw error;
    },
  }),
);
