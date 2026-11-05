import { useEffect, useState } from 'react';
import { supabase } from '../lib/supabase';
import { StarRating } from './StarRating';
import { Button, Card, ErrorBox, inputClass } from './ui';

const MAX_COMMENT = 2000;

type Saved = { rating: number; comment: string };

export function FeedbackCard({ interviewId }: { interviewId: string }) {
  const [saved, setSaved] = useState<Saved | null>(null);
  const [loaded, setLoaded] = useState(false);
  const [editing, setEditing] = useState(true);
  const [rating, setRating] = useState(0);
  const [comment, setComment] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    (async () => {
      const { data } = await supabase.from('feedback').select('rating, comment').eq('interview_id', interviewId).maybeSingle();
      if (data) {
        const s = { rating: Number(data.rating), comment: data.comment ?? '' };
        setSaved(s);
        setRating(s.rating);
        setComment(s.comment);
        setEditing(false);
      }
      setLoaded(true);
    })();
  }, [interviewId]);

  async function submit() {
    if (!rating) return;
    setBusy(true);
    setError(null);
    const fields = { rating, comment: comment.trim() || null };
    const { error: e } = saved
      ? await supabase.from('feedback').update(fields).eq('interview_id', interviewId)
      : await supabase.from('feedback').insert({ interview_id: interviewId, ...fields });
    setBusy(false);
    if (e) {
      setError('Não conseguimos enviar sua avaliação. Tente de novo.');
      return;
    }
    setSaved({ rating, comment: fields.comment ?? '' });
    setEditing(false);
  }

  if (!loaded) return null;

  return (
    <Card className="space-y-4">
      <div>
        <h2 className="text-lg font-semibold">Deixe sua avaliação</h2>
        <p className="text-sm text-slate-600">O que achou dessa entrevista? Sua opinião ajuda a melhorar o HireGringo.</p>
      </div>

      {!editing && saved ? (
        <div className="space-y-3">
          <StarRating value={saved.rating} onChange={() => {}} disabled />
          {saved.comment && <p className="whitespace-pre-line text-sm text-slate-700">{saved.comment}</p>}
          <div className="flex items-center gap-3">
            <p className="text-sm font-medium text-emerald-700">Obrigado pela avaliação!</p>
            <Button variant="ghost" onClick={() => setEditing(true)}>Editar</Button>
          </div>
        </div>
      ) : (
        <div className="space-y-3">
          <StarRating value={rating} onChange={setRating} disabled={busy} />
          <textarea
            className={`${inputClass} min-h-24`}
            placeholder="Conte o que funcionou e o que podemos melhorar (opcional)"
            maxLength={MAX_COMMENT}
            value={comment}
            onChange={(e) => setComment(e.target.value)}
            disabled={busy}
            aria-label="Comentário"
          />
          <ErrorBox message={error} />
          <div className="flex gap-2">
            <Button onClick={submit} disabled={!rating || busy}>{busy ? 'Enviando…' : 'Enviar avaliação'}</Button>
            {saved && (
              <Button variant="secondary" disabled={busy} onClick={() => { setRating(saved.rating); setComment(saved.comment); setEditing(false); setError(null); }}>
                Cancelar
              </Button>
            )}
          </div>
        </div>
      )}
    </Card>
  );
}
