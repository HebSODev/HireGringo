import { useEffect, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import type { Evaluation, JobSummary, Turn } from '../../shared/types';
import { Button, Card, ErrorBox, Spinner } from '../components/ui';
import { supabase } from '../lib/supabase';

type Data = { job: JobSummary; createdAt: string; evaluation: Evaluation; turns: Turn[] };

function ScoreCard({ label, score, justification }: { label: string; score: number; justification: string }) {
  const tone = score >= 7 ? 'text-emerald-700' : score >= 5 ? 'text-amber-600' : 'text-red-600';
  return (
    <Card className="space-y-3">
      <p className="text-sm font-semibold uppercase tracking-wide text-slate-500">{label}</p>
      <p className={`text-5xl font-bold tabular-nums ${tone}`}>{score}<span className="text-2xl text-slate-400">/10</span></p>
      <p className="text-sm leading-relaxed text-slate-700">{justification}</p>
    </Card>
  );
}

export function ResultPage() {
  const { id } = useParams();
  const [data, setData] = useState<Data | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    (async () => {
      const [iv, res, turns] = await Promise.all([
        supabase.from('interviews').select('job, created_at').eq('id', id!).maybeSingle(),
        supabase.from('results').select('evaluation').eq('interview_id', id!).maybeSingle(),
        supabase.from('turns').select('seq, role, text, metrics').eq('interview_id', id!).order('seq'),
      ]);
      if (iv.error || res.error || turns.error || !iv.data || !res.data) {
        setError('Não encontramos o resultado dessa entrevista.');
        return;
      }
      setData({ job: iv.data.job, createdAt: iv.data.created_at, evaluation: res.data.evaluation, turns: turns.data as Turn[] });
    })();
  }, [id]);

  if (error) return <div className="space-y-4"><ErrorBox message={error} /><Link to="/"><Button variant="secondary">Voltar</Button></Link></div>;
  if (!data) return <Spinner label="Carregando resultado…" />;

  const { evaluation: ev, job } = data;
  return (
    <div className="space-y-8">
      <div>
        <p className="text-sm text-slate-500">
          Resultado · {new Date(data.createdAt).toLocaleDateString('pt-BR', { day: '2-digit', month: 'long', year: 'numeric' })}
        </p>
        <h1 className="text-2xl font-semibold">{job.title}{job.company ? ` · ${job.company}` : ''}</h1>
      </div>

      <div className="grid gap-4 sm:grid-cols-2">
        <ScoreCard label="Técnico" score={ev.technical.score} justification={ev.technical.justification} />
        <ScoreCard label="Inglês" score={ev.english.score} justification={ev.english.justification} />
      </div>

      <section className="space-y-3">
        <h2 className="text-lg font-semibold">O que praticar — técnico</h2>
        <Card>
          <ul className="list-disc space-y-2 pl-5 text-sm leading-relaxed text-slate-700">
            {ev.tips.technical.map((tip) => <li key={tip}>{tip}</li>)}
          </ul>
        </Card>
      </section>

      <section className="space-y-3">
        <h2 className="text-lg font-semibold">O que praticar — inglês</h2>
        {ev.tips.english.length === 0 && <p className="text-sm text-slate-600">Nenhuma correção específica desta vez.</p>}
        <div className="space-y-3">
          {ev.tips.english.map((tip) => (
            <Card key={tip.said} className="space-y-2 p-4">
              <p className="text-sm"><span className="font-medium text-slate-500">Você disse: </span><em className="text-red-700">“{tip.said}”</em></p>
              <p className="text-sm"><span className="font-medium text-slate-500">Mais natural: </span><em className="text-emerald-700">“{tip.better}”</em></p>
              <p className="text-sm text-slate-600">{tip.why}</p>
            </Card>
          ))}
        </div>
      </section>

      <details className="rounded-xl bg-white p-4 ring-1 ring-slate-200">
        <summary className="cursor-pointer text-sm font-semibold text-slate-700">Transcrição completa</summary>
        <div className="mt-4 space-y-3 text-sm">
          {data.turns.map((t) => (
            <p key={t.seq}>
              <span className="font-semibold">{t.role === 'interviewer' ? 'Entrevistador' : 'Você'}: </span>
              <span className="text-slate-700">{t.text || '(silêncio)'}</span>
            </p>
          ))}
        </div>
      </details>

      <Link to="/"><Button variant="secondary">Voltar ao início</Button></Link>
    </div>
  );
}
