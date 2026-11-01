import type { SupabaseClient } from '@supabase/supabase-js';
import { FREE_LIMIT, UNFINISHED_DAILY_LIMIT } from '../shared/constants.js';
import type { Evaluation, Interview, JobSummary, ResumeSummary, Turn } from '../shared/types.js';

export type StartInput = { job: JobSummary; resume: ResumeSummary; resumePath: string; startedAt: Date };
/** `staleBefore`: in_progress iniciadas antes disso viram abandoned. `unfinishedSince`: janela das inacabadas. */
export type StartRules = { staleBefore: Date; unfinishedSince: Date };
export type StartResult = { ok: true; interview: Interview } | { ok: false; code: 'quota_exhausted' | 'too_many_unfinished' };

export interface Repo {
  getFreeUsed(userId: string): Promise<number>;
  /** Abandona as paradas, aplica a cota e cria a entrevista numa única transação (RPC start_interview). */
  startInterview(userId: string, input: StartInput, rules: StartRules): Promise<StartResult>;
  getInterview(userId: string, id: string): Promise<Interview | null>;
  listTurns(interviewId: string): Promise<Turn[]>;
  addTurn(interviewId: string, turn: Turn): Promise<void>;
  abandonInterview(id: string, endedAt: Date): Promise<void>;
  /** Grava o resultado e consome a cota de forma atômica e idempotente (RPC complete_interview). */
  completeInterview(id: string, evaluation: Evaluation): Promise<void>;
  getEvaluation(id: string): Promise<Evaluation | null>;
}

type InterviewRow = {
  id: string; user_id: string; status: Interview['status']; job: JobSummary; resume: ResumeSummary;
  resume_path: string; started_at: string;
};

const toInterview = (r: InterviewRow): Interview => ({
  id: r.id, userId: r.user_id, status: r.status, job: r.job, resume: r.resume,
  resumePath: r.resume_path, startedAt: new Date(r.started_at),
});

function check<T>(res: { data: T; error: unknown }): T {
  if (res.error) throw res.error;
  return res.data;
}

export function supabaseRepo(db: SupabaseClient): Repo {
  return {
    async getFreeUsed(userId) {
      const row = check(await db.from('profiles').select('free_interviews_used').eq('id', userId).maybeSingle());
      return row?.free_interviews_used ?? 0;
    },
    async startInterview(userId, input, rules) {
      const out = check(await db.rpc('start_interview', {
        p_user: userId, p_job: input.job, p_resume: input.resume, p_resume_path: input.resumePath,
        p_started_at: input.startedAt.toISOString(), p_stale_before: rules.staleBefore.toISOString(),
        p_unfinished_since: rules.unfinishedSince.toISOString(),
        p_free_limit: FREE_LIMIT, p_unfinished_limit: UNFINISHED_DAILY_LIMIT,
      })) as { ok: boolean; code?: 'quota_exhausted' | 'too_many_unfinished'; id?: string };
      if (!out.ok) return { ok: false, code: out.code! };
      return { ok: true, interview: { id: out.id!, userId, status: 'in_progress', ...input } };
    },
    async getInterview(userId, id) {
      const row = check(await db.from('interviews').select().eq('id', id).eq('user_id', userId).maybeSingle());
      return row ? toInterview(row as InterviewRow) : null;
    },
    async listTurns(interviewId) {
      const rows = check(await db.from('turns').select('seq, role, text, metrics').eq('interview_id', interviewId).order('seq'));
      return rows as Turn[];
    },
    async addTurn(interviewId, turn) {
      check(await db.from('turns').insert({ interview_id: interviewId, ...turn }));
    },
    async abandonInterview(id, endedAt) {
      check(await db.from('interviews').update({ status: 'abandoned', ended_at: endedAt.toISOString() }).eq('id', id));
    },
    async completeInterview(id, evaluation) {
      check(await db.rpc('complete_interview', { p_interview_id: id, p_evaluation: evaluation }));
    },
    async getEvaluation(id) {
      const row = check(await db.from('results').select('evaluation').eq('interview_id', id).maybeSingle());
      return (row?.evaluation as Evaluation | undefined) ?? null;
    },
  };
}
