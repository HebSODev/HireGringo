import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Button, Card, ErrorBox, Field, inputClass } from '../components/ui';
import { messageFor } from '../lib/api';
import { useSession } from '../lib/session';
import { api, supabase } from '../lib/supabase';

const CONFIRM_WORD = 'APAGAR';

export function AccountPage() {
  const navigate = useNavigate();
  const email = useSession().session?.user.email;
  const [confirm, setConfirm] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function deleteAccount() {
    setBusy(true);
    setError(null);
    try {
      await api.post('/api/account/delete', {});
      await supabase.auth.signOut();
      navigate('/entrar', { replace: true });
    } catch (e) {
      setError(messageFor(e));
      setBusy(false);
    }
  }

  return (
    <div className="space-y-6">
      <h1 className="text-2xl font-semibold">Conta</h1>
      <Card><p className="text-sm text-slate-600">Conectado como <strong className="text-slate-900">{email}</strong></p></Card>
      <Card className="space-y-4 ring-red-200">
        <h2 className="font-semibold text-red-700">Apagar conta</h2>
        <p className="text-sm text-slate-600">
          Apaga para sempre sua conta, seus currículos, as vagas enviadas, as transcrições e os resultados. Não dá para desfazer.
        </p>
        <Field label={`Digite ${CONFIRM_WORD} para confirmar`}>
          <input className={inputClass} value={confirm} onChange={(e) => setConfirm(e.target.value)} />
        </Field>
        <ErrorBox message={error} />
        <Button variant="danger" disabled={confirm !== CONFIRM_WORD || busy} onClick={deleteAccount}>Apagar minha conta</Button>
      </Card>
    </div>
  );
}
