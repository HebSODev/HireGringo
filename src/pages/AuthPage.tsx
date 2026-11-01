import { useState, type FormEvent } from 'react';
import { Navigate, useLocation } from 'react-router-dom';
import { Button, Card, ErrorBox, Field, inputClass } from '../components/ui';
import { useSession } from '../lib/session';
import { supabase } from '../lib/supabase';
import { signUpErrorMessage } from '../lib/authErrors';

export function AuthPage() {
  const { session } = useSession();
  const location = useLocation();
  const [mode, setMode] = useState<'login' | 'signup'>('login');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [consent, setConsent] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [info, setInfo] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  if (session) return <Navigate to={(location.state as { from?: string } | null)?.from ?? '/'} replace />;

  async function submit(e: FormEvent) {
    e.preventDefault();
    setError(null);
    setInfo(null);
    setBusy(true);
    if (mode === 'login') {
      const { error } = await supabase.auth.signInWithPassword({ email, password });
      if (error) setError(error.message === 'Email not confirmed' ? 'Confirme seu e-mail antes de entrar (veja sua caixa de entrada).' : 'E-mail ou senha incorretos.');
    } else {
      const { error } = await supabase.auth.signUp({
        email,
        password,
        options: { data: { consent_at: new Date().toISOString() }, emailRedirectTo: window.location.origin },
      });
      if (error) {
        console.error('signUp failed', error.code, error.status, error.message);
        setError(signUpErrorMessage(error));
      } else setInfo('Conta criada! Enviamos um link de confirmação para o seu e-mail. Confirme e depois entre.');
    }
    setBusy(false);
  }

  return (
    <div className="flex min-h-screen items-center justify-center bg-slate-50 px-4">
      <div className="w-full max-w-md space-y-6">
        <div className="text-center">
          <h1 className="text-3xl font-bold tracking-tight">Hire<span className="text-emerald-600">Gringo</span></h1>
          <p className="mt-2 text-slate-600">Treine sua entrevista em inglês para a vaga que você quer.</p>
        </div>
        <Card>
          <div className="mb-6 grid grid-cols-2 rounded-lg bg-slate-100 p-1 text-sm font-medium">
            {(['login', 'signup'] as const).map((m) => (
              <button
                key={m}
                type="button"
                onClick={() => { setMode(m); setError(null); setInfo(null); }}
                className={`rounded-md py-2 ${mode === m ? 'bg-white shadow-sm' : 'text-slate-500'}`}
              >
                {m === 'login' ? 'Entrar' : 'Criar conta'}
              </button>
            ))}
          </div>
          <form onSubmit={submit} className="space-y-4">
            <Field label="E-mail">
              <input type="email" required value={email} onChange={(e) => setEmail(e.target.value)} className={inputClass} autoComplete="email" />
            </Field>
            <Field label="Senha">
              <input type="password" required minLength={6} value={password} onChange={(e) => setPassword(e.target.value)} className={inputClass}
                autoComplete={mode === 'login' ? 'current-password' : 'new-password'} />
            </Field>
            {mode === 'signup' && (
              <label className="flex items-start gap-2 text-sm text-slate-600">
                <input type="checkbox" checked={consent} onChange={(e) => setConsent(e.target.checked)} className="mt-1" />
                <span>
                  Concordo que o HireGringo use meu currículo, a vaga e a transcrição da entrevista para gerar minha avaliação.
                  O áudio não é gravado, e posso apagar meus dados a qualquer momento.
                </span>
              </label>
            )}
            <ErrorBox message={error} />
            {info && <p className="rounded-lg bg-emerald-50 px-3 py-2 text-sm text-emerald-800 ring-1 ring-emerald-200">{info}</p>}
            <Button type="submit" className="w-full" disabled={busy || (mode === 'signup' && !consent)}>
              {mode === 'login' ? 'Entrar' : 'Criar conta'}
            </Button>
          </form>
        </Card>
      </div>
    </div>
  );
}
