import { useCallback, useEffect, useReducer, useRef, useState } from 'react';
import { Link, Navigate, useLocation, useNavigate } from 'react-router-dom';
import { INTERVIEW_SECONDS, SILENCE_TIMEOUT_MS } from '../../shared/constants';
import { computeTurnMetrics } from '../../shared/speechMetrics';
import type { DgWord, TurnMetrics, TurnStreamEvent } from '../../shared/types';
import { Button, Card, ErrorBox, Spinner } from '../components/ui';
import { ApiClientError, errorMessage } from '../lib/api';
import { createAudioQueue } from '../lib/audioQueue';
import { connectDeepgram, type DeepgramConnection } from '../lib/deepgramClient';
import { createRecorder, openMic } from '../lib/micRecorder';
import { readNdjson } from '../lib/ndjson';
import { createPcmPlayer } from '../lib/pcmPlayer';
import { roomReducer, type RoomStatus } from '../lib/roomReducer';
import { api } from '../lib/supabase';
import type { InterviewSetup } from './NewInterviewPage';

/** Se o entrevistador não encerrar sozinho, o cliente encerra 30 s depois dos 5 min. */
const CLIENT_CUTOFF_SECONDS = INTERVIEW_SECONDS + 30;
const KEEPALIVE_MS = 5000;
const FINALIZE_WAIT_MS = 600;

const STATUS_LABEL: Partial<Record<RoomStatus, string>> = {
  requesting_mic: 'Aguardando o microfone…',
  starting: 'Conectando…',
  interviewer_thinking: 'Pensando…',
  interviewer_speaking: 'Entrevistador falando…',
  listening: 'Sua vez — pode falar',
  finishing: 'Gerando seu resultado…',
};

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));
const codeOf = (e: unknown) => (e instanceof ApiClientError ? e.code : 'upstream_failed');

export function InterviewRoomPage() {
  const setup = useLocation().state as InterviewSetup | null;
  const navigate = useNavigate();
  const [state, dispatch] = useReducer(roomReducer, { status: 'idle' });
  const [interviewerText, setInterviewerText] = useState('');
  const [candidateText, setCandidateText] = useState('');
  const [secondsLeft, setSecondsLeft] = useState(INTERVIEW_SECONDS);
  const [tooShort, setTooShort] = useState(false);

  const statusRef = useRef<RoomStatus>('idle');
  statusRef.current = state.status;

  const interviewId = useRef<string | null>(null);
  const startedAt = useRef(0);
  const audioCtx = useRef<AudioContext | null>(null);
  const player = useRef<ReturnType<typeof createPcmPlayer> | null>(null);
  const queue = useRef<ReturnType<typeof createAudioQueue> | null>(null);
  const recorder = useRef<ReturnType<typeof createRecorder> | null>(null);
  const deepgram = useRef<DeepgramConnection | null>(null);
  const reconnected = useRef(false);
  const words = useRef<DgWord[]>([]);
  const listeningSince = useRef(0);
  const firstInterimAt = useRef<number | null>(null);
  const silenceTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const turnLock = useRef(false);

  const teardown = useCallback(() => {
    if (silenceTimer.current) clearTimeout(silenceTimer.current);
    recorder.current?.stop();
    recorder.current = null;
    deepgram.current?.close();
    deepgram.current = null;
    player.current?.stop();
    void audioCtx.current?.close();
    audioCtx.current = null;
  }, []);

  useEffect(() => teardown, [teardown]);

  // ---------- Turno do entrevistador ----------
  const runTurn = useCallback(async (text: string | null, metrics: TurnMetrics | null) => {
    const q = queue.current!;
    q.reset();
    setInterviewerText('');
    let ended = false;
    let gotAudio = false;
    try {
      const res = await api.stream('/api/interviews/turn', { interviewId: interviewId.current, text, metrics });
      for await (const ev of readNdjson<TurnStreamEvent>(res.body!)) {
        if (ev.type === 'text') setInterviewerText((t) => (t ? `${t} ${ev.text}` : ev.text));
        else if (ev.type === 'audio') {
          if (!gotAudio) { gotAudio = true; dispatch({ type: 'INTERVIEWER_AUDIO' }); }
          q.enqueue(ev.seq, ev.data);
        } else if (ev.type === 'end') ended = true;
        else if (ev.type === 'error') throw new ApiClientError(502, ev.code);
      }
    } catch (e) {
      const code = codeOf(e);
      dispatch(code === 'time_over' ? { type: 'TIME_UP' } : { type: 'FAILED', code });
      return;
    }
    q.onIdle(() => {
      if (statusRef.current === 'finishing' || statusRef.current === 'error') return;
      if (ended) dispatch({ type: 'INTERVIEWER_ENDED' });
      else startListening();
    });
    q.markStreamDone();
  }, []);

  // ---------- Turno do candidato ----------
  const sendCandidateTurn = useCallback(async () => {
    if (turnLock.current || statusRef.current !== 'listening') return;
    turnLock.current = true;
    if (silenceTimer.current) clearTimeout(silenceTimer.current);
    deepgram.current?.finalize();
    await sleep(FINALIZE_WAIT_MS);
    recorder.current?.pause();
    const said = words.current;
    const text = said.map((w) => w.punctuated_word ?? w.word).join(' ');
    const latency = firstInterimAt.current ? (firstInterimAt.current - listeningSince.current) / 1000 : null;
    const metrics = computeTurnMetrics(said, { responseLatencySec: latency === null ? null : Math.round(latency * 10) / 10 });
    if (statusRef.current !== 'listening') { turnLock.current = false; return; }
    dispatch({ type: 'CANDIDATE_TURN_SENT' });
    turnLock.current = false;
    await runTurn(text, metrics);
  }, [runTurn]);

  const startListening = useCallback(() => {
    words.current = [];
    firstInterimAt.current = null;
    listeningSince.current = Date.now();
    setCandidateText('');
    dispatch({ type: 'INTERVIEWER_DONE' });
    recorder.current?.resume();
    silenceTimer.current = setTimeout(() => {
      if (firstInterimAt.current === null) void sendCandidateTurn();
    }, SILENCE_TIMEOUT_MS);
  }, [sendCandidateTurn]);

  // ---------- Deepgram ----------
  const connect = useCallback(async () => {
    const { token } = await api.post<{ token: string }>('/api/deepgram-token', { interviewId: interviewId.current });
    const conn = connectDeepgram(token, setup?.job.stack ?? [], {
      onFinal: (w) => {
        if (statusRef.current !== 'listening') return;
        words.current.push(...w);
        setCandidateText(words.current.map((x) => x.punctuated_word ?? x.word).join(' '));
      },
      onInterim: (t) => {
        if (statusRef.current !== 'listening') return;
        firstInterimAt.current ??= Date.now();
        if (silenceTimer.current) clearTimeout(silenceTimer.current);
        setCandidateText([...words.current.map((x) => x.punctuated_word ?? x.word), t].join(' '));
      },
      onUtteranceEnd: () => {
        if (words.current.length) void sendCandidateTurn();
      },
      onClose: (unexpected) => {
        const active = ['interviewer_thinking', 'interviewer_speaking', 'listening'].includes(statusRef.current);
        if (!unexpected || !active) return;
        if (reconnected.current) { dispatch({ type: 'FAILED', code: 'upstream_failed' }); return; }
        reconnected.current = true;
        connect().catch(() => dispatch({ type: 'FAILED', code: 'upstream_failed' }));
      },
    });
    deepgram.current = conn;
    await conn.ready;
  }, [setup, sendCandidateTurn]);

  // ---------- Início ----------
  async function begin() {
    dispatch({ type: 'MIC_REQUESTED' });
    let stream: MediaStream;
    try {
      stream = await openMic();
    } catch {
      dispatch({ type: 'MIC_DENIED' });
      return;
    }
    dispatch({ type: 'MIC_OK' });
    audioCtx.current = new AudioContext();
    player.current = createPcmPlayer(audioCtx.current);
    queue.current = createAudioQueue(player.current);
    try {
      const started = await api.post<{ interviewId: string }>('/api/interviews/start', setup);
      interviewId.current = started.interviewId;
      startedAt.current = Date.now();
      recorder.current = createRecorder(stream, (chunk) => deepgram.current?.send(chunk));
      await connect();
      recorder.current.start();
      dispatch({ type: 'STARTED' });
      await runTurn(null, null);
    } catch (e) {
      stream.getTracks().forEach((t) => t.stop());
      dispatch({ type: 'FAILED', code: codeOf(e) });
    }
  }

  // ---------- Cronômetro e keep-alive ----------
  const active = ['interviewer_thinking', 'interviewer_speaking', 'listening'].includes(state.status);
  useEffect(() => {
    if (!active) return;
    const tick = setInterval(() => {
      const elapsed = (Date.now() - startedAt.current) / 1000;
      setSecondsLeft(Math.max(0, Math.ceil(INTERVIEW_SECONDS - elapsed)));
      if (elapsed >= CLIENT_CUTOFF_SECONDS) dispatch({ type: 'TIME_UP' });
    }, 500);
    const keepAlive = setInterval(() => {
      if (statusRef.current !== 'listening') deepgram.current?.keepAlive();
    }, KEEPALIVE_MS);
    return () => { clearInterval(tick); clearInterval(keepAlive); };
  }, [active]);

  // ---------- Encerramento ----------
  useEffect(() => {
    if (state.status !== 'finishing') return;
    teardown();
    if (!interviewId.current) return;
    api.post<{ status: 'completed' | 'abandoned' }>('/api/interviews/finish', { interviewId: interviewId.current })
      .then((r) => {
        dispatch({ type: 'FINISHED' });
        if (r.status === 'completed') navigate(`/resultado/${interviewId.current}`, { replace: true });
        else setTooShort(true);
      })
      .catch((e) => dispatch({ type: 'FAILED', code: codeOf(e) }));
  }, [state.status, teardown, navigate]);

  if (!setup) return <Navigate to="/nova" replace />;

  const mm = String(Math.floor(secondsLeft / 60)).padStart(1, '0');
  const ss = String(secondsLeft % 60).padStart(2, '0');

  if (state.status === 'idle' || (state.status === 'error' && state.error === 'mic_denied')) {
    return (
      <Card className="mx-auto max-w-lg space-y-4 text-center">
        <h1 className="text-xl font-semibold">{setup.job.title}{setup.job.company ? ` · ${setup.job.company}` : ''}</h1>
        <p className="text-sm text-slate-600">5 minutos, em inglês. Quando você clicar, vamos pedir acesso ao microfone e o entrevistador começa a falar.</p>
        <ErrorBox message={state.error ? errorMessage(state.error) : null} />
        <Button onClick={begin}>Começar agora</Button>
      </Card>
    );
  }

  if (tooShort) {
    return (
      <Card className="mx-auto max-w-lg space-y-4 text-center">
        <h1 className="text-xl font-semibold">Entrevista curta demais</h1>
        <p className="text-sm text-slate-600">Ela durou menos de 2 minutos, então não gerou resultado e não contou na sua cota.</p>
        <Link to="/"><Button>Voltar ao início</Button></Link>
      </Card>
    );
  }

  if (state.status === 'error') {
    const canFinish = !!interviewId.current;
    return (
      <Card className="mx-auto max-w-lg space-y-4 text-center">
        <ErrorBox message={errorMessage(state.error ?? 'upstream_failed')} />
        {canFinish
          ? <Button onClick={() => dispatch({ type: 'RETRY_FINISH' })}>{state.error === 'evaluation_failed' ? 'Tentar gerar o resultado de novo' : 'Encerrar e gerar resultado'}</Button>
          : <Link to="/"><Button variant="secondary">Voltar ao início</Button></Link>}
      </Card>
    );
  }

  return (
    <div className="mx-auto max-w-2xl space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <p className="text-sm text-slate-500">Entrevista para</p>
          <h1 className="text-lg font-semibold">{setup.job.title}</h1>
        </div>
        <div className={`rounded-lg px-3 py-1 font-mono text-2xl tabular-nums ${secondsLeft <= 30 ? 'bg-red-50 text-red-700' : 'bg-white text-slate-800 ring-1 ring-slate-200'}`}>
          {mm}:{ss}
        </div>
      </div>

      <Card className="space-y-6">
        <div className="flex items-center gap-3">
          <span className={`h-3 w-3 rounded-full ${state.status === 'listening' ? 'animate-pulse bg-emerald-500' : state.status === 'interviewer_speaking' ? 'animate-pulse bg-sky-500' : 'bg-slate-300'}`} />
          {state.status === 'finishing' || state.status === 'starting' || state.status === 'requesting_mic' || state.status === 'interviewer_thinking'
            ? <Spinner label={STATUS_LABEL[state.status]} />
            : <span className="text-sm font-medium text-slate-700">{STATUS_LABEL[state.status]}</span>}
        </div>

        <div className="space-y-1">
          <p className="text-xs font-semibold uppercase tracking-wide text-slate-400">Entrevistador</p>
          <p className="min-h-12 text-lg leading-relaxed text-slate-900">{interviewerText || '…'}</p>
        </div>

        <div className="space-y-1">
          <p className="text-xs font-semibold uppercase tracking-wide text-slate-400">Você</p>
          <p className="min-h-12 leading-relaxed text-slate-600">{state.status === 'listening' ? candidateText || 'Fale quando estiver pronto…' : candidateText}</p>
        </div>

        <div className="flex flex-wrap gap-3">
          <Button onClick={() => void sendCandidateTurn()} disabled={state.status !== 'listening'}>Terminei de responder</Button>
          <Button variant="secondary" disabled={state.status === 'finishing'}
            onClick={() => { if (window.confirm('Encerrar a entrevista agora? Com menos de 2 minutos ela não gera resultado.')) dispatch({ type: 'TIME_UP' }); }}>
            Encerrar entrevista
          </Button>
        </div>
      </Card>
    </div>
  );
}
