import type { Deps, Llm, Storage, Tts } from '../../server/deps';
import { decideStart } from '../../server/quota';
import type { Repo, StartInput, StartResult, StartRules } from '../../server/repo';
import type { Evaluation, Interview, JobSummary, ResumeSummary, Turn } from '../../shared/types';

export const USER = 'user-1';
/** Nome de arquivo no formato que o frontend gera (uuid). */
export const FILE = '3f2a9c4e-1111-4222-8333-444455556666';
export const NOW = new Date('2026-10-31T12:00:00Z');

export const job: JobSummary = {
  title: 'Senior Backend Engineer', company: 'Acme', seniority: 'Senior',
  requirements: ['Node.js', 'PostgreSQL', 'automated testing'], stack: ['Node.js', 'AWS'], responsibilities: ['Build APIs'],
};
export const resume: ResumeSummary = {
  name: 'Ana', headline: 'Backend developer', skills: ['Node.js'],
  experiences: [{ company: 'Foo', role: 'Dev', highlights: ['Led a migration'] }],
};

export class MemoryRepo implements Repo {
  interviews = new Map<string, Interview>();
  turns = new Map<string, Turn[]>();
  evaluations = new Map<string, Evaluation>();
  freeUsed = new Map<string, number>();
  unfinishedLast24h = 0;
  private nextId = 1;

  async getFreeUsed(userId: string) { return this.freeUsed.get(userId) ?? 0; }
  async startInterview(userId: string, input: StartInput, rules: StartRules): Promise<StartResult> {
    const mine = [...this.interviews.values()].filter((i) => i.userId === userId);
    for (const i of mine) if (i.status === 'in_progress' && i.startedAt < rules.staleBefore) i.status = 'abandoned';
    const decision = decideStart({
      freeUsed: await this.getFreeUsed(userId),
      inProgress: mine.filter((i) => i.status === 'in_progress').length,
      unfinishedLast24h: this.unfinishedLast24h,
    });
    if (!decision.ok) return decision;
    const iv: Interview = { id: `iv-${this.nextId++}`, userId, status: 'in_progress', ...input };
    this.interviews.set(iv.id, iv);
    return { ok: true, interview: iv };
  }
  async getInterview(userId: string, id: string) {
    const iv = this.interviews.get(id);
    return iv && iv.userId === userId ? iv : null;
  }
  async listTurns(interviewId: string) { return [...(this.turns.get(interviewId) ?? [])]; }
  async addTurn(interviewId: string, turn: Turn) {
    this.turns.set(interviewId, [...(this.turns.get(interviewId) ?? []), turn]);
  }
  async abandonInterview(id: string) { this.interviews.get(id)!.status = 'abandoned'; }
  async completeInterview(id: string, evaluation: Evaluation) {
    if (this.evaluations.has(id)) return;
    this.evaluations.set(id, evaluation);
    const iv = this.interviews.get(id)!;
    iv.status = 'completed';
    this.freeUsed.set(iv.userId, (this.freeUsed.get(iv.userId) ?? 0) + 1);
  }
  async getEvaluation(id: string) { return this.evaluations.get(id) ?? null; }

  seed(partial: Partial<Interview> = {}): Interview {
    const iv: Interview = {
      id: `iv-${this.nextId++}`, userId: USER, status: 'in_progress', job, resume,
      resumePath: `${USER}/${FILE}.pdf`, startedAt: NOW, ...partial,
    };
    this.interviews.set(iv.id, iv);
    return iv;
  }
}

const unused = (name: string) => () => { throw new Error(`${name} não deveria ser chamado`); };

export function makeDeps(overrides: Partial<Deps> = {}): Deps & { repo: MemoryRepo } {
  const llm: Llm = { stream: unused('llm.stream') as never, json: unused('llm.json') as never, vision: unused('llm.vision') as never };
  const tts: Tts = { synthesize: unused('tts.synthesize') as never };
  const storage: Storage = { download: unused('storage.download') as never, removePrefix: unused('storage.removePrefix') as never };
  return {
    auth: async (req) => {
      if (req.headers.get('authorization') !== 'Bearer ok') {
        const { ApiError } = await import('../../server/errors');
        throw new ApiError(401, 'unauthorized');
      }
      return { userId: USER };
    },
    repo: new MemoryRepo(),
    llm, tts, storage,
    deepgram: { grant: unused('deepgram.grant') as never },
    fetchPage: unused('fetchPage') as never,
    pdfToText: unused('pdfToText') as never,
    prompt: async (name) => ({
      interviewer: 'INTERVIEWER job={{job}} resume={{resume}} remaining={{remainingSeconds}} phase={{phase}}',
      evaluator: 'EVALUATOR job={{job}} resume={{resume}} transcript={{transcript}} stats={{speechStats}}',
      'extract-job': 'EXTRACT_JOB {{text}}',
      'extract-resume': 'EXTRACT_RESUME {{text}}',
    })[name],
    now: () => NOW,
    ...overrides,
  } as Deps & { repo: MemoryRepo };
}

export function post(body: unknown, auth = true): Request {
  return new Request('http://test/api', {
    method: 'POST',
    headers: { 'content-type': 'application/json', ...(auth ? { authorization: 'Bearer ok' } : {}) },
    body: JSON.stringify(body),
  });
}
