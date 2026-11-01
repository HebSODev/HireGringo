import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { FREE_LIMIT } from '../../shared/constants';
import type { JobSummary } from '../../shared/types';
import { Button, Card, ErrorBox, Spinner } from '../components/ui';
import { supabase } from '../lib/supabase';

type Row = {
  id: string;
  job: JobSummary;
  resume_path: string;
  created_at: string;
  results: { technical_score: number; english_score: number } | null;
};

const fmtDate = (iso: string) => new Date(iso).toLocaleDateString('pt-BR', { day: '2-digit', month: 'short', year: 'numeric' });

function Score({ label, value }: { label: string; value: number }) {
  const color = value >= 7 ? 'text-emerald-700 bg-emerald-50' : value >= 5 ? 'text-amber-700 bg-amber-50' : 'text-red-700 bg-red-50';
  return <span className={`rounded-md px-2 py-1 text-xs font-semibold ${color}`}>{label} {value}/10</span>;
}

export function HomePage() {
  const [rows, setRows] = useState<Row[] | null>(null);
  const [used, setUsed] = useState<number | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function load() {
    const [interviews, profile] = await Promise.all([
      supabase.from('interviews')
        .select('id, job, resume_path, created_at, results(technical_score, english_score)')
        .eq('status', 'completed').order('created_at', { ascending: false }),
      supabase.from('profiles').select('free_interviews_used').maybeSingle(),
    ]);
    if (interviews.error || profile.error) {
      setError('Não foi possível carregar seu histórico.');
      return;
    }
    setRows(interviews.data as unknown as Row[]);
    setUsed(profile.data?.free_interviews_used ?? 0);
  }

  useEffect(() => { void load(); }, []);

  async function remove(row: Row) {
    if (!window.confirm(`Apagar a entrevista para "${row.job.title}"? Isso não devolve a entrevista grátis.`)) return;
    const { error } = await supabase.from('interviews').delete().eq('id', row.id);
    if (error) {
      setError('Não foi possível apagar a entrevista.');
      return;
    }
    await supabase.storage.from('resumes').remove([row.resume_path]);
    setRows((r) => r?.filter((x) => x.id !== row.id) ?? null);
  }

  const remaining = used === null ? null : Math.max(0, FREE_LIMIT - used);

  return (
    <div className="space-y-8">
      <Card className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-xl font-semibold">Pronto para treinar?</h1>
          <p className="mt-1 text-sm text-slate-600">
            Uma entrevista de 5 minutos em inglês, com perguntas sobre a sua vaga.
            {remaining !== null && <> Você tem <strong>{remaining}</strong> de {FREE_LIMIT} entrevistas grátis.</>}
          </p>
        </div>
        {remaining === 0 ? (
          <Button disabled>Entrevistas grátis esgotadas</Button>
        ) : (
          <Link to="/nova"><Button className="w-full sm:w-auto">Nova entrevista</Button></Link>
        )}
      </Card>

      <section className="space-y-3">
        <h2 className="text-sm font-semibold uppercase tracking-wide text-slate-500">Histórico</h2>
        <ErrorBox message={error} />
        {rows === null && !error && <Spinner label="Carregando…" />}
        {rows?.length === 0 && <p className="text-sm text-slate-600">Você ainda não concluiu nenhuma entrevista.</p>}
        <ul className="space-y-2">
          {rows?.map((row) => (
            <li key={row.id}>
              <Card className="flex flex-col gap-3 p-4 sm:flex-row sm:items-center sm:justify-between">
                <Link to={`/resultado/${row.id}`} className="min-w-0 flex-1">
                  <p className="truncate font-medium">{row.job.title}{row.job.company ? ` · ${row.job.company}` : ''}</p>
                  <p className="text-sm text-slate-500">{fmtDate(row.created_at)}</p>
                </Link>
                <div className="flex items-center gap-2">
                  {row.results && (
                    <>
                      <Score label="Técnico" value={row.results.technical_score} />
                      <Score label="Inglês" value={row.results.english_score} />
                    </>
                  )}
                  <Button variant="ghost" onClick={() => remove(row)} aria-label="Apagar entrevista">Apagar</Button>
                </div>
              </Card>
            </li>
          ))}
        </ul>
      </section>
    </div>
  );
}
