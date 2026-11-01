import type { Session } from '@supabase/supabase-js';
import { createContext, useContext, useEffect, useState, type ReactNode } from 'react';
import { Navigate, useLocation } from 'react-router-dom';
import { supabase } from './supabase';

const SessionContext = createContext<{ session: Session | null; loading: boolean }>({ session: null, loading: true });

export function SessionProvider({ children }: { children: ReactNode }) {
  const [state, setState] = useState<{ session: Session | null; loading: boolean }>({ session: null, loading: true });
  useEffect(() => {
    supabase.auth.getSession().then(({ data }) => setState({ session: data.session, loading: false }));
    const { data } = supabase.auth.onAuthStateChange((_event, session) => setState({ session, loading: false }));
    return () => data.subscription.unsubscribe();
  }, []);
  return <SessionContext.Provider value={state}>{children}</SessionContext.Provider>;
}

export const useSession = () => useContext(SessionContext);

export function RequireAuth({ children }: { children: ReactNode }) {
  const { session, loading } = useSession();
  const location = useLocation();
  if (loading) return null;
  if (!session) return <Navigate to="/entrar" replace state={{ from: location.pathname }} />;
  return children;
}
