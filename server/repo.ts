import type { SupabaseClient } from '@supabase/supabase-js';
import type { Evaluation, Interview, JobSummary, ResumeSummary, Turn } from '../shared/types';

export interface Repo {
  getFreeUsed(userId: string): Promise<number>;
  abandonStale(userId: string, olderThan: Date): Promise<void>;
  /** Entrevistas `in_progress` ou `abandoned` criadas desde `since`. */
  countUnfinishedSince(userId: string, since: Date): Promise<number>;
  createInterview(userId: string, input: { job: JobSummary; resume: ResumeSummary; resumePath: string; startedAt: Date }): Promise<Interview>;
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
    async abandonStale(userId, olderThan) {
      check(await db.from('interviews').update({ status: 'abandoned', ended_at: new Date().toISOString() })
        .eq('user_id', userId).eq('status', 'in_progress').lt('started_at', olderThan.toISOString()));
    },
    async countUnfinishedSince(userId, since) {
      const res = await db.from('interviews').select('id', { count: 'exact', head: true })
        .eq('user_id', userId).in('status', ['in_progress', 'abandoned']).gte('created_at', since.toISOString());
      if (res.error) throw res.error;
      return res.count ?? 0;
    },
    async createInterview(userId, input) {
      const row = check(await db.from('interviews').insert({
        user_id: userId, status: 'in_progress', job: input.job, resume: input.resume,
        resume_path: input.resumePath, started_at: input.startedAt.toISOString(),
      }).select().single());
      return toInterview(row as InterviewRow);
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
