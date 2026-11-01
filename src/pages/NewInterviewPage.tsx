import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { MAX_UPLOAD_BYTES } from '../../shared/constants';
import type { JobSummary, ResumeSummary } from '../../shared/types';
import { ListEditor } from '../components/ListEditor';
import { Button, Card, ErrorBox, Field, inputClass, Spinner } from '../components/ui';
import { ApiClientError, messageFor } from '../lib/api';
import { useSession } from '../lib/session';
import { api, supabase } from '../lib/supabase';

export type InterviewSetup = { job: JobSummary; resume: ResumeSummary; resumePath: string };

const JOB_FILE_TYPES: Record<string, string> = { 'application/pdf': 'pdf', 'image/png': 'png', 'image/jpeg': 'jpg', 'image/webp': 'webp' };
type JobTab = 'text' | 'url' | 'file';

async function upload(bucket: 'resumes' | 'job-files', userId: string, file: File, ext: string): Promise<string> {
  const path = `${userId}/${crypto.randomUUID()}.${ext}`;
  const { error } = await supabase.storage.from(bucket).upload(path, file, { contentType: file.type });
  if (error) throw new ApiClientError(500, 'upstream_failed');
  return path;
}

function checkFile(file: File, types: string[]): string | null {
  if (!types.includes(file.type)) return 'Formato de arquivo não aceito.';
  if (file.size > MAX_UPLOAD_BYTES) return 'O arquivo passa de 5 MB.';
  return null;
}

export function NewInterviewPage() {
  const navigate = useNavigate();
  const userId = useSession().session!.user.id;

  const [resume, setResume] = useState<ResumeSummary | null>(null);
  const [resumePath, setResumePath] = useState<string | null>(null);
  const [resumeBusy, setResumeBusy] = useState(false);
  const [resumeError, setResumeError] = useState<string | null>(null);

  const [tab, setTab] = useState<JobTab>('text');
  const [jobText, setJobText] = useState('');
  const [jobUrl, setJobUrl] = useState('');
  const [jobFile, setJobFile] = useState<File | null>(null);
  const [job, setJob] = useState<JobSummary | null>(null);
  const [jobBusy, setJobBusy] = useState(false);
  const [jobError, setJobError] = useState<string | null>(null);

  async function onResume(file: File | undefined) {
    if (!file) return;
    setResumeError(null);
    const invalid = checkFile(file, ['application/pdf']);
    if (invalid) return setResumeError(invalid);
    setResumeBusy(true);
    try {
      const path = await upload('resumes', userId, file, 'pdf');
      setResume(await api.post<ResumeSummary>('/api/extract/resume', { path }));
      setResumePath(path);
    } catch (e) {
      setResumeError(messageFor(e));
    } finally {
      setResumeBusy(false);
    }
  }

  async function onExtractJob() {
    setJobError(null);
    setJobBusy(true);
    try {
      let body: unknown;
      if (tab === 'text') body = { kind: 'text', text: jobText };
      else if (tab === 'url') body = { kind: 'url', url: jobUrl.trim() };
      else {
        const invalid = checkFile(jobFile!, Object.keys(JOB_FILE_TYPES));
        if (invalid) { setJobError(invalid); return; }
        const path = await upload('job-files', userId, jobFile!, JOB_FILE_TYPES[jobFile!.type]);
        body = { kind: 'file', path, mime: jobFile!.type };
      }
      setJob(await api.post<JobSummary>('/api/extract/job', body));
    } catch (e) {
      setJobError(messageFor(e));
      if (tab === 'url' && e instanceof ApiClientError && e.code === 'url_unreadable') setTab('text');
    } finally {
      setJobBusy(false);
    }
  }

  const canExtractJob = (tab === 'text' && jobText.trim().length > 50) || (tab === 'url' && jobUrl.trim().length > 8) || (tab === 'file' && !!jobFile);

  return (
    <div className="space-y-6">
      <h1 className="text-2xl font-semibold">Nova entrevista</h1>

      <Card className="space-y-4">
        <h2 className="font-semibold">1. Seu currículo</h2>
        <p className="text-sm text-slate-600">PDF com texto selecionável, até 5 MB.</p>
        <input type="file" accept="application/pdf" onChange={(e) => onResume(e.target.files?.[0])} disabled={resumeBusy}
          className="block text-sm file:mr-3 file:rounded-lg file:border-0 file:bg-slate-100 file:px-4 file:py-2 file:text-sm file:font-medium hover:file:bg-slate-200" />
        {resumeBusy && <Spinner label="Lendo seu currículo…" />}
        <ErrorBox message={resumeError} />
        {resume && <p className="text-sm text-emerald-700">✓ Currículo lido: {resume.headline}</p>}
      </Card>

      <Card className="space-y-4">
        <h2 className="font-semibold">2. A vaga</h2>
        <div className="flex gap-2 text-sm">
          {([['text', 'Colar texto'], ['url', 'Link'], ['file', 'PDF ou print']] as const).map(([t, label]) => (
            <button key={t} type="button" onClick={() => setTab(t)}
              className={`rounded-lg px-3 py-1.5 ${tab === t ? 'bg-slate-900 text-white' : 'bg-slate-100 text-slate-700 hover:bg-slate-200'}`}>
              {label}
            </button>
          ))}
        </div>
        {tab === 'text' && (
          <textarea rows={8} className={inputClass} placeholder="Cole aqui a descrição completa da vaga" value={jobText} onChange={(e) => setJobText(e.target.value)} />
        )}
        {tab === 'url' && (
          <div className="space-y-1">
            <input type="url" className={inputClass} placeholder="https://boards.greenhouse.io/…" value={jobUrl} onChange={(e) => setJobUrl(e.target.value)} />
            <p className="text-xs text-slate-500">Links do LinkedIn não funcionam (exigem login). Nesse caso, cole o texto.</p>
          </div>
        )}
        {tab === 'file' && (
          <input type="file" accept={Object.keys(JOB_FILE_TYPES).join(',')} onChange={(e) => setJobFile(e.target.files?.[0] ?? null)}
            className="block text-sm file:mr-3 file:rounded-lg file:border-0 file:bg-slate-100 file:px-4 file:py-2 file:text-sm file:font-medium hover:file:bg-slate-200" />
        )}
        <ErrorBox message={jobError} />
        <Button onClick={onExtractJob} disabled={!canExtractJob || jobBusy} variant="secondary">
          {jobBusy ? <Spinner label="Lendo a vaga…" /> : 'Ler a vaga'}
        </Button>
      </Card>

      {resume && job && resumePath && (
        <Confirm job={job} resume={resume} onJob={setJob} onResume={setResume}
          onStart={() => navigate('/entrevista', { state: { job, resume, resumePath } satisfies InterviewSetup })} />
      )}
    </div>
  );
}

function Confirm(props: {
  job: JobSummary; resume: ResumeSummary;
  onJob: (j: JobSummary) => void; onResume: (r: ResumeSummary) => void; onStart: () => void;
}) {
  const { job, resume, onJob, onResume } = props;
  return (
    <Card className="space-y-5">
      <div>
        <h2 className="font-semibold">3. Confira antes de começar</h2>
        <p className="text-sm text-slate-600">O entrevistador vai usar estas informações. Corrija o que veio errado.</p>
      </div>
      <div className="grid gap-4 sm:grid-cols-3">
        <Field label="Cargo"><input className={inputClass} value={job.title} onChange={(e) => onJob({ ...job, title: e.target.value })} /></Field>
        <Field label="Empresa"><input className={inputClass} value={job.company ?? ''} onChange={(e) => onJob({ ...job, company: e.target.value || null })} /></Field>
        <Field label="Senioridade"><input className={inputClass} value={job.seniority ?? ''} onChange={(e) => onJob({ ...job, seniority: e.target.value || null })} /></Field>
      </div>
      <ListEditor label="Requisitos da vaga" items={job.requirements} onChange={(requirements) => onJob({ ...job, requirements })} />
      <ListEditor label="Stack da vaga" items={job.stack} onChange={(stack) => onJob({ ...job, stack })} />
      <ListEditor label="Suas habilidades (do currículo)" items={resume.skills} onChange={(skills) => onResume({ ...resume, skills })} />
      <div className="rounded-lg bg-slate-50 p-4 text-sm text-slate-600">
        <p className="font-medium text-slate-800">Como funciona</p>
        <ul className="mt-2 list-disc space-y-1 pl-5">
          <li>São 5 minutos, em inglês. O entrevistador fala, depois é a sua vez.</li>
          <li>Quando terminar de responder, espere um instante ou clique em “Terminei de responder”.</li>
          <li>Use fone de ouvido, se puder, e fique num lugar silencioso.</li>
        </ul>
      </div>
      <Button onClick={props.onStart} disabled={!job.title.trim()}>Começar entrevista</Button>
    </Card>
  );
}
