import { Link, Outlet, useNavigate } from 'react-router-dom';
import { supabase } from '../lib/supabase';

export function Layout() {
  const navigate = useNavigate();
  return (
    <div className="min-h-screen bg-slate-50 text-slate-900">
      <header className="border-b border-slate-200 bg-white">
        <div className="mx-auto flex max-w-4xl items-center justify-between px-4 py-3">
          <Link to="/" className="text-lg font-bold tracking-tight">
            Hire<span className="text-emerald-600">Gringo</span>
          </Link>
          <nav className="flex items-center gap-4 text-sm text-slate-600">
            <Link to="/" className="hover:text-slate-900">Início</Link>
            <Link to="/conta" className="hover:text-slate-900">Conta</Link>
            <button
              className="hover:text-slate-900"
              onClick={async () => { await supabase.auth.signOut(); navigate('/entrar'); }}
            >
              Sair
            </button>
          </nav>
        </div>
      </header>
      <main className="mx-auto max-w-4xl px-4 py-8">
        <Outlet />
      </main>
    </div>
  );
}
